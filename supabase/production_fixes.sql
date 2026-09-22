-- Migração de Homologação e Segurança para Produção
-- Execute no SQL Editor do Supabase.
--
-- ⚠️  A função handle_new_user definida aqui (item 3) foi SUPERADA por
--     supabase/fix_auditoria_2026_09.sql, que é a versão canônica única: ela
--     aplica o plano escolhido no cadastro, respeita a lista de usernames
--     reservados e é idempotente. Se executar este arquivo depois do
--     fix_auditoria, execute o fix_auditoria novamente em seguida.

-- 1. IMUTABILIDADE DA TRILHA DE AUDITORIA (system_logs)
revoke delete, truncate on table public.system_logs from anon, authenticated, public;
drop policy if exists "logs admin" on public.system_logs;
drop policy if exists "logs admin read" on public.system_logs;
drop policy if exists "logs admin insert" on public.system_logs;

create policy "logs admin read"
  on public.system_logs
  for select
  using (public.is_admin());

create policy "logs admin insert"
  on public.system_logs
  for insert
  with check (public.is_admin());

-- 2. AMPLIAR PAPÉIS DE USUÁRIO (RBAC REAL NO BANCO)
alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check
  check (role in ('admin', 'moderator', 'financial', 'composer'));

-- 3. GERAÇÃO ROBUSTA DE USERNAME NO CADASTRO (PREVENÇÃO DE COLISÃO)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := coalesce(new.raw_user_meta_data->'profile', '{}'::jsonb);
  base_username text;
  candidate_username text;
  counter integer := 1;
begin
  base_username := coalesce(
    nullif(p->>'username', ''),
    nullif(new.raw_user_meta_data->>'preferred_username', ''),
    'compositor-' || substr(new.id::text, 1, 8)
  );

  -- Normaliza caracteres
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_-]', '-', 'g'));
  base_username := regexp_replace(base_username, '-+', '-', 'g');
  base_username := trim(both '-' from base_username);
  if length(base_username) < 3 then
    base_username := 'compositor-' || substr(new.id::text, 1, 8);
  end if;

  candidate_username := base_username;
  while exists (select 1 from public.profiles where username = candidate_username) loop
    candidate_username := base_username || '-' || substr(new.id::text, 1, 4) || counter::text;
    counter := counter + 1;
  end loop;

  insert into public.profiles(
    user_id, username, name, stage_name, city, state, bio, experience_years,
    genres, instagram, youtube, website, photo_url, cover_photo_url
  ) values (
    new.id, candidate_username,
    coalesce(nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(nullif(p->>'stageName', ''), nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(p->>'city', ''), coalesce(p->>'state', ''), coalesce(p->>'bio', ''), coalesce(p->>'experienceYears', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb))), '{}'),
    coalesce(p->>'instagram', ''), coalesce(p->>'youtube', ''), coalesce(p->>'website', ''),
    coalesce(nullif(p->>'photo', ''), new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    coalesce(p->>'coverPhoto', '')
  );

  insert into public.private_profiles(user_id, email, whatsapp, cpf)
  values (new.id, coalesce(new.email, ''), coalesce(p->>'whatsapp', ''), coalesce(p->>'cpf', ''));

  insert into public.subscriptions(user_id, status)
  values (new.id, 'pending');

  insert into public.user_roles(user_id, role)
  values (new.id, 'composer');

  insert into public.user_preferences(user_id)
  values (new.id);

  return new;
end;
$$;

-- 4. RPC PARA CONSULTA GLOBAL DE TRANSAÇÕES PELO ADMIN
create or replace function public.get_admin_global_requests(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default null
)
returns table (
  id uuid,
  song_id uuid,
  song_title text,
  song_cover text,
  composer_id uuid,
  composer_name text,
  buyer_name text,
  buyer_stage_name text,
  cpf_cnpj text,
  buyer_email text,
  buyer_whatsapp text,
  buyer_city_state text,
  purpose text,
  message text,
  status text,
  agreed_value numeric,
  notes text,
  created_at timestamptz,
  payment_received_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := (greatest(p_page, 1) - 1) * greatest(p_page_size, 1);
  v_search text := nullif(trim(p_search), '');
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso restrito a administradores.';
  end if;

  return query
  with filtered as (
    select
      r.id,
      r.song_id,
      s.title as song_title,
      s.cover_url as song_cover,
      r.composer_id,
      p.name as composer_name,
      r.buyer_name,
      r.buyer_stage_name,
      r.cpf_cnpj,
      r.buyer_email,
      r.buyer_whatsapp,
      r.buyer_city_state,
      r.purpose,
      r.message,
      r.status,
      r.agreed_value,
      r.notes,
      r.created_at,
      r.payment_received_at,
      count(*) over() as total_count
    from public.interest_requests r
    left join public.songs s on s.id = r.song_id
    left join public.profiles p on p.user_id = r.composer_id
    where (p_status is null or p_status = 'all' or r.status = p_status)
      and (
        v_search is null
        or s.title ilike '%' || v_search || '%'
        or r.buyer_name ilike '%' || v_search || '%'
        or p.name ilike '%' || v_search || '%'
        or r.buyer_email ilike '%' || v_search || '%'
        or r.cpf_cnpj ilike '%' || v_search || '%'
      )
  )
  select *
  from filtered
  order by created_at desc
  limit p_page_size offset v_offset;
end;
$$;

revoke execute on function public.get_admin_global_requests(integer, integer, text, text) from public, anon;
grant execute on function public.get_admin_global_requests(integer, integer, text, text) to authenticated;

-- 5. RPC PARA CONSULTA GLOBAL DE LIBERAÇÕES PELO ADMIN
create or replace function public.get_admin_global_releases(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null
)
returns table (
  id uuid,
  request_id uuid,
  song_id uuid,
  song_title text,
  authors text,
  composer_name text,
  composer_cpf text,
  composer_city_state text,
  buyer_name text,
  buyer_document text,
  buyer_city_state text,
  agreed_value numeric,
  authorized_purpose text,
  release_type text,
  issue_date date,
  additional_conditions text,
  digital_signature text,
  document_code text,
  document_path text,
  document_hash text,
  template_version text,
  document_archived_at timestamptz,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := (greatest(p_page, 1) - 1) * greatest(p_page_size, 1);
  v_search text := nullif(trim(p_search), '');
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso restrito a administradores.';
  end if;

  return query
  with filtered as (
    select
      rel.*,
      count(*) over() as total_count
    from public.releases rel
    where (
      v_search is null
      or rel.song_title ilike '%' || v_search || '%'
      or rel.buyer_name ilike '%' || v_search || '%'
      or rel.composer_name ilike '%' || v_search || '%'
      or rel.document_code ilike '%' || v_search || '%'
      or rel.buyer_document ilike '%' || v_search || '%'
    )
  )
  select *
  from filtered
  order by created_at desc
  limit p_page_size offset v_offset;
end;
$$;

revoke execute on function public.get_admin_global_releases(integer, integer, text) from public, anon;
grant execute on function public.get_admin_global_releases(integer, integer, text) to authenticated;
