-- ==============================================================================
-- MERCADO DO COMPOSITOR — TESTE GRÁTIS DE 7 DIAS
-- ==============================================================================
-- Execute este script INTEIRO depois de recurring_subscriptions_2026_09_21.sql.
-- É idempotente.
--
-- O teste é iniciado somente depois que o Mercado Pago autoriza a assinatura
-- recorrente. A Edge Function agenda a primeira cobrança para 7 dias depois e
-- o webhook libera o catálogo imediatamente. Os campos abaixo também impedem
-- que a mesma conta reutilize o benefício depois de cancelar.
-- ==============================================================================

alter table public.subscriptions add column if not exists trial_started_at timestamptz;
alter table public.subscriptions add column if not exists trial_ends_at timestamptz;

comment on column public.subscriptions.trial_started_at is
  'Primeiro início de teste grátis da conta; não apagar ao cancelar ou expirar.';
comment on column public.subscriptions.trial_ends_at is
  'Fim do teste grátis concedido na primeira assinatura recorrente.';

-- Um teste cancelado não recebe a carência de renovação: ele termina na data
-- combinada. Depois da primeira cobrança, next_billing_date avança 30 dias e a
-- regra normal (incluindo tentativas do cartão) volta a valer.
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
            when trial_ends_at is not null
              and next_billing_date <= trial_ends_at::date then 0
            when auto_renew then greatest(7, p_grace_days)
            else greatest(0, p_grace_days)
          end)
        < current_date
    returning user_id, plan_name, next_billing_date, auto_renew, trial_ends_at
  ), notified as (
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    select
      user_id,
      case when trial_ends_at is not null and next_billing_date <= trial_ends_at::date
        then 'Teste grátis encerrado' else 'Assinatura vencida' end,
      case
        when trial_ends_at is not null and next_billing_date <= trial_ends_at::date
          then format('Seu teste grátis do %s terminou. Assine novamente para voltar ao catálogo público.', plan_name)
        when auto_renew
          then format('Não conseguimos cobrar a renovação do seu %s (vencido em %s). Atualize o cartão no Mercado Pago ou pague pela tela de assinatura para voltar ao catálogo público.',
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
    format('Seu %s vence em %s. Renove pela tela de assinatura para manter seu catálogo público.',
      plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
    'system', false, '/dashboard/assinatura'
  from public.subscriptions
  where status = 'active'
    and not auto_renew
    and not (trial_ends_at is not null and next_billing_date <= trial_ends_at::date)
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

