-- ==============================================================================
-- Comunicações essenciais — pagamentos e documentos
-- Execute DEPOIS de notification_delivery_2026_09_22.sql (usa a fila de e-mails).
--
--   1. Quitação: confirmar o recebimento de uma solicitação (status
--      pagamento_confirmado) não gerava aviso, então o e-mail de comprovante
--      prometido nas configurações nunca era enviado.
--   2. Termo de liberação: o e-mail apontava só para o painel. Agora aponta
--      para a página pública de validação, onde a cópia em PDF é baixada.
--   3. Faturas: toda cobrança mensal aprovada chegava como "Assinatura
--      ativada". Renovações passam a chegar como "Pagamento confirmado".
--
-- Os avisos usam o tipo 'system'/'release': apenas o tipo 'request' respeita a
-- preferência opcional emailNewRequest; os demais são sempre enviados.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. COMPROVANTE DE QUITAÇÃO
-- ------------------------------------------------------------------------------
create or replace function public.notify_request_payment_confirmed() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_song_title text;
begin
  select title into v_song_title from public.songs where id = new.song_id;
  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(
    new.composer_id,
    'Pagamento confirmado',
    format('Você confirmou o recebimento de R$ %s de %s pela obra "%s" em %s. O termo de liberação já pode ser emitido.',
      replace(to_char(coalesce(new.agreed_value,0),'FM999999990.00'),'.',','),
      coalesce(nullif(btrim(new.buyer_stage_name),''), btrim(new.buyer_name)),
      coalesce(v_song_title,''),
      to_char(coalesce(new.payment_received_at,now()) at time zone 'America/Sao_Paulo','DD/MM/YYYY "às" HH24:MI')),
    'system',
    false,
    '/dashboard/solicitacoes'
  );
  return new;
end $$;
revoke execute on function public.notify_request_payment_confirmed() from public,anon,authenticated;

drop trigger if exists notify_request_payment_confirmed on public.interest_requests;
create trigger notify_request_payment_confirmed after update of status on public.interest_requests
for each row
when (new.status = 'pagamento_confirmado' and old.status is distinct from 'pagamento_confirmado')
execute function public.notify_request_payment_confirmed();

-- ------------------------------------------------------------------------------
-- 2. CÓPIA DO TERMO DE LIBERAÇÃO
-- ------------------------------------------------------------------------------
create or replace function public.notify_release_issued() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(
    new.composer_id,
    'Termo de liberação emitido',
    format('O termo %s da obra "%s" foi emitido. Guarde este e-mail: pelo botão abaixo você baixa a cópia oficial em PDF e confere a autenticidade do documento a qualquer momento.',
      new.document_code, new.song_title),
    'release',
    false,
    '/validar/' || new.document_code
  );
  return new;
end $$;
revoke execute on function public.notify_release_issued() from public,anon,authenticated;
drop trigger if exists notify_release_issued on public.releases;
create trigger notify_release_issued after insert on public.releases
for each row execute function public.notify_release_issued();

-- ------------------------------------------------------------------------------
-- 3. FATURAS: RENOVAÇÃO x ATIVAÇÃO
-- ------------------------------------------------------------------------------
-- Mesma função de fix_auditoria_2026_09.sql; muda apenas o aviso do pagamento
-- aprovado quando a assinatura já estava ativa.
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
  select status = 'approved' into v_already_approved
  from public.subscription_payments
  where mp_payment_id = p_mp_payment_id;

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
