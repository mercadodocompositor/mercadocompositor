-- ==============================================================================
-- MERCADO DO COMPOSITOR — CORREÇÕES DA PÁGINA DE ASSINATURA (2026-09-21)
-- ==============================================================================
-- Execute INTEIRO depois de free_trial_2026_09_21.sql. É idempotente.
--
-- Resolve:
--   1. Teste grátis cuja 1ª cobrança foi recusada expirava no dia seguinte,
--      embora o Mercado Pago ainda fosse tentar cobrar o cartão por alguns
--      dias. A carência zero agora vale só para teste com renovação
--      cancelada; teste com renovação ativa tem a mesma carência de 7 dias.
--   2. Faturas estornadas/contestadas continuavam "pago" no histórico da
--      tela de assinatura (subscriptions.invoices só era escrito na aprovação).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Expiração: carência do teste grátis
-- ------------------------------------------------------------------------------
create or replace function public.expire_overdue_subscriptions(p_grace_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
begin
  with expired as (
    update public.subscriptions
    set status = 'pending', updated_at = now()
    where status = 'active'
      and next_billing_date is not null
      and next_billing_date
        + (case
            -- Teste cancelado: termina na data combinada.
            when trial_ends_at is not null
              and next_billing_date <= trial_ends_at::date
              and not auto_renew then 0
            -- Renovação ativa (inclusive fim do teste): o Mercado Pago ainda tenta cobrar.
            when auto_renew then greatest(7, p_grace_days)
            else greatest(0, p_grace_days)
          end)
        < current_date
    returning user_id, plan_name, next_billing_date, auto_renew, trial_ends_at
  ), notified as (
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    select
      user_id,
      case when trial_ends_at is not null and next_billing_date <= trial_ends_at::date and not auto_renew
        then 'Teste grátis encerrado' else 'Assinatura vencida' end,
      case
        when trial_ends_at is not null and next_billing_date <= trial_ends_at::date and not auto_renew
          then format('Seu teste grátis do %s terminou. Assine para voltar ao catálogo público.', plan_name)
        when auto_renew
          then format('Não conseguimos cobrar a renovação do seu %s (vencido em %s). Atualize o cartão no Mercado Pago ou assine novamente pela tela de assinatura para voltar ao catálogo público.',
            plan_name, to_char(next_billing_date, 'DD/MM/YYYY'))
        else format('Seu %s venceu em %s. Seu perfil e suas obras saíram do catálogo público até a renovação.',
          plan_name, to_char(next_billing_date, 'DD/MM/YYYY'))
      end,
      'system', false, '/dashboard/assinatura'
    from expired
    returning 1
  )
  select count(*) into v_expired from notified;

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  select user_id, 'Sua assinatura vence em breve',
    format('Seu %s vence em %s. Assine com renovação automática pela tela de assinatura para manter seu catálogo público.',
      plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
    'system', false, '/dashboard/assinatura'
  from public.subscriptions
  where status = 'active'
    and not auto_renew
    and next_billing_date = current_date + 3;

  if v_expired > 0 then
    insert into public.system_logs(category, title, description, actor, status)
    values ('financial', 'Assinaturas vencidas expiradas',
      format('%s assinatura(s) vencida(s) voltaram para pendente.', v_expired),
      'sistema', 'warning');
  end if;

  return v_expired;
end;
$$;

revoke execute on function public.expire_overdue_subscriptions(integer) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. Histórico de cobranças acompanha estornos e contestações
-- ------------------------------------------------------------------------------
-- subscription_payments é a fonte da verdade; subscriptions.invoices é a cópia
-- exibida ao compositor. Quando um pagamento vira refunded/charged_back, a
-- fatura correspondente (mesmo id) muda para "estornado".
create or replace function public.sync_invoice_status_on_reversal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('refunded', 'charged_back') and new.status is distinct from old.status then
    update public.subscriptions s
    set invoices = (
      select coalesce(jsonb_agg(
        case when elem->>'id' = new.mp_payment_id
          then elem || jsonb_build_object('status', 'estornado')
          else elem end
        order by ord
      ), '[]'::jsonb)
      from jsonb_array_elements(coalesce(s.invoices, '[]'::jsonb)) with ordinality as t(elem, ord)
    ),
    updated_at = now()
    where s.user_id = new.user_id
      and exists (
        select 1 from jsonb_array_elements(coalesce(s.invoices, '[]'::jsonb)) elem
        where elem->>'id' = new.mp_payment_id
      );
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_invoice_status_on_reversal() from public, anon, authenticated;

drop trigger if exists sync_invoice_status_on_reversal on public.subscription_payments;
create trigger sync_invoice_status_on_reversal
after update of status on public.subscription_payments
for each row execute function public.sync_invoice_status_on_reversal();

notify pgrst, 'reload schema';
