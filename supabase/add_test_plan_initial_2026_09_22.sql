-- ==============================================================================
-- MERCADO DO COMPOSITOR — PLANO INICIAL PARA TESTES (2026-09-22)
-- ==============================================================================
-- Adiciona um plano de baixo valor para validar o fluxo completo de assinatura,
-- cobrança recorrente, webhook e emissão de fatura no ambiente configurado.
-- É idempotente: pode ser executado novamente para restaurar sua configuração.

insert into public.subscription_plans (
  name,
  monthly_price,
  max_songs,
  is_active,
  sort_order,
  description,
  features
)
values (
  'Plano Inicial',
  1.00,
  1,
  true,
  0,
  'Plano de R$ 1,00 destinado exclusivamente a testes',
  array[
    'Plano exclusivo para testes',
    'Até 1 música publicada',
    'Validação do fluxo de assinatura e cobrança'
  ]
)
on conflict (name) do update set
  monthly_price = excluded.monthly_price,
  max_songs = excluded.max_songs,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  description = excluded.description,
  features = excluded.features,
  updated_at = now();

notify pgrst, 'reload schema';

-- Conferência:
-- select * from public.subscription_plans where name = 'Plano Inicial';
