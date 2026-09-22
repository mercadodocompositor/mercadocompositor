-- ====================================================================
-- MERCADO DO COMPOSITOR - INTEGRAÇÃO MERCADO PAGO
-- Tabela de Pagamentos de Assinatura, Idempotência e Auditoria
-- ====================================================================
-- ⚠️  Execute este script PRIMEIRO (ele cria a tabela subscription_payments) e
--     depois supabase/fix_auditoria_2026_09.sql, que substitui a função
--     process_mercadopago_payment daqui. A versão deste arquivo gravava a
--     notificação nas colunas `read`/`created_at` (a coluna é `is_read`) com
--     type 'success' (fora do check constraint): o insert lançava exceção e
--     derrubava a transação inteira, então NENHUM pagamento aprovado era
--     registrado em subscription_payments.
-- ====================================================================

-- 1. Tabela para registrar todos os pagamentos e transações do Mercado Pago
create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  mp_payment_id text not null,
  mp_preference_id text,
  status text not null, -- 'approved', 'pending', 'in_process', 'rejected', 'cancelled', 'refunded'
  status_detail text,
  payment_method text not null default 'mercadopago', -- 'pix', 'credit_card', 'ticket', etc.
  payment_type text, -- 'account_money', 'ticket', 'bank_transfer', 'credit_card', etc.
  card_last4 text,
  card_brand text,
  installments integer default 1,
  transaction_amount numeric(10,2) not null check(transaction_amount >= 0),
  net_received_amount numeric(10,2),
  plan_name text not null,
  external_reference text,
  payer_email text,
  payer_identification text,
  raw_payload jsonb not null default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscription_payments_mp_id_unique unique (mp_payment_id)
);

-- Índices para consultas rápidas
create index if not exists idx_subscription_payments_user_id on public.subscription_payments(user_id);
create index if not exists idx_subscription_payments_status on public.subscription_payments(status);
create index if not exists idx_subscription_payments_mp_id on public.subscription_payments(mp_payment_id);
create index if not exists idx_subscription_payments_created_at on public.subscription_payments(created_at desc);

-- 2. Habilitar RLS na tabela subscription_payments
alter table public.subscription_payments enable row level security;

-- Políticas de RLS
drop policy if exists "Compositor pode ler seus proprios pagamentos" on public.subscription_payments;
create policy "Compositor pode ler seus proprios pagamentos"
  on public.subscription_payments
  for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Apenas o service_role / admins podem inserir ou atualizar pagamentos diretamente
drop policy if exists "Admin ou service_role gerencia pagamentos" on public.subscription_payments;
create policy "Admin ou service_role gerencia pagamentos"
  on public.subscription_payments
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 3. Grants de permissão
grant select on public.subscription_payments to authenticated;

-- 4. Função segura para registrar ou atualizar pagamento e ativar assinatura
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
set search_path = public
as $$
declare
  v_next_billing_date date;
  v_invoice jsonb;
  v_current_invoices jsonb;
  v_updated_invoices jsonb;
begin
  -- Registra ou atualiza o pagamento de forma idempotente
  insert into public.subscription_payments (
    user_id,
    mp_payment_id,
    status,
    status_detail,
    payment_method,
    payment_type,
    card_last4,
    card_brand,
    transaction_amount,
    plan_name,
    paid_at,
    raw_payload,
    updated_at
  ) values (
    p_user_id,
    p_mp_payment_id,
    p_status,
    p_status_detail,
    p_payment_method,
    p_payment_type,
    p_card_last4,
    p_card_brand,
    p_transaction_amount,
    p_plan_name,
    p_paid_at,
    p_raw_payload,
    now()
  )
  on conflict (mp_payment_id) do update set
    status = excluded.status,
    status_detail = excluded.status_detail,
    paid_at = coalesce(excluded.paid_at, public.subscription_payments.paid_at),
    raw_payload = excluded.raw_payload,
    updated_at = now();

  -- Se o pagamento foi aprovado, ativa a assinatura e apensa a fatura
  if p_status = 'approved' then
    v_next_billing_date := current_date + interval '30 days';

    -- Monta a fatura correspondente
    v_invoice := jsonb_build_object(
      'id', p_mp_payment_id,
      'date', to_char(coalesce(p_paid_at, now()), 'YYYY-MM-DD'),
      'value', p_transaction_amount,
      'status', 'pago'
    );

    -- Recupera faturas atuais e adiciona a nova sem duplicar
    select coalesce(invoices, '[]'::jsonb)
    into v_current_invoices
    from public.subscriptions
    where user_id = p_user_id;

    if not exists (
      select 1
      from jsonb_array_elements(v_current_invoices) elem
      where elem->>'id' = p_mp_payment_id
    ) then
      v_updated_invoices := v_current_invoices || jsonb_build_array(v_invoice);
    else
      v_updated_invoices := v_current_invoices;
    end if;

    -- Atualiza os dados da assinatura do compositor
    update public.subscriptions
    set
      status = 'active',
      plan_name = p_plan_name,
      monthly_price = to_char(p_transaction_amount, 'FM999990.00'),
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

    -- Cria notificação ao usuário caso a tabela exista
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_notifications') then
      insert into public.user_notifications (user_id, title, message, type, read, created_at)
      values (
        p_user_id,
        'Assinatura ativada!',
        'Seu pagamento do ' || p_plan_name || ' foi aprovado com sucesso. Seu catálogo e recursos já estão liberados.',
        'success',
        false,
        now()
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'status', 'active',
      'plan_name', p_plan_name,
      'next_billing_date', v_next_billing_date
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'status', p_status,
    'message', 'Pagamento registrado sem alteração imediata da assinatura.'
  );
end;
$$;
