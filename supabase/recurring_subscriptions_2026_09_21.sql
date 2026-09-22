-- ==============================================================================
-- MERCADO DO COMPOSITOR — ASSINATURA RECORRENTE (MERCADO PAGO PREAPPROVAL)
-- ==============================================================================
-- Execute INTEIRO no SQL Editor do Supabase, DEPOIS de
-- production_readiness_2026_09_18.sql. É idempotente.
--
-- O compositor pode escolher entre:
--   * renovação automática no cartão (Assinaturas do Mercado Pago / preapproval);
--   * pagamento mensal avulso (Checkout Pro via Orders: Pix, cartão, boleto).
-- As duas formas passam por process_mercadopago_payment, que estende a
-- validade em 30 dias a cada cobrança aprovada.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Vínculo da assinatura com o preapproval do Mercado Pago
-- ------------------------------------------------------------------------------
-- Gravadas só pelo webhook/checkout (service_role). O compositor lê a própria
-- linha pela policy existente e não tem update em subscriptions.
alter table public.subscriptions add column if not exists mp_preapproval_id text;
alter table public.subscriptions add column if not exists mp_preapproval_status text;
alter table public.subscriptions add column if not exists auto_renew boolean not null default false;

create index if not exists idx_subscriptions_mp_preapproval_id
  on public.subscriptions(mp_preapproval_id);

-- ------------------------------------------------------------------------------
-- 2. Expiração considera a renovação automática
-- ------------------------------------------------------------------------------
-- Com renovação automática o Mercado Pago tenta de novo cobranças recusadas
-- por alguns dias; a carência é maior (7 dias) para não tirar do catálogo
-- quem ainda vai ser cobrado. O aviso prévio só vai para quem paga avulso.
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
        + (case when auto_renew then greatest(7, p_grace_days) else greatest(0, p_grace_days) end)
        < current_date
    returning user_id, plan_name, next_billing_date, auto_renew
  ), notified as (
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    select
      user_id,
      'Assinatura vencida',
      case when auto_renew
        then format('Não conseguimos cobrar a renovação do seu %s (vencido em %s). Atualize o cartão no Mercado Pago ou pague pela tela de assinatura para voltar ao catálogo público.',
          plan_name, to_char(next_billing_date, 'DD/MM/YYYY'))
        else format('Seu %s venceu em %s. Seu perfil e suas obras saíram do catálogo público até a renovação.',
          plan_name, to_char(next_billing_date, 'DD/MM/YYYY'))
      end,
      'system',
      false,
      '/dashboard/assinatura'
    from expired
    returning 1
  )
  select count(*) into v_expired from notified;

  -- Aviso prévio: executada uma vez por dia, cada assinatura avulsa recebe um aviso.
  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  select
    user_id,
    'Sua assinatura vence em breve',
    format('Seu %s vence em %s. Renove pela tela de assinatura para manter seu catálogo público.',
      plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
    'system',
    false,
    '/dashboard/assinatura'
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

notify pgrst, 'reload schema';
