-- ==============================================================================
-- CORREÇÃO DE DESVIO DE ESQUEMA: public.user_roles.created_at
-- ==============================================================================
-- O schema declara `created_at` em `user_roles`, mas instâncias criadas antes
-- dessa coluna nunca a receberam: `create table if not exists` não adiciona
-- colunas a uma tabela existente. Como `loadTeamRoles()` seleciona `created_at`,
-- a consulta falhava sempre e a aba de Equipe caía no membro fictício de
-- fallback — mascarando o erro.
--
-- Idempotente: pode ser executado com segurança mesmo onde a coluna já existe.

alter table public.user_roles
  add column if not exists created_at timestamptz not null default now();
