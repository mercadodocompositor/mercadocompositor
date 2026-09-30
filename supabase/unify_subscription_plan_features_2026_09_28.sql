-- =============================================================================
-- Unifica os recursos dos planos comerciais.
-- A quantidade de músicas diferencia Bronze, Prata e Ouro; somente o Ouro
-- recebe elegibilidade para destaque no catálogo público.
-- É idempotente e não altera preços, limites ou assinaturas existentes.
-- =============================================================================

update public.subscription_plans
set features = array[
  'Até 100 músicas no catálogo',
  'Player com prévias protegidas de 85 segundos',
  'Contato direto com artistas',
  'Emissão de liberações digitais',
  'Gestão de solicitações e negociações',
  'Estatísticas completas'
]
where name = 'Plano Bronze';

update public.subscription_plans
set features = array[
  'Até 200 músicas no catálogo',
  'Player com prévias protegidas de 85 segundos',
  'Contato direto com artistas',
  'Emissão de liberações digitais',
  'Gestão de solicitações e negociações',
  'Estatísticas completas'
]
where name = 'Plano Prata';

update public.subscription_plans
set features = array[
  'Músicas ilimitadas no catálogo',
  'Player com prévias protegidas de 85 segundos',
  'Contato direto com artistas',
  'Emissão de liberações digitais',
  'Gestão de solicitações e negociações',
  'Estatísticas completas',
  'Elegibilidade para destaque no catálogo público'
]
where name = 'Plano Ouro';

notify pgrst, 'reload schema';
