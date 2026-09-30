-- =============================================================================
-- MERCADO DO COMPOSITOR — RECURSOS DOS PLANOS: 8 ITENS POR CARD (2026-09-28)
-- =============================================================================
-- Cada card lista 8 recursos que já existem na plataforma. Os itens comuns se
-- repetem em todos os planos; muda o limite de músicas e, no Ouro, a
-- elegibilidade para destaque. Não altera preços, limites nem assinaturas.
-- É idempotente.

update public.subscription_plans
set features = array[
  'Até 100 músicas no catálogo',
  'Perfil público do Compositor',
  'Prévia protegida de 85 segundos com letra completa',
  'Contato direto com artistas, com aviso por e-mail',
  'Gestão de solicitações e negociações',
  'Termo de liberação em PDF com validação de autenticidade',
  'Entrega da obra completa por link seguro',
  'Estatísticas completas'
],
    updated_at = now()
where name = 'Plano Bronze';

update public.subscription_plans
set features = array[
  'Até 200 músicas no catálogo',
  'Perfil público do Compositor',
  'Prévia protegida de 85 segundos com letra completa',
  'Contato direto com artistas, com aviso por e-mail',
  'Gestão de solicitações e negociações',
  'Termo de liberação em PDF com validação de autenticidade',
  'Entrega da obra completa por link seguro',
  'Estatísticas completas'
],
    updated_at = now()
where name = 'Plano Prata';

update public.subscription_plans
set features = array[
  'Músicas ilimitadas no catálogo',
  'Perfil público do Compositor',
  'Prévia protegida de 85 segundos com letra completa',
  'Contato direto com artistas, com aviso por e-mail',
  'Gestão de solicitações e negociações',
  'Termo de liberação em PDF com validação de autenticidade',
  'Entrega da obra completa por link seguro',
  'Estatísticas completas e elegibilidade para destaque no catálogo público'
],
    updated_at = now()
where name = 'Plano Ouro';

notify pgrst, 'reload schema';
