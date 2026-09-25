-- Descomissiona a integração de pagamento anterior sem apagar o histórico
-- financeiro (payment_transactions e subscriptions.invoices).
--
-- IMPORTANTE: antes de executar, cancele no provedor todas as cobranças ou
-- assinaturas recorrentes ainda ativas. Remover o webhook ou as credenciais
-- não cancela cobranças já agendadas no sistema externo.

begin;

drop function if exists public.process_mercadopago_payment(
  uuid, text, text, text, text, text, text, text, numeric, text, timestamptz, jsonb
);

drop index if exists public.idx_subscriptions_mp_preapproval_id;

alter table if exists public.subscriptions
  drop column if exists mp_preapproval_id,
  drop column if exists mp_preapproval_status,
  drop column if exists auto_renew;

commit;
