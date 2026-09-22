-- ==============================================================================
-- Sanitização de dados de teste / informais em perfis públicos de produção
-- Executar no SQL Editor do Painel Supabase
-- ==============================================================================

-- 1. Atualiza o perfil oficial 'mercado' caso ainda contenha texto residual de teste
update public.profiles
set bio = 'Perfil de curadoria oficial do Mercado do Compositor, reunindo obras selecionadas em diversos gêneros prontas para liberação e gravação fonográfica imediata.'
where username = 'mercado'
  and (bio ilike '%teste%' or bio is null or length(trim(bio)) < 15);

-- 2. Atualiza perfis com biografias em branco para mensagem profissional padrão
update public.profiles
set bio = coalesce(stage_name, 'Compositor') || ' é um compositor oficial cadastrado na plataforma Mercado do Compositor, disponibilizando suas obras autorais para audição e liberação fonográfica.'
where (bio is null or trim(bio) = '' or bio ilike 'teste de biografia%')
  and username != 'mercado';

-- 3. Limpa espaços indevidos antes de pontuação final nas biografias existentes
update public.profiles
set bio = regexp_replace(bio, '\s+([.,;:!?])', '\1', 'g')
where bio ~ '\s+[.,;:!?]';
