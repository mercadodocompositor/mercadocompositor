-- ==============================================================================
-- Cópia do termo para o intérprete e aviso de cobrança recusada
-- Execute DEPOIS de essential_notifications_2026_09_22.sql.
--
--   1. O intérprete (comprador) não tem conta: ao emitir o termo, ele passa a
--      receber no e-mail informado na solicitação o link da página pública de
--      validação, onde baixa a cópia oficial em PDF. O envio automático não
--      substitui a confirmação manual de envio (sent_to_buyer_at).
--   2. Cobrança recusada pelo Mercado Pago só era percebida no vencimento da
--      carência. Agora o compositor é avisado na hora (no máximo um aviso a
--      cada 20 horas, porque o Mercado Pago faz novas tentativas).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. FILA DE E-MAILS ACEITA DESTINATÁRIO SEM CONTA
-- ------------------------------------------------------------------------------
-- E-mails ao comprador não nascem de user_notifications. user_id continua sendo
-- o compositor dono da liberação, para a exclusão da conta levar a fila junto.
alter table public.notification_email_outbox alter column notification_id drop not null;
alter table public.notification_email_outbox add column if not exists audience text not null default 'account';
alter table public.notification_email_outbox add column if not exists release_id uuid references public.releases(id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_audience_check') then
    alter table public.notification_email_outbox add constraint notification_email_outbox_audience_check
      check (audience in ('account','buyer'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_release_id_key') then
    alter table public.notification_email_outbox add constraint notification_email_outbox_release_id_key unique (release_id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_origin_check') then
    alter table public.notification_email_outbox add constraint notification_email_outbox_origin_check
      check (notification_id is not null or release_id is not null);
  end if;
end $$;

-- ------------------------------------------------------------------------------
-- 2. TERMO EMITIDO: AVISO AO COMPOSITOR + CÓPIA AO INTÉRPRETE
-- ------------------------------------------------------------------------------
create or replace function public.notify_release_issued() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_buyer_email text;
  v_buyer_ok boolean;
begin
  select lower(btrim(ir.buyer_email)) into v_buyer_email
  from public.interest_requests ir where ir.id = new.request_id;
  v_buyer_ok := coalesce(v_buyer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', false);

  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(
    new.composer_id,
    'Termo de liberação emitido',
    format('O termo %s da obra "%s" foi emitido. Guarde este e-mail: pelo botão abaixo você baixa a cópia oficial em PDF e confere a autenticidade do documento a qualquer momento.%s',
      new.document_code, new.song_title,
      case when v_buyer_ok then ' Uma cópia com o mesmo link também foi enviada ao e-mail informado pelo intérprete.' else '' end),
    'release',
    false,
    '/validar/' || new.document_code
  );

  if v_buyer_ok then
    insert into public.notification_email_outbox(user_id,recipient,subject,body,action_url,audience,release_id)
    values(
      new.composer_id,
      v_buyer_email,
      format('Termo de liberação da obra "%s"', new.song_title),
      format('Olá, %s. %s emitiu o termo de liberação %s da obra "%s", no valor acordado de R$ %s. Pelo botão abaixo você baixa a cópia oficial em PDF e confere a autenticidade do documento a qualquer momento. Guarde este e-mail.',
        new.buyer_name, new.composer_name, new.document_code, new.song_title,
        replace(to_char(coalesce(new.agreed_value,0),'FM999999990.00'),'.',',')),
      '/validar/' || new.document_code,
      'buyer',
      new.id
    )
    on conflict (release_id) do nothing;
  end if;
  return new;
end $$;
revoke execute on function public.notify_release_issued() from public,anon,authenticated;

-- ------------------------------------------------------------------------------
-- 3. COBRANÇA RECUSADA
-- ------------------------------------------------------------------------------
-- Mesma função de essential_notifications_2026_09_22.sql, com o aviso de
-- pagamento recusado.
create or replace function public.process_mercadopago_payment(
  p_user_id uuid,
  p_mp_payment_id text,
  p_status text,
  p_status_detail text,
  p_payment_method text,
  p_payment_type text,
  p_card_last4 text,
  p_card_brand text,
  p_transaction_amount numeric,
  p_plan_name text,
  p_paid_at timestamptz,
  p_raw_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_billing_date date;
  v_current_next_billing date;
  v_invoice jsonb;
  v_current_invoices jsonb;
  v_updated_invoices jsonb;
  v_plan_name text;
  v_already_approved boolean;
  v_was_active boolean;
  v_previous_status text;
  v_auto_renew boolean;
  v_sub_status text;
  v_sub_next_billing date;
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception using errcode = 'P0002',
      message = format('Usuário %s não encontrado para vincular o pagamento.', p_user_id);
  end if;

  -- O nome do plano é FK de subscriptions.plan_name: um valor desconhecido
  -- (plano renomeado entre o checkout e a notificação) abortaria a transação.
  select name into v_plan_name from public.subscription_plans where name = p_plan_name;
  if v_plan_name is null then
    select plan_name into v_plan_name from public.subscriptions where user_id = p_user_id;
  end if;
  v_plan_name := coalesce(v_plan_name, 'Plano Bronze');

  -- Idempotência: reentrega do mesmo evento não deve gerar fatura duplicada
  -- nem estender a validade outra vez.
  select status into v_previous_status
  from public.subscription_payments
  where mp_payment_id = p_mp_payment_id;
  v_already_approved := v_previous_status = 'approved';

  insert into public.subscription_payments (
    user_id, mp_payment_id, status, status_detail, payment_method, payment_type,
    card_last4, card_brand, transaction_amount, plan_name, paid_at, raw_payload, updated_at
  ) values (
    p_user_id, p_mp_payment_id, p_status, p_status_detail, p_payment_method, p_payment_type,
    p_card_last4, p_card_brand, coalesce(p_transaction_amount, 0), v_plan_name, p_paid_at,
    coalesce(p_raw_payload, '{}'::jsonb), now()
  )
  on conflict (mp_payment_id) do update set
    status = excluded.status,
    status_detail = excluded.status_detail,
    paid_at = coalesce(excluded.paid_at, public.subscription_payments.paid_at),
    raw_payload = excluded.raw_payload,
    updated_at = now();

  if p_status = 'approved' then
    if coalesce(v_already_approved, false) then
      return jsonb_build_object('success', true, 'status', 'active', 'idempotent', true,
        'message', 'Pagamento já processado anteriormente.');
    end if;

    -- Renovação antecipada preserva os dias restantes do ciclo já pago.
    select next_billing_date, status = 'active' into v_current_next_billing, v_was_active
    from public.subscriptions where user_id = p_user_id;
    v_next_billing_date := greatest(coalesce(v_current_next_billing, current_date), current_date) + interval '30 days';

    v_invoice := jsonb_build_object(
      'id', p_mp_payment_id,
      'date', to_char(coalesce(p_paid_at, now()), 'YYYY-MM-DD'),
      'value', coalesce(p_transaction_amount, 0),
      'status', 'pago'
    );

    select coalesce(invoices, '[]'::jsonb) into v_current_invoices
    from public.subscriptions where user_id = p_user_id;

    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_current_invoices, '[]'::jsonb)) elem
      where elem->>'id' = p_mp_payment_id
    ) then
      v_updated_invoices := coalesce(v_current_invoices, '[]'::jsonb) || jsonb_build_array(v_invoice);
    else
      v_updated_invoices := v_current_invoices;
    end if;

    update public.subscriptions set
      status = 'active',
      plan_name = v_plan_name,
      -- Mesmo formato do default do schema ('24,90').
      monthly_price = replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
      payment_method = case
        when p_payment_method ilike '%pix%' or p_payment_type = 'bank_transfer' then 'Pix'
        else 'Cartão de Crédito'
      end,
      card_last4 = p_card_last4,
      card_brand = p_card_brand,
      next_billing_date = v_next_billing_date,
      invoices = v_updated_invoices,
      updated_at = now()
    where user_id = p_user_id;

    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (
      p_user_id,
      case when coalesce(v_was_active, false) then 'Pagamento confirmado' else 'Assinatura ativada' end,
      case when coalesce(v_was_active, false)
        then format('Recebemos o pagamento de R$ %s do %s (fatura #%s). Seu plano está garantido até %s.',
          replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
          v_plan_name, p_mp_payment_id, to_char(v_next_billing_date, 'DD/MM/YYYY'))
        else format('Seu pagamento de R$ %s do %s foi aprovado (fatura #%s). O catálogo e os recursos do plano já estão liberados até %s.',
          replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
          v_plan_name, p_mp_payment_id, to_char(v_next_billing_date, 'DD/MM/YYYY'))
      end,
      'system',
      false,
      '/dashboard/assinatura'
    );

    insert into public.system_logs(category, title, description, actor, status)
    values (
      'financial',
      format('Pagamento Mercado Pago aprovado (%s)', v_plan_name),
      format('Pagamento #%s de R$ %s confirmado. Assinatura ativa até %s.',
        p_mp_payment_id,
        replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
        to_char(v_next_billing_date, 'DD/MM/YYYY')),
      p_user_id::text,
      'success'
    );

    return jsonb_build_object(
      'success', true,
      'status', 'active',
      'plan_name', v_plan_name,
      'next_billing_date', v_next_billing_date
    );
  end if;

  -- Estorno e contestação suspendem a assinatura: antes ela permanecia ativa
  -- para sempre depois do primeiro pagamento aprovado.
  if p_status in ('refunded', 'charged_back') then
    update public.subscriptions
    set status = 'suspended', updated_at = now()
    where user_id = p_user_id and status = 'active';

    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (
      p_user_id,
      'Assinatura suspensa',
      format('O pagamento #%s foi %s. Seu perfil público e suas obras ficaram ocultos até a regularização.',
        p_mp_payment_id,
        case p_status when 'refunded' then 'estornado' else 'contestado' end),
      'system',
      false,
      '/dashboard/assinatura'
    );

    insert into public.system_logs(category, title, description, actor, status)
    values ('financial', 'Assinatura suspensa por estorno/contestação',
      format('Pagamento #%s com status %s. Assinatura do usuário %s suspensa.', p_mp_payment_id, p_status, p_user_id),
      p_user_id::text, 'warning');

    return jsonb_build_object('success', true, 'status', 'suspended', 'mp_status', p_status);
  end if;

  -- Recusa: avisa na hora, sem repetir na reentrega do mesmo evento nem a cada
  -- nova tentativa do Mercado Pago no mesmo dia.
  if p_status = 'rejected' and v_previous_status is distinct from 'rejected' and not exists (
    select 1 from public.user_notifications
    where user_id = p_user_id and title = 'Pagamento recusado' and created_at > now() - interval '20 hours'
  ) then
    select auto_renew, status, next_billing_date into v_auto_renew, v_sub_status, v_sub_next_billing
    from public.subscriptions where user_id = p_user_id;

    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (
      p_user_id,
      'Pagamento recusado',
      case when coalesce(v_auto_renew, false) and v_sub_status = 'active'
        then format('Não conseguimos cobrar R$ %s da renovação do seu %s no cartão. O Mercado Pago tentará novamente nos próximos dias; para não sair do catálogo, atualize o cartão no Mercado Pago ou pague pela tela de assinatura%s.',
          replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','), v_plan_name,
          case when v_sub_next_billing is null then ''
            else ' até ' || to_char(v_sub_next_billing + 7, 'DD/MM/YYYY') end)
        else format('Seu pagamento de R$ %s do %s não foi aprovado pelo Mercado Pago e nada foi cobrado. Tente novamente pela tela de assinatura, com outro cartão ou Pix.',
          replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','), v_plan_name)
      end,
      'system',
      false,
      '/dashboard/assinatura'
    );
  end if;

  insert into public.system_logs(category, title, description, actor, status)
  values ('financial', format('Pagamento Mercado Pago: %s', p_status),
    format('Pagamento #%s de R$ %s (%s) registrado com status %s.',
      p_mp_payment_id,
      replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
      v_plan_name, p_status),
    p_user_id::text, 'info');

  return jsonb_build_object(
    'success', true,
    'status', p_status,
    'message', 'Pagamento registrado sem alteração imediata da assinatura.'
  );
end;
$$;

revoke execute on function public.process_mercadopago_payment(
  uuid, text, text, text, text, text, text, text, numeric, text, timestamptz, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
