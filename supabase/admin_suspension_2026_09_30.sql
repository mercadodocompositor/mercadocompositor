-- ==============================================================================
-- Suspensão administrativa que não é desfeita pelo Stripe
-- Execute depois de stripe_integration_2026_09_23.sql. É idempotente.
--
-- "Suspender" no painel só gravava subscriptions.status. No evento seguinte do
-- Stripe (a fatura mensal), o stripe-webhook regravava o status a partir do
-- Stripe e a conta voltava a "ativa" sozinha. Agora a suspensão feita por
-- admin/financeiro fica marcada em admin_suspended_at e, enquanto a marca
-- existir, nenhuma rotina de serviço reativa a assinatura. A marca sai quando
-- o admin muda o status para outro valor.
-- A suspensão não cancela a cobrança: isso continua sendo feito no Stripe.
-- ==============================================================================

alter table public.subscriptions add column if not exists admin_suspended_at timestamptz;

create or replace function public.guard_admin_suspension() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.can_manage_composer_subscriptions() then
    if new.status is distinct from old.status then
      new.admin_suspended_at := case when new.status = 'suspended' then coalesce(old.admin_suspended_at, now()) else null end;
    else
      new.admin_suspended_at := old.admin_suspended_at;
    end if;
    return new;
  end if;

  -- Webhook e rotinas internas não criam nem removem a marca.
  new.admin_suspended_at := old.admin_suspended_at;
  if old.admin_suspended_at is not null and new.status = 'active' then
    new.status := 'suspended';
  end if;
  return new;
end $$;
revoke execute on function public.guard_admin_suspension() from public, anon, authenticated;

drop trigger if exists guard_admin_suspension on public.subscriptions;
create trigger guard_admin_suspension
before update on public.subscriptions
for each row execute function public.guard_admin_suspension();

notify pgrst, 'reload schema';
