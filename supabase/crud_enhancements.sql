-- ==============================================================================
-- MERCADO DO COMPOSITOR - CRUD ENHANCEMENTS & COMPLIANCE MIGRATION
-- ==============================================================================

-- 1. EXTENSÃO E CONFIGURAÇÃO DA TABELA DE PLANOS DINÂMICOS
alter table public.subscription_plans
  add column if not exists description text not null default '',
  add column if not exists features text[] not null default '{}';

-- 2. FLEXIBILIZAÇÃO DAS FUNÇÕES DE EQUIPE (RBAC)
alter table public.user_roles
  drop constraint if exists user_roles_role_check;

alter table public.user_roles
  add constraint user_roles_role_check
  check (role in ('admin', 'moderator', 'financial', 'composer'));

-- 3. SOLICITAÇÕES FORMAIS DE EXCLUSÃO DE CONTA (LGPD)
create table if not exists public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text not null,
  user_name text not null default '',
  reason text,
  status text not null default 'pendente' check (status in ('pendente', 'em_analise', 'concluida', 'rejeitada')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  admin_notes text,
  updated_at timestamptz not null default now()
);

create index if not exists account_deletion_requests_user_idx
  on public.account_deletion_requests(user_id);
create index if not exists account_deletion_requests_status_idx
  on public.account_deletion_requests(status, created_at desc);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion requests owner create" on public.account_deletion_requests;
create policy "deletion requests owner create" on public.account_deletion_requests
  for insert with check (auth.uid() = user_id);

drop policy if exists "deletion requests owner read" on public.account_deletion_requests;
create policy "deletion requests owner read" on public.account_deletion_requests
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "deletion requests admin update" on public.account_deletion_requests;
create policy "deletion requests admin update" on public.account_deletion_requests
  for update using (public.is_admin()) with check (public.is_admin());

grant select, insert on public.account_deletion_requests to authenticated;
grant update on public.account_deletion_requests to authenticated;


-- 4. CENTRAL DE NOTIFICAÇÕES INTERNAS DO USUÁRIO
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'system' check (type in ('request', 'release', 'moderation', 'system')),
  is_read boolean not null default false,
  link text,
  created_at timestamptz not null default now()
);

create index if not exists user_notifications_user_idx
  on public.user_notifications(user_id, is_read, created_at desc);

alter table public.user_notifications enable row level security;

drop policy if exists "notifications owner all" on public.user_notifications;
create policy "notifications owner all" on public.user_notifications
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update, delete on public.user_notifications to authenticated;


-- 5. RPCS DE GERENCIAMENTO DE EQUIPE & PAPÉIS (ADMIN)
create or replace function public.admin_assign_user_role(
  p_email text,
  p_role text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target_user_id uuid;
  v_role_normalized text;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso negado: privilégio de administrador necessário.';
  end if;

  v_role_normalized := lower(trim(p_role));
  if v_role_normalized not in ('admin', 'moderator', 'financial') then
    raise exception using errcode = '22023', message = 'Função inválida. Escolha entre admin, moderator ou financial.';
  end if;

  -- Conceder acesso administrativo é escalonamento de privilégio: exige sessão
  -- reautenticada, igual ao bloco de governança (mantenha os dois em sincronia).
  if v_role_normalized = 'admin' then
    if coalesce((auth.jwt() ->> 'iat')::bigint, 0) < extract(epoch from now() - interval '5 minutes')::bigint then
      raise exception using errcode = '42501', message = 'Reautenticação recente necessária.';
    end if;
  end if;

  select id into v_target_user_id from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  if v_target_user_id is null then
    -- Tenta busca alternativa em private_profiles
    select user_id into v_target_user_id from public.private_profiles where lower(email) = lower(trim(p_email)) limit 1;
  end if;

  if v_target_user_id is null then
    raise exception using errcode = 'P0002', message = 'Usuário com este e-mail não foi encontrado.';
  end if;

  insert into public.user_roles(user_id, role)
  values (v_target_user_id, v_role_normalized)
  on conflict (user_id, role) do nothing;

  return jsonb_build_object(
    'success', true,
    'userId', v_target_user_id,
    'email', lower(trim(p_email)),
    'role', v_role_normalized
  );
end;
$$;

grant execute on function public.admin_assign_user_role(text, text) to authenticated;

-- Mantém as travas de autopreservação do bloco de governança: este arquivo é
-- avulso e, se rodado depois dele, um "create or replace" mais permissivo
-- removeria silenciosamente as proteções. Qualquer alteração aqui precisa ser
-- espelhada em admin_settings_governance.sql.
create or replace function public.admin_revoke_user_role(
  p_user_id uuid,
  p_role text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  n bigint;
  r text := lower(btrim(p_role));
  jwt_iat bigint;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso negado: privilégio de administrador necessário.';
  end if;
  if r not in ('admin', 'moderator', 'financial') then
    raise exception using errcode = '23514', message = 'Papel inválido.';
  end if;

  -- Serializa as revogações para que duas remoções simultâneas não consigam
  -- passar pela contagem de administradores e zerar a lista.
  perform pg_advisory_xact_lock(hashtext('admin-role-governance'));

  if r = 'admin' then
    if p_user_id = auth.uid() then
      raise exception using errcode = '23514', message = 'Você não pode revogar seu próprio acesso administrativo.';
    end if;
    select count(*) into n from public.user_roles where role = 'admin';
    if n <= 1 then
      raise exception using errcode = '23514', message = 'A plataforma deve manter pelo menos um administrador.';
    end if;
    jwt_iat := coalesce((auth.jwt() ->> 'iat')::bigint, 0);
    if jwt_iat < extract(epoch from now() - interval '5 minutes')::bigint then
      raise exception using errcode = '42501', message = 'Reautenticação recente necessária.';
    end if;
  end if;

  delete from public.user_roles
  where user_id = p_user_id and role = r;
  if not found then
    raise exception using errcode = 'P0002', message = 'Papel não encontrado para este usuário.';
  end if;

  perform public.write_system_audit_log(gen_random_uuid()::text, 'auth', 'Papel administrativo revogado',
    concat('Papel ', r, ' revogado do usuário ', p_user_id), 'warning');
  return jsonb_build_object('success', true);
end;
$$;

revoke execute on function public.admin_revoke_user_role(uuid, text) from public, anon;
grant execute on function public.admin_revoke_user_role(uuid, text) to authenticated;
