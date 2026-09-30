-- =============================================================================
-- MERCADO DO COMPOSITOR — REMOÇÃO DO PLANO INICIAL DE TESTES (2026-09-28)
-- =============================================================================
-- O plano de R$ 1,00 servia apenas para validar o fluxo de cobrança.
-- Assinaturas que ainda apontam para ele passam ao Plano Bronze antes da
-- exclusão, pois subscriptions.plan_name tem FK com ON DELETE RESTRICT.
-- É idempotente: pode ser executado novamente sem efeito.

begin;

update public.subscriptions
set plan_name = 'Plano Bronze',
    monthly_price = '24,90',
    updated_at = now()
where plan_name = 'Plano Inicial';

delete from public.subscription_plans
where name = 'Plano Inicial';

commit;

notify pgrst, 'reload schema';

-- Conferência (ambas devem retornar 0):
-- select count(*) from public.subscription_plans where name = 'Plano Inicial';
-- select count(*) from public.subscriptions where plan_name = 'Plano Inicial';
