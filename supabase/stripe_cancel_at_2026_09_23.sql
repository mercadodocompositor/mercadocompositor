-- Guarda o cancelamento agendado pelo Portal do Cliente do Stripe
-- (cancel_at / cancel_at_period_end): a assinatura segue ativa até essa data
-- e a tela de assinatura avisa quando ela termina.
-- Requer stripe_integration_2026_09_23.sql. Aplique ANTES de publicar o stripe-webhook novo.

alter table public.subscriptions
  add column if not exists stripe_cancel_at timestamptz;
