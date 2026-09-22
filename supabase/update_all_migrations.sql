-- ==============================================================================
-- MERCADO DO COMPOSITOR - SCRIPT CONSOLIDADO DE ATUALIZAÇÃO DO SUPABASE
-- Execute este script completo no "SQL Editor" do painel do Supabase.
-- É totalmente idempotente: pode ser executado múltiplas vezes sem perda de dados.
-- ==============================================================================

create extension if not exists citext;
create extension if not exists pgcrypto;

-- 1. FUNÇÕES AUXILIARES E VERIFICAÇÃO DE ADMINISTRADOR
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  );
$$;
grant execute on function public.is_admin() to anon, authenticated;

-- 2. TABELAS BASE (CRIAÇÃO SE NÃO EXISTIREM)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique,
  name text not null default '',
  stage_name text not null default '',
  city text not null default '',
  state text not null default '',
  bio text not null default '',
  experience_years text not null default '',
  genres text[] not null default '{}',
  instagram text not null default '',
  youtube text not null default '',
  website text not null default '',
  photo_url text not null default '',
  cover_photo_url text not null default '',
  society text not null default '',
  spotify text not null default '',
  views_count bigint not null default 0,
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.private_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  email text not null default '',
  whatsapp text not null default '',
  cpf text not null default '',
  pix_key text not null default '',
  pix_key_type text not null default 'cpf'
);

create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check(status in ('active','pending','suspended','cancelled')),
  plan_name text not null default 'Plano Bronze',
  monthly_price text not null default '24,90',
  next_billing_date date,
  payment_method text not null default 'Pix',
  card_last4 text,
  card_brand text,
  invoices jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  name text primary key,
  monthly_price numeric(10,2) not null check(monthly_price >= 0),
  max_songs integer check(max_songs is null or max_songs > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  description text not null default '',
  features text[] not null default '{}',
  updated_at timestamptz not null default now()
);

-- Inserção idempotente dos planos padrão
insert into public.subscription_plans(name, monthly_price, max_songs, is_active, sort_order, description, features) values
  ('Plano Inicial', 1.00, 1, true, 0, 'Plano de R$ 1,00 destinado exclusivamente a testes', array['Plano exclusivo para testes', 'Até 1 música publicada', 'Validação do fluxo de assinatura e cobrança']),
  ('Plano Bronze', 24.90, 100, true, 1, 'Plano inicial ideal para compositores', array['Até 100 músicas publicadas', 'Liberação direta com termo PDF', 'Estatísticas de reprodução']),
  ('Plano Prata', 34.90, 200, true, 2, 'Catálogo ampliado para compositores ativos', array['Até 200 músicas publicadas', 'Prioridade nas buscas', 'Liberação direta com termo PDF']),
  ('Plano Ouro', 54.90, null, true, 3, 'Acesso total e ilimitado para profissionais da música', array['Catálogo ilimitado de músicas', 'Selo de compositor verificado', 'Destaque editorial', 'Suporte prioritário'])
on conflict(name) do update set
  monthly_price = excluded.monthly_price,
  max_songs = excluded.max_songs,
  is_active = excluded.is_active,
  sort_order = excluded.sort_order,
  description = excluded.description,
  features = excluded.features,
  updated_at = now();

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null,
  created_at timestamptz not null default now(),
  primary key(user_id, role)
);

alter table public.user_roles drop constraint if exists user_roles_role_check;
alter table public.user_roles add constraint user_roles_role_check check (role in ('admin', 'moderator', 'financial', 'composer'));

create table if not exists public.validated_media (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null check(bucket_id in ('profile-media','song-covers','song-previews','song-originals','release-documents')),
  object_path text not null,
  public_url text,
  mime_type text not null,
  size_bytes bigint not null check(size_bytes > 0),
  duration_seconds numeric,
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  consumed_by_song_id uuid,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(bucket_id, object_path)
);
create index if not exists validated_media_owner_idx on public.validated_media(user_id, created_at desc);
drop index if exists public.validated_media_consumed_song_bucket_unique;

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null,
  genre text not null,
  subgenre text,
  authors text not null,
  date_composed date not null,
  date_registered date not null default current_date,
  lyrics text not null,
  cover_url text not null default '',
  registry_code text,
  notes text,
  status text not null default 'draft' check(status in ('draft','pending_approval','published','rejected')),
  is_available_for_release boolean not null default true,
  value_type text not null default 'consultation' check(value_type in ('suggested','consultation')),
  suggested_value numeric(12,2),
  play_count bigint not null default 0,
  interested_count bigint not null default 0,
  summary text,
  original_audio_path text,
  preview_audio_url text,
  original_media_id uuid references public.validated_media(id) on delete restrict,
  preview_media_id uuid references public.validated_media(id) on delete restrict,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.songs add column if not exists original_media_id uuid references public.validated_media(id) on delete restrict;
alter table public.songs add column if not exists preview_media_id uuid references public.validated_media(id) on delete restrict;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'validated_media_consumed_song_fkey') then
    alter table public.validated_media add constraint validated_media_consumed_song_fkey
      foreign key(consumed_by_song_id) references public.songs(id) on delete set null;
  end if;
end $$;

create table if not exists public.song_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null check(length(draft_key) between 1 and 100),
  payload jsonb not null check(octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, draft_key)
);

create table if not exists public.interest_requests (
  id uuid primary key default gen_random_uuid(),
  song_id uuid not null references public.songs(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  buyer_name text not null,
  buyer_stage_name text,
  cpf_cnpj text not null,
  buyer_email text not null,
  buyer_whatsapp text not null,
  buyer_city_state text not null,
  purpose text not null,
  message text not null,
  status text not null default 'nova' check(status in ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada')),
  agreed_value numeric(12,2),
  notes text,
  payment_received_at timestamptz,
  archive_reason text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.interest_requests
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique references public.interest_requests(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  song_title text not null,
  authors text not null,
  composer_name text not null,
  composer_cpf text not null,
  composer_city_state text not null,
  buyer_name text not null,
  buyer_document text not null,
  buyer_city_state text not null,
  agreed_value numeric(12,2) not null,
  authorized_purpose text not null,
  release_type text not null,
  issue_date date not null,
  additional_conditions text not null default '',
  digital_signature text not null,
  document_code text not null unique,
  document_path text,
  document_hash text,
  template_version text,
  document_archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id boolean primary key default true check(id),
  platform_name text not null default 'Mercado do Compositor',
  tagline text not null default '',
  plan_monthly_price numeric(10,2) not null default 24.90,
  plan_max_songs integer not null default 100,
  platform_fee_percentage numeric(5,2) not null default 0,
  support_whatsapp text not null default '',
  support_email text not null default '',
  pix_key text not null default '',
  maintenance_mode boolean not null default false,
  system_announcement text not null default '',
  require_approval_for_new_songs boolean not null default true,
  terms_version text not null default '1.0',
  updated_at timestamptz not null default now()
);

insert into public.platform_settings(id) values(true) on conflict(id) do nothing;

-- Fecha o acesso direto (select/update) já na criação da tabela: guarda a chave
-- Pix master e a taxa da plataforma, então só pode ser lida/gravada pelas
-- funções security definer get_platform_settings()/admin_update_platform_settings().
-- O Supabase concede select/update padrão a anon/authenticated em tabelas novas;
-- sem este revoke imediato haveria uma janela de escrita direta via PostgREST
-- que ignora a checagem de reautenticação, o controle de concorrência e a auditoria.
revoke select, update on table public.platform_settings from anon, authenticated;

create table if not exists public.system_logs (
  id text primary key default gen_random_uuid()::text,
  category text not null check(category in ('auth','financial','moderation','system')),
  title text not null,
  description text not null,
  actor text not null,
  status text not null check(status in ('info','success','warning','error')),
  created_at timestamptz not null default now()
);

create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3. NOVAS TABELAS: LGPD E NOTIFICAÇÕES
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

create index if not exists account_deletion_requests_user_idx on public.account_deletion_requests(user_id);
create index if not exists account_deletion_requests_status_idx on public.account_deletion_requests(status, created_at desc);

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

create index if not exists user_notifications_user_idx on public.user_notifications(user_id, is_read, created_at desc);
create index if not exists user_notifications_unread_idx on public.user_notifications(user_id, created_at desc) where (is_read = false);

-- Prevenção de duplicidade em solicitações de exclusão pendentes
create unique index if not exists account_deletion_pending_unique 
  on public.account_deletion_requests(user_id) 
  where (status in ('pendente', 'em_analise'));

-- Índices em Foreign Keys e Catálogo para eliminar Full Table Scans
create index if not exists releases_composer_idx 
  on public.releases(composer_id, created_at desc);

create index if not exists releases_song_idx 
  on public.releases(song_id);

create index if not exists interest_requests_song_idx 
  on public.interest_requests(song_id);

create index if not exists songs_catalog_active_idx 
  on public.songs(status, is_available_for_release, is_featured, play_count desc)
  where (status = 'published');

-- Integridade Referencial: Assinaturas vinculadas a Planos
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscriptions_plan_name_fkey'
  ) then
    alter table public.subscriptions
      add constraint subscriptions_plan_name_fkey
      foreign key (plan_name) references public.subscription_plans(name)
      on update cascade on delete restrict;
  end if;
end $$;

-- 4. HABILITAÇÃO DE RLS E POLÍTICAS
alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.songs enable row level security;
alter table public.song_drafts enable row level security;
alter table public.interest_requests enable row level security;
alter table public.releases enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.system_logs enable row level security;
alter table public.user_preferences enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table public.user_notifications enable row level security;
alter table public.validated_media enable row level security;

-- Políticas de Perfis (Público e Privado)
drop policy if exists "profile owner or admin" on public.profiles;
create policy "profile owner or admin" on public.profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());

drop policy if exists "private owner or admin" on public.private_profiles;
create policy "private owner or admin" on public.private_profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());

-- Políticas de Assinaturas
drop policy if exists "subscription owner or admin read" on public.subscriptions;
create policy "subscription owner or admin read" on public.subscriptions for select using(auth.uid()=user_id or public.is_admin());
drop policy if exists "subscription admin update" on public.subscriptions;
create policy "subscription admin update" on public.subscriptions for update using(public.is_admin()) with check(public.is_admin());

-- Políticas de Músicas e Rascunhos
drop policy if exists "songs owner or admin" on public.songs;
create policy "songs owner or admin" on public.songs for all using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());

drop policy if exists "song drafts owner" on public.song_drafts;
create policy "song drafts owner" on public.song_drafts for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- Políticas de Solicitações e Liberações
drop policy if exists "requests owner or admin read" on public.interest_requests;
create policy "requests owner or admin read" on public.interest_requests for select using(auth.uid()=composer_id or public.is_admin());
drop policy if exists "requests owner or admin update" on public.interest_requests;
create policy "requests owner or admin update" on public.interest_requests for update using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());

drop policy if exists "releases owner or admin read" on public.releases;
create policy "releases owner or admin read" on public.releases for select using(auth.uid()=composer_id or public.is_admin());
drop policy if exists "releases admin write" on public.releases;
create policy "releases admin write" on public.releases for all using(public.is_admin()) with check(public.is_admin());

-- Políticas de Papéis de Usuário (User Roles)
drop policy if exists "roles own read" on public.user_roles;
create policy "roles own read" on public.user_roles for select using(auth.uid()=user_id or public.is_admin());

-- Políticas de Planos e Configurações
drop policy if exists "plans public read" on public.subscription_plans;
create policy "plans public read" on public.subscription_plans for select using(true);
drop policy if exists "plans admin write" on public.subscription_plans;
create policy "plans admin write" on public.subscription_plans for all using(public.is_admin()) with check(public.is_admin());

-- platform_settings guarda a chave Pix master e a taxa da plataforma: propositalmente
-- SEM política de update para authenticated. Toda escrita passa pela função security
-- definer admin_update_platform_settings(), que reautentica e audita a operação; uma
-- política "for update using(is_admin())" aqui permitiria PATCH direto via PostgREST
-- ignorando essas garantias.
drop policy if exists "settings public read" on public.platform_settings;
drop policy if exists "settings admin update" on public.platform_settings;

-- Políticas de Solicitações LGPD
drop policy if exists "deletion requests owner create" on public.account_deletion_requests;
create policy "deletion requests owner create" on public.account_deletion_requests for insert with check (auth.uid() = user_id);
drop policy if exists "deletion requests owner read" on public.account_deletion_requests;
create policy "deletion requests owner read" on public.account_deletion_requests for select using (auth.uid() = user_id or public.is_admin());
-- Propositalmente SEM política de update: marcar uma solicitação como
-- "concluida" por PATCH direto declararia a exclusão cumprida sem apagar
-- nada. Mudanças de status passam só por admin_update_deletion_request()
-- (em análise/rejeitada) e admin_finalize_account_deletion() (conclusão real).
drop policy if exists "deletion requests admin update" on public.account_deletion_requests;

-- Políticas de Notificações
drop policy if exists "notifications owner all" on public.user_notifications;
create policy "notifications owner all" on public.user_notifications for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "validated media owner read" on public.validated_media;
create policy "validated media owner read" on public.validated_media
for select to authenticated using(auth.uid() = user_id or public.is_admin());

-- Políticas de User Preferences
drop policy if exists "prefs owner all" on public.user_preferences;
create policy "prefs owner all" on public.user_preferences for all using(auth.uid() = user_id) with check(auth.uid() = user_id);

-- Políticas de System Logs
drop policy if exists "logs admin read" on public.system_logs;
create policy "logs admin read" on public.system_logs for select using(public.is_admin());
drop policy if exists "logs admin insert" on public.system_logs;
create policy "logs admin insert" on public.system_logs for insert with check(public.is_admin() or auth.uid() is not null);

-- Controle Granular de Colunas (Impedir adulteração direta de métricas e status via API)
revoke update on table public.profiles from anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, society, spotify,
  updated_at
) on table public.profiles to authenticated;

revoke insert, update on table public.songs from anon, authenticated;
grant insert (
  id, composer_id, title, genre, subgenre, authors, date_composed,
  date_registered, lyrics, cover_url, registry_code, notes, status,
  is_available_for_release, value_type, suggested_value, summary,
  original_audio_path, preview_audio_url, original_media_id, preview_media_id,
  created_at, updated_at
) on table public.songs to authenticated;

grant update (
  title, genre, subgenre, authors, date_composed, date_registered, lyrics,
  cover_url, registry_code, notes, status, is_available_for_release,
  value_type, suggested_value, summary, original_audio_path,
  preview_audio_url, original_media_id, preview_media_id, updated_at
) on table public.songs to authenticated;

revoke insert, update, delete on table public.releases from anon, authenticated;

create or replace function public.preserve_issued_request_value()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.agreed_value is distinct from new.agreed_value
     and (old.status = 'liberacao_enviada' or exists (
       select 1 from public.releases where request_id = old.id
     )) then
    raise exception using errcode = '23514', message = 'O valor de uma liberação emitida não pode ser alterado.';
  end if;
  return new;
end;
$$;
revoke execute on function public.preserve_issued_request_value() from public, anon, authenticated;
drop trigger if exists preserve_issued_request_value on public.interest_requests;
create trigger preserve_issued_request_value
before update of agreed_value on public.interest_requests
for each row execute function public.preserve_issued_request_value();

-- Serializa toda criação/alteração de liberação pela linha da música. Depois
-- de aguardar outra transação, as consultas abaixo enxergam a liberação que ela
-- confirmou e rejeitam uma exclusividade incompatível.
create or replace function public.enforce_release_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  perform 1 from public.songs where id = new.song_id for update;
  if not found then
    raise exception using errcode = '23503', message = 'A obra vinculada à liberação não foi encontrada.';
  end if;
  if exists (
    select 1 from public.releases
    where song_id = new.song_id and id is distinct from new.id
      and public.is_exclusive_release(release_type)
  ) then
    raise exception using errcode = '23514', message = 'Esta obra já possui uma liberação exclusiva emitida para outro interessado.';
  end if;
  if public.is_exclusive_release(new.release_type) and exists (
    select 1 from public.releases
    where song_id = new.song_id and id is distinct from new.id
  ) then
    raise exception using errcode = '23514', message = 'Não é possível conceder exclusividade para uma obra que já possui outras liberações emitidas.';
  end if;
  return new;
end;
$$;
revoke execute on function public.enforce_release_exclusivity() from public, anon, authenticated;
drop trigger if exists enforce_release_exclusivity on public.releases;
create trigger enforce_release_exclusivity
before insert or update of song_id, release_type on public.releases
for each row execute function public.enforce_release_exclusivity();

-- Políticas de Buckets de Arquivos (Storage)
insert into storage.buckets(id,name,public) values
  ('profile-media','profile-media',true),
  ('song-covers','song-covers',true),
  ('song-previews','song-previews',true),
  ('song-originals','song-originals',false),
  ('release-documents','release-documents',false)
on conflict(id) do update set public=excluded.public;

-- Todo upload feito pelo app passa primeiro por este bucket privado. A Edge
-- Function validate-media-upload valida o conteúdo e promove o arquivo para o
-- bucket definitivo usando service_role.
insert into storage.buckets(id, name, public, file_size_limit)
values ('media-quarantine', 'media-quarantine', false, 26214400)
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit;

drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;
drop policy if exists "song originals owner read" on storage.objects;
drop policy if exists "release documents owner or admin read" on storage.objects;
drop policy if exists "quarantine owner insert" on storage.objects;
drop policy if exists "quarantine owner delete" on storage.objects;
drop policy if exists "quarantine owner select" on storage.objects;

-- Não recrie uma política de INSERT para os buckets finais. Usuários enviam
-- somente para media-quarantine; a Edge Function promove com service_role.
-- UPDATE (inclui move/renomear) só na quarentena: sem filtro de bucket, um
-- arquivo não validado podia ser movido direto para um bucket público.
create policy "media owner update" on storage.objects for update to authenticated using(bucket_id='media-quarantine' and (storage.foldername(name))[1]=auth.uid()::text) with check(bucket_id='media-quarantine' and (storage.foldername(name))[1]=auth.uid()::text);
-- release-documents fica de fora: o PDF emitido de um termo de liberação é
-- imutável e não pode ser apagado pelo compositor.
create policy "media owner delete" on storage.objects for delete to authenticated using(bucket_id in ('profile-media','song-covers','song-previews','song-originals') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "song originals owner read" on storage.objects for select to authenticated using(bucket_id='song-originals' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "release documents owner or admin read" on storage.objects for select to authenticated using(bucket_id='release-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));
create policy "quarantine owner insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(coalesce(storage.extension(name), '')) in
    ('jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'pdf')
);
create policy "quarantine owner delete" on storage.objects
for delete to authenticated
using (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy "quarantine owner select" on storage.objects
for select to authenticated
using (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Triggers de Segurança e Integridade
create or replace function public.preserve_interest_request_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (
    new.song_id, new.composer_id, new.buyer_name, new.buyer_stage_name,
    new.cpf_cnpj, new.buyer_email, new.buyer_whatsapp,
    new.buyer_city_state, new.purpose, new.message, new.created_at
  ) is distinct from (
    old.song_id, old.composer_id, old.buyer_name, old.buyer_stage_name,
    old.cpf_cnpj, old.buyer_email, old.buyer_whatsapp,
    old.buyer_city_state, old.purpose, old.message, old.created_at
  ) then
    raise exception using errcode = '42501', message = 'Os dados originais enviados pelo interessado são imutáveis.';
  end if;
  return new;
end;
$$;
drop trigger if exists preserve_interest_request_identity on public.interest_requests;
create trigger preserve_interest_request_identity
before update on public.interest_requests
for each row execute function public.preserve_interest_request_identity();

create or replace function public.preserve_song_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.interest_requests where song_id = old.id)
     or exists (select 1 from public.releases where song_id = old.id) then
    raise exception using errcode = '23503',
      message = 'Esta música possui solicitações ou liberações e não pode ser excluída.',
      hint = 'Mova a música para rascunho para preservar o histórico.';
  end if;
  return old;
end;
$$;
drop trigger if exists preserve_song_history on public.songs;
create trigger preserve_song_history
before delete on public.songs
for each row execute function public.preserve_song_history();

create or replace function public.enforce_song_write_rules()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  max_songs integer;
  current_song_count bigint;
  approval_required boolean;
  admin_actor boolean;
begin
  admin_actor := public.is_admin();

  select sp.max_songs into max_songs
  from public.subscriptions sub
  join public.subscription_plans sp on sp.name = sub.plan_name and sp.is_active
  where sub.user_id = new.composer_id;

  if not found then
    raise exception using errcode = '23514', message = 'A conta não possui um plano de assinatura válido.';
  end if;

  select require_approval_for_new_songs into approval_required
  from public.platform_settings where id = true;
  approval_required := coalesce(approval_required, true);

  if tg_op = 'INSERT' then
    perform 1 from public.profiles where user_id = new.composer_id for update;
    select count(*) into current_song_count from public.songs where composer_id = new.composer_id;
    if max_songs is not null and current_song_count >= max_songs then
      raise exception using errcode = 'P0001',
        message = format('Limite de %s músicas atingido para esta conta.', max_songs);
    end if;
  end if;

  -- 1. Título obrigatório com trim para todos os status (inclusive rascunho)
  if nullif(btrim(new.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe ao menos um título provisório para salvar o rascunho.';
  end if;

  -- 2. Data da composição não pode estar no futuro
  if new.date_composed > current_date then
    raise exception using errcode = '23514', message = 'A data da composição não pode estar no futuro.';
  end if;

  -- 3. Sanitização graciosa para campos de rascunho (evita falha em NOT NULL)
  new.authors := coalesce(new.authors, '');
  new.lyrics := coalesce(new.lyrics, '');
  new.cover_url := coalesce(new.cover_url, '');

  -- 4. Validação unificada de valor sugerido
  if new.value_type = 'suggested' then
    -- Se estiver sendo publicada ou enviada para aprovação, valor é obrigatório
    if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0) then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    -- Se o valor foi informado (inclusive em rascunho), deve ser > 0 e <= 10.000.000
    if new.suggested_value is not null and new.suggested_value <= 0 then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value > 10000000 then
      raise exception using errcode = '23514', message = 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.';
    end if;
  end if;


  if not admin_actor then
    if new.status = 'rejected' then
      raise exception using errcode = '42501', message = 'Somente administradores podem rejeitar músicas.';
    end if;

    if approval_required and new.status = 'published' and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception using errcode = '42501',
        message = 'Esta música precisa ser enviada para aprovação antes da publicação.',
        hint = 'Use o status pending_approval.';
    end if;

    if approval_required and tg_op = 'UPDATE' and old.status = 'published' and new.status = 'published' and (
      new.title, new.genre, new.subgenre, new.authors, new.date_composed,
      new.lyrics, new.cover_url, new.registry_code, new.value_type,
      new.suggested_value, new.summary, new.original_audio_path, new.preview_audio_url
    ) is distinct from (
      old.title, old.genre, old.subgenre, old.authors, old.date_composed,
      old.lyrics, old.cover_url, old.registry_code, old.value_type,
      old.suggested_value, old.summary, old.original_audio_path, old.preview_audio_url
    ) then
      raise exception using errcode = '42501',
        message = 'Alterações em uma música publicada exigem nova aprovação.',
        hint = 'Salve a alteração com o status pending_approval.';
    end if;
  end if;

  if new.status in ('published', 'pending_approval') then
    if nullif(btrim(new.title), '') is null
       or nullif(btrim(new.authors), '') is null
       or nullif(btrim(new.lyrics), '') is null
       or nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
      raise exception using errcode = '23514',
        message = 'Para publicar ou enviar para aprovação, informe título, autores, letra e uma prévia pública de até 60 segundos.';
    end if;

    if not exists (select 1 from public.subscriptions where user_id = new.composer_id and status = 'active') then
      raise exception using errcode = 'P0001',
        message = 'Somente contas com assinatura ativa podem publicar ou enviar músicas para aprovação.';
    end if;
  end if;

  return new;
end;
$$;
drop trigger if exists enforce_song_write_rules on public.songs;
create trigger enforce_song_write_rules
before insert or update on public.songs
for each row execute function public.enforce_song_write_rules();

create or replace function public.enforce_song_media_separation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  media_row public.validated_media%rowtype;
begin
  -- Rascunhos não mantêm referências para buckets públicos. A mídia escolhida
  -- pelo usuário só é enviada quando a obra entra em aprovação/publicação.
  if new.status = 'draft' then
    new.preview_audio_url := null;
    new.preview_media_id := null;
    new.original_audio_path := null;
    new.original_media_id := null;
    new.cover_url := '';
    return new;
  end if;

  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null and new.preview_media_id is not null then
    raise exception using errcode = '23514', message = 'Não informe validação de prévia sem uma URL de prévia.';
  end if;
  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is not null
     and (
       tg_op = 'INSERT'
       or old.status not in ('published', 'pending_approval')
       or old.preview_audio_url is distinct from new.preview_audio_url
       or old.preview_media_id is distinct from new.preview_media_id
     ) then
    if new.preview_media_id is null then
      raise exception using errcode = '23514', message = 'A prévia precisa de um registro de mídia validada.';
    end if;
    select * into media_row from public.validated_media
    where id = new.preview_media_id and user_id = new.composer_id
      and bucket_id = 'song-previews' and public_url = new.preview_audio_url
      and duration_seconds > 0 and duration_seconds <= 60
      and (consumed_by_song_id is null or consumed_by_song_id = new.id)
    for update;
    if not found then
      raise exception using errcode = '23514', message = 'A prévia não possui validação válida ou já foi vinculada a outra música.';
    end if;
    update public.validated_media set consumed_by_song_id = new.id, consumed_at = coalesce(consumed_at, now()) where id = media_row.id;
  end if;

  if nullif(btrim(coalesce(new.original_audio_path, '')), '') is null and new.original_media_id is not null then
    raise exception using errcode = '23514', message = 'Não informe validação de áudio original sem o caminho do arquivo.';
  end if;
  if nullif(btrim(coalesce(new.original_audio_path, '')), '') is not null
     and (
       tg_op = 'INSERT'
       or old.status not in ('published', 'pending_approval')
       or old.original_audio_path is distinct from new.original_audio_path
       or old.original_media_id is distinct from new.original_media_id
     ) then
    if new.original_media_id is null then
      raise exception using errcode = '23514', message = 'O áudio original precisa de um registro de mídia validada.';
    end if;
    select * into media_row from public.validated_media
    where id = new.original_media_id and user_id = new.composer_id
      and bucket_id = 'song-originals' and object_path = new.original_audio_path
      and (consumed_by_song_id is null or consumed_by_song_id = new.id)
    for update;
    if not found then
      raise exception using errcode = '23514', message = 'O áudio original não possui validação válida ou já foi vinculado a outra música.';
    end if;
    update public.validated_media set consumed_by_song_id = new.id, consumed_at = coalesce(consumed_at, now()) where id = media_row.id;
  end if;

  return new;
end;
$$;
drop trigger if exists enforce_song_media_separation on public.songs;
create trigger enforce_song_media_separation
before insert or update on public.songs
for each row execute function public.enforce_song_media_separation();

-- 5. FUNÇÕES E RPCS DO SISTEMA
-- admin_assign_user_role também é definida uma única vez, no bloco de
-- governança abaixo, onde a concessão do papel 'admin' exige reautenticação.

-- admin_revoke_user_role é definida UMA ÚNICA VEZ, no bloco de governança mais
-- abaixo, com as travas de autopreservação (não revogar a si mesmo, não remover
-- o último administrador, reautenticação recente). Não redefina a função aqui:
-- um "create or replace" sem essas travas as remove silenciosamente.

create or replace function public.admin_set_profile_verified(p_user_id uuid, p_is_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Acesso restrito a administradores.'; end if;
  update public.profiles set is_verified = p_is_verified, updated_at = now() where user_id = p_user_id;
end;
$$;
grant execute on function public.admin_set_profile_verified(uuid, boolean) to authenticated;

create or replace function public.admin_set_song_featured(p_song_id uuid, p_is_featured boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_admin() then raise exception using errcode = '42501', message = 'Acesso restrito a administradores.'; end if;
  update public.songs set is_featured = p_is_featured, updated_at = now() where id = p_song_id;
end;
$$;
grant execute on function public.admin_set_song_featured(uuid, boolean) to authenticated;

create or replace function public.get_my_song_stats()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid := auth.uid();
  v_published bigint; v_drafts bigint; v_pending bigint; v_rejected bigint;
  v_plays bigint; v_interests bigint; v_genres text[];
begin
  if v_user_id is null then raise exception 'Não autenticado'; end if;
  select
    count(*) filter (where status = 'published'),
    count(*) filter (where status = 'draft'),
    count(*) filter (where status = 'pending_approval'),
    count(*) filter (where status = 'rejected'),
    coalesce(sum(play_count), 0),
    coalesce(sum(interested_count), 0)
  into v_published, v_drafts, v_pending, v_rejected, v_plays, v_interests
  from public.songs where composer_id = v_user_id;

  select coalesce(array_agg(distinct genre), array[]::text[]) into v_genres
  from public.songs where composer_id = v_user_id and genre is not null and genre <> '';

  return jsonb_build_object(
    'published', v_published, 'drafts', v_drafts, 'pending', v_pending, 'rejected', v_rejected,
    'plays', v_plays, 'interests', v_interests, 'genres', v_genres
  );
end;
$$;
grant execute on function public.get_my_song_stats() to authenticated;

create or replace function public.is_exclusive_release(p_release_type text)
returns boolean
language sql
immutable
as $$
  select case
    when p_release_type is null or btrim(p_release_type) = '' then false
    when lower(p_release_type) ~* 'n[aã]o[\s\-_]*exclusiv' then false
    when lower(p_release_type) ~* '(autoriza[cç][aã]o\s+exclusiva|cess[aã]o\s+exclusiva|cess[aã]o\s+definitiva|exclusiva\s+por|^exclusiva$)' then true
    else false
  end;
$$;
revoke execute on function public.is_exclusive_release(text) from public, anon;
grant execute on function public.is_exclusive_release(text) to authenticated;

create or replace function public.issue_release(
  p_request_id uuid,
  p_release_type text,
  p_additional_conditions text default '',
  p_digital_signature text default '',
  p_agreed_value numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row public.interest_requests%rowtype;
  song_row public.songs%rowtype;
  profile_row public.profiles%rowtype;
  private_row public.private_profiles%rowtype;
  release_row public.releases%rowtype;
  release_id uuid := gen_random_uuid();
  release_code text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;

  select * into request_row
  from public.interest_requests
  where id = p_request_id and composer_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Solicitação não encontrada para este compositor.';
  end if;
  if request_row.status <> 'pagamento_confirmado'
     or request_row.payment_received_at is null then
    raise exception using errcode = '23514', message = 'A liberação exige pagamento confirmado.';
  end if;

  -- Se um novo valor acordado foi informado na emissão, atualiza e sincroniza
  if p_agreed_value is not null and p_agreed_value > 0 then
    if p_agreed_value > 10000000 then
      raise exception using errcode = '23514', message = 'O valor acordado não pode ultrapassar R$ 10.000.000,00.';
    end if;
    update public.interest_requests
    set agreed_value = p_agreed_value
    where id = request_row.id;
    request_row.agreed_value := p_agreed_value;
  end if;

  if request_row.agreed_value is null or request_row.agreed_value <= 0 then
    raise exception using errcode = '23514', message = 'A liberação exige pagamento confirmado e valor acordado válido.';
  end if;
  if exists (select 1 from public.releases where request_id = p_request_id) then
    raise exception using errcode = '23505', message = 'Esta solicitação já possui uma liberação.';
  end if;

  -- Protege a exclusividade entre solicitações diferentes da mesma obra
  if exists (
    select 1 from public.releases
    where song_id = request_row.song_id
      and request_id <> p_request_id
      and public.is_exclusive_release(release_type)
  ) then
    raise exception using errcode = '23514', message = 'Esta obra já possui uma liberação com cláusula de exclusividade emitida para outro interessado.';
  end if;

  if public.is_exclusive_release(p_release_type) and exists (
    select 1 from public.releases
    where song_id = request_row.song_id
      and request_id <> p_request_id
  ) then
    raise exception using errcode = '23514', message = 'Não é possível conceder exclusividade para uma obra que já possui outras liberações emitidas.';
  end if;

  if nullif(btrim(p_release_type), '') is null or length(btrim(p_release_type)) > 160 then
    raise exception using errcode = '23514', message = 'Informe um tipo de liberação válido.';
  end if;
  if length(coalesce(p_additional_conditions, '')) > 5000
     or nullif(btrim(p_digital_signature), '') is null
     or length(btrim(p_digital_signature)) > 500 then
    raise exception using errcode = '23514', message = 'Assinatura ou condições adicionais inválidas.';
  end if;

  select * into strict song_row from public.songs where id = request_row.song_id and composer_id = request_row.composer_id;
  select * into strict profile_row from public.profiles where user_id = request_row.composer_id;
  select * into strict private_row from public.private_profiles where user_id = request_row.composer_id;

  if nullif(btrim(profile_row.name), '') is null or nullif(btrim(private_row.cpf), '') is null then
    raise exception using errcode = '23514', message = 'Complete o nome e CPF do compositor no seu perfil antes de emitir a liberação.';
  end if;

  release_code := 'LIB-' || extract(year from current_date)::integer || '-' || upper(substr(replace(release_id::text, '-', ''), 1, 12));

  insert into public.releases(
    id, request_id, composer_id, song_id, song_title, authors,
    composer_name, composer_cpf, composer_city_state, buyer_name,
    buyer_document, buyer_city_state, agreed_value, authorized_purpose,
    release_type, issue_date, additional_conditions, digital_signature,
    document_code
  ) values (
    release_id, request_row.id, request_row.composer_id, song_row.id,
    song_row.title, song_row.authors, profile_row.name, private_row.cpf,
    concat_ws(' - ', nullif(profile_row.city, ''), nullif(profile_row.state, '')),
    request_row.buyer_name, request_row.cpf_cnpj, request_row.buyer_city_state,
    request_row.agreed_value, request_row.purpose, btrim(p_release_type),
    current_date, coalesce(p_additional_conditions, ''), btrim(p_digital_signature),
    release_code
  ) returning * into release_row;

  update public.interest_requests
  set status = 'liberacao_enviada'
  where id = request_row.id;

  return jsonb_build_object(
    'id', release_row.id,
    'requestId', release_row.request_id,
    'songId', release_row.song_id,
    'songTitle', release_row.song_title,
    'authors', release_row.authors,
    'composerName', release_row.composer_name,
    'composerCpf', release_row.composer_cpf,
    'composerCityState', release_row.composer_city_state,
    'buyerName', release_row.buyer_name,
    'buyerDocument', release_row.buyer_document,
    'buyerCityState', release_row.buyer_city_state,
    'agreedValue', release_row.agreed_value,
    'authorizedPurpose', release_row.authorized_purpose,
    'releaseType', release_row.release_type,
    'issueDate', release_row.issue_date,
    'additionalConditions', release_row.additional_conditions,
    'digitalSignature', release_row.digital_signature,
    'documentCode', release_row.document_code,
    'isDemonstrative', false
  );
end;
$$;
revoke execute on function public.issue_release(uuid, text, text, text, numeric) from public, anon;
grant execute on function public.issue_release(uuid, text, text, text, numeric) to authenticated;

create or replace function public.issue_release(
  p_request_id uuid,
  p_release_type text,
  p_additional_conditions text,
  p_digital_signature text,
  p_close_song boolean,
  p_agreed_value numeric default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  release_result jsonb;
begin
  release_result := public.issue_release(p_request_id, p_release_type, p_additional_conditions, p_digital_signature, p_agreed_value);
  if p_close_song or public.is_exclusive_release(p_release_type) then
    update public.songs
    set is_available_for_release = false, updated_at = now()
    where id = (release_result->>'songId')::uuid and composer_id = auth.uid();
  end if;
  return release_result;
end;
$$;
revoke execute on function public.issue_release(uuid, text, text, text, boolean, numeric) from public, anon;
grant execute on function public.issue_release(uuid, text, text, text, boolean, numeric) to authenticated;

create or replace function public.issue_release(
  p_request_id uuid,
  p_release_type text,
  p_additional_conditions text,
  p_digital_signature text,
  p_close_song boolean
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  return public.issue_release(p_request_id, p_release_type, p_additional_conditions, p_digital_signature, p_close_song, null);
end;
$$;
revoke execute on function public.issue_release(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.issue_release(uuid, text, text, text, boolean) to authenticated;

-- Emissão versionada e auditada; as assinaturas anteriores ficam internas.
create table if not exists public.interest_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.interest_requests(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_status text not null, new_status text not null,
  previous_agreed_value numeric(12,2), new_agreed_value numeric(12,2),
  changed_at timestamptz not null default now()
);
create index if not exists interest_request_history_request_idx
  on public.interest_request_history(request_id, changed_at desc);
alter table public.interest_request_history enable row level security;
drop policy if exists "request history owner read" on public.interest_request_history;
create policy "request history owner read" on public.interest_request_history
  for select using (auth.uid() = composer_id or public.is_admin());
revoke insert, update, delete on table public.interest_request_history from anon, authenticated;
grant select on table public.interest_request_history to authenticated;

create or replace function public.issue_release(
  p_request_id uuid, p_release_type text, p_additional_conditions text,
  p_digital_signature text, p_close_song boolean, p_agreed_value numeric,
  p_expected_updated_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  current_request public.interest_requests%rowtype;
  issued_request public.interest_requests%rowtype;
  release_result jsonb;
  changed_at_value timestamptz;
begin
  select * into current_request from public.interest_requests
  where id = p_request_id and composer_id = auth.uid() for update;
  if not found then
    raise exception using errcode = '42501', message = 'Solicitação não encontrada para este compositor.';
  end if;
  if p_expected_updated_at is null or current_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Esta solicitação foi alterada. Recarregue a página antes de emitir a liberação.';
  end if;
  release_result := public.issue_release(p_request_id, p_release_type, p_additional_conditions,
    p_digital_signature, p_close_song, p_agreed_value);
  changed_at_value := clock_timestamp();
  update public.interest_requests set updated_at = changed_at_value
  where id = p_request_id returning * into issued_request;
  insert into public.interest_request_history(request_id, composer_id, actor_id,
    previous_status, new_status, previous_agreed_value, new_agreed_value, changed_at)
  values(p_request_id, current_request.composer_id, auth.uid(), current_request.status,
    issued_request.status, current_request.agreed_value, issued_request.agreed_value, changed_at_value);
  return release_result || jsonb_build_object('requestUpdatedAt', changed_at_value);
end;
$$;
revoke execute on function public.issue_release(uuid,text,text,text,numeric) from public, anon, authenticated;
revoke execute on function public.issue_release(uuid,text,text,text,boolean,numeric) from public, anon, authenticated;
revoke execute on function public.issue_release(uuid,text,text,text,boolean) from public, anon, authenticated;
revoke execute on function public.issue_release(uuid,text,text,text,boolean,numeric,timestamptz) from public, anon;
grant execute on function public.issue_release(uuid,text,text,text,boolean,numeric,timestamptz) to authenticated;
do $$
declare legacy_signature text;
begin
  for legacy_signature in
    select p.oid::regprocedure::text from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'issue_release' and p.pronargs <> 7
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', legacy_signature);
  end loop;
end $$;

create or replace function public.list_interest_requests(p_page integer default 1,p_page_size integer default 20,p_status text default null,p_song_id uuid default null,p_query text default '',p_oldest boolean default false)
returns jsonb language sql stable security definer set search_path='' as $$
with own as(select r.*,s.title song_title,s.cover_url song_cover from public.interest_requests r left join public.songs s on s.id=r.song_id where r.composer_id=auth.uid()),
filtered as(select * from own o where(p_status is null or o.status=p_status)and(p_song_id is null or o.song_id=p_song_id)and(nullif(btrim(p_query),'')is null or position(lower(btrim(p_query))in lower(concat_ws(' ',o.buyer_name,o.buyer_stage_name,o.song_title,o.buyer_city_state,o.buyer_email,o.cpf_cnpj,split_part(o.id::text,'-',1))))>0)),
numbered as(select f.*,row_number()over(order by case when p_oldest then f.created_at end asc,case when not p_oldest then f.created_at end desc,f.id desc)rn from filtered f)
select jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(n)-'rn' order by n.rn),'[]'::jsonb)from numbered n where n.rn>(greatest(p_page,1)::bigint-1)*least(greatest(p_page_size,1),100)and n.rn<=greatest(p_page,1)::bigint*least(greatest(p_page_size,1),100)),'total',(select count(*)from filtered),'statusCounts',(select coalesce(jsonb_object_agg(c.status,c.count),'{}'::jsonb)from(select status,count(*)count from own where status is not null group by status)c),'songCounts',(select coalesce(jsonb_object_agg(c.song_id,c.count),'{}'::jsonb)from(select song_id,count(*)count from own where song_id is not null group by song_id)c));
$$;
revoke execute on function public.list_interest_requests(integer,integer,text,uuid,text,boolean) from public,anon;
grant execute on function public.list_interest_requests(integer,integer,text,uuid,text,boolean) to authenticated;

-- Registra uma única versão imutável do PDF emitido.
create or replace function public.register_release_document(
  p_release_id uuid, p_document_path text, p_document_hash text, p_template_version text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or p_document_path not like auth.uid()::text || '/' || p_release_id::text || '/%'
     or p_document_path not like '%.pdf'
     or p_document_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_template_version),'') is null
     or length(p_template_version)>40 then
    raise exception using errcode='23514', message='Metadados do documento arquivado inválidos.';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='release-documents'
      and name=p_document_path
      and (owner_id=auth.uid()::text or (storage.foldername(name))[1]=auth.uid()::text)
  ) then
    raise exception using errcode='23514', message='O arquivo informado não foi encontrado no armazenamento privado.';
  end if;
  update public.releases set document_path=p_document_path, document_hash=p_document_hash,
    template_version=btrim(p_template_version), document_archived_at=now()
  where id=p_release_id and composer_id=auth.uid() and document_path is null;
  if not found then raise exception using errcode='23505', message='Documento inexistente ou já arquivado.'; end if;
end; $$;

revoke execute on function public.register_release_document(uuid,text,text,text) from public, anon;
grant execute on function public.register_release_document(uuid,text,text,text) to authenticated;


create or replace function public.update_interest_request(
  p_request_id uuid,
  p_status text,
  p_agreed_value numeric default null,
  p_notes text default null,
  p_archive_reason text default null,
  p_expected_updated_at timestamptz default null,
  p_clear_agreed_value boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_request public.interest_requests%rowtype;
  target_agreed_value numeric;
  changed_at_value timestamptz := clock_timestamp();
  result_json jsonb;
begin
  select * into current_request
  from public.interest_requests
  where id = p_request_id and composer_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Solicitação não encontrada para este compositor.';
  end if;
  if p_expected_updated_at is not null and current_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Esta solicitação foi alterada em outra aba. Recarregue a página antes de salvar novamente.';
  end if;
  if p_status not in ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada') then
    raise exception using errcode = '23514', message = 'Status de solicitação inválido.';
  end if;
  if p_status <> current_request.status and not (
    (current_request.status = 'nova' and p_status in ('em_negociacao','arquivada')) or
    (current_request.status = 'em_negociacao' and p_status in ('pagamento_pendente','arquivada')) or
    (current_request.status = 'pagamento_pendente' and p_status in ('em_negociacao','pagamento_confirmado','arquivada')) or
    (current_request.status = 'pagamento_confirmado' and p_status = 'arquivada') or
    (current_request.status = 'arquivada' and p_status = 'nova')
  ) then
    raise exception using errcode = '23514', message = 'Transição de status não permitida.';
  end if;

  -- Impede avançar para pagamento se a obra já possui liberação exclusiva emitida para outra solicitação
  if p_status in ('pagamento_pendente','pagamento_confirmado') and exists (
    select 1 from public.releases
    where song_id = current_request.song_id
      and request_id <> current_request.id
      and public.is_exclusive_release(release_type)
  ) then
    raise exception using errcode = '23514', message = 'Esta obra já possui uma liberação exclusiva emitida para outro interessado e não aceita novos pagamentos.';
  end if;

  target_agreed_value := case when p_agreed_value = 0 then null
    when p_clear_agreed_value then null
    else coalesce(p_agreed_value, current_request.agreed_value) end;

  if p_status in ('pagamento_pendente','pagamento_confirmado') and coalesce(target_agreed_value, 0) <= 0 then
    raise exception using errcode = '23514', message = 'Informe um valor acordado maior que zero.';
  end if;

  if target_agreed_value is not null and target_agreed_value > 10000000 then
    raise exception using errcode = '23514', message = 'O valor acordado não pode ultrapassar R$ 10.000.000,00.';
  end if;

  if length(coalesce(p_notes, '')) > 500 then
    raise exception using errcode = '23514', message = 'As observações devem ter no máximo 500 caracteres.';
  end if;
  if length(coalesce(p_archive_reason, '')) > 160 then
    raise exception using errcode = '23514', message = 'O motivo do arquivamento deve ter no máximo 160 caracteres.';
  end if;

  update public.interest_requests set
    status = p_status,
    agreed_value = target_agreed_value,
    notes = coalesce(p_notes, current_request.notes),
    payment_received_at = case when p_status = 'pagamento_confirmado' then coalesce(current_request.payment_received_at, changed_at_value) else current_request.payment_received_at end,
    archive_reason = case when p_status = 'arquivada' then nullif(btrim(p_archive_reason), '') when p_status = 'nova' then null else current_request.archive_reason end,
    archived_at = case when p_status = 'arquivada' then coalesce(current_request.archived_at, changed_at_value) when p_status = 'nova' then null else current_request.archived_at end,
    updated_at = changed_at_value
  where id = p_request_id;

  select to_jsonb(r) into result_json
  from (
    select ir.*, s.title as song_title, s.cover_url as song_cover
    from public.interest_requests ir
    left join public.songs s on s.id = ir.song_id
    where ir.id = p_request_id
  ) r;
  return result_json;
end;
$$;
grant execute on function public.update_interest_request(uuid, text, numeric, text, text, timestamptz, boolean) to authenticated;

-- Permissões das tabelas para o Supabase client
grant select, update on public.profiles to authenticated;
grant select on public.private_profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.song_drafts to authenticated;
grant select on public.interest_requests to authenticated;
grant select on public.releases to authenticated;
grant select on public.user_roles to authenticated;
grant select on public.subscription_plans to anon, authenticated;
-- platform_settings (chave Pix master) só é lida via get_platform_settings().
grant select, insert on public.system_logs to authenticated;
grant select, insert, update, delete on public.user_preferences to authenticated;
grant select, insert on public.account_deletion_requests to authenticated;
grant select, insert, update, delete on public.user_notifications to authenticated;
grant select on public.validated_media to authenticated;
grant all on public.validated_media to service_role;

-- Função atômica para consultar capacidade do plano antes do upload
create or replace function public.check_plan_capacity(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  current_plan_name text;
  plan_limit integer;
  song_count bigint;
begin
  target_user_id := coalesce(p_user_id, auth.uid());
  if target_user_id is null then
    return jsonb_build_object('canAddSong', false, 'error', 'unauthorized');
  end if;

  select sub.plan_name into current_plan_name
  from public.subscriptions sub
  where sub.user_id = target_user_id;

  select sp.max_songs into plan_limit
  from public.subscription_plans sp
  where sp.name = current_plan_name and sp.is_active;

  if not found then
    select plan_max_songs into plan_limit
    from public.platform_settings
    where id = true;
  end if;

  select count(*) into song_count
  from public.songs
  where composer_id = target_user_id;

  return jsonb_build_object(
    'canAddSong', (plan_limit is null or song_count < plan_limit),
    'currentSongCount', song_count,
    'maxSongs', plan_limit,
    'remainingSongs', case when plan_limit is null then null else greatest(0, plan_limit - song_count) end,
    'planName', coalesce(current_plan_name, 'Plano Padrão'),
    'isUnlimited', (plan_limit is null)
  );
end;
$$;

revoke execute on function public.check_plan_capacity(uuid) from public, anon;
grant execute on function public.check_plan_capacity(uuid) to authenticated;

-- Manutenção: Limpeza de arquivos expirados na quarentena
create or replace function public.cleanup_expired_quarantine(p_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_count integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Apenas administradores podem executar a limpeza geral da quarentena.';
  end if;

  with deleted as (
    delete from storage.objects
    where bucket_id = 'media-quarantine'
      and created_at < (now() - make_interval(hours => greatest(1, p_hours)))
    returning 1
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

revoke execute on function public.cleanup_expired_quarantine(integer) from public, anon;
grant execute on function public.cleanup_expired_quarantine(integer) to authenticated;

-- Rastreamento de envio efetivo de termo de liberação ao comprador
alter table public.releases add column if not exists sent_to_buyer_at timestamptz;

create or replace function public.mark_release_sent(p_release_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sent_at timestamptz := now();
begin
  update public.releases
  set sent_to_buyer_at = v_sent_at
  where id = p_release_id and composer_id = auth.uid();

  if not found then
    raise exception 'Liberação não encontrada ou você não tem permissão para atualizá-la.';
  end if;

  return v_sent_at;
end;
$$;

revoke execute on function public.mark_release_sent(uuid) from public, anon;
grant execute on function public.mark_release_sent(uuid) to authenticated;

-- BEGIN ADMIN COMPOSERS MANAGEMENT
-- Corrige os fluxos administrativos de compositores e assinaturas.
-- Execute após schema.sql. É idempotente.

create or replace function public.can_manage_composer_subscriptions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'financial')
  )
$$;

revoke execute on function public.can_manage_composer_subscriptions() from public, anon;
grant execute on function public.can_manage_composer_subscriptions() to authenticated;

drop policy if exists "subscription owner or admin read" on public.subscriptions;
drop policy if exists "subscription owner or finance read" on public.subscriptions;
create policy "subscription owner or finance read"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.can_manage_composer_subscriptions());

drop policy if exists "subscription admin update" on public.subscriptions;
drop policy if exists "subscription admin or financial update" on public.subscriptions;
create policy "subscription admin or financial update"
on public.subscriptions
for update
to authenticated
using (public.can_manage_composer_subscriptions())
with check (public.can_manage_composer_subscriptions());

create or replace function public.get_admin_composers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.user_id,
        'username', p.username,
        'name', p.name,
        'stageName', p.stage_name,
        'email', coalesce(pp.email, ''),
        'whatsapp', coalesce(pp.whatsapp, ''),
        'cpf', coalesce(pp.cpf, ''),
        'cityState', concat_ws(' - ', nullif(p.city, ''), nullif(p.state, '')),
        'subscriptionStatus', coalesce(sub.status, 'pending'),
        'planName', coalesce(sub.plan_name, ''),
        'monthlyValue', coalesce(nullif(replace(sub.monthly_price, ',', '.'), '')::numeric, 0),
        'registeredAt', p.created_at,
        'songCount', coalesce(song_stats.song_count, 0),
        'totalPlays', coalesce(song_stats.total_plays, 0),
        'totalReleases', coalesce(release_stats.release_count, 0),
        'revenueGenerated', coalesce(release_stats.total_revenue, 0),
        'photo', p.photo_url,
        'isVerified', p.is_verified
      )
      order by p.created_at desc, p.user_id
    ),
    '[]'::jsonb
  )
  into result
  from public.profiles p
  left join public.private_profiles pp on pp.user_id = p.user_id
  left join public.subscriptions sub on sub.user_id = p.user_id
  left join (
    select composer_id, count(*) as song_count, coalesce(sum(play_count), 0) as total_plays
    from public.songs
    group by composer_id
  ) song_stats on song_stats.composer_id = p.user_id
  left join (
    select composer_id, count(*) as release_count, coalesce(sum(agreed_value), 0) as total_revenue
    from public.releases
    group by composer_id
  ) release_stats on release_stats.composer_id = p.user_id;

  return result;
end;
$$;

revoke execute on function public.get_admin_composers() from public, anon;
grant execute on function public.get_admin_composers() to authenticated;

create or replace function public.admin_set_profile_verified(
  p_user_id uuid,
  p_is_verified boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;

  update public.profiles
  set is_verified = p_is_verified, updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Compositor não encontrado.';
  end if;
end;
$$;

revoke execute on function public.admin_set_profile_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_profile_verified(uuid, boolean) to authenticated;

drop policy if exists "logs admin" on public.system_logs;
drop policy if exists "logs admin read" on public.system_logs;
drop policy if exists "logs finance read" on public.system_logs;
create policy "logs finance read"
on public.system_logs
for select
to authenticated
using (public.can_manage_composer_subscriptions());

-- Impede que o cliente forje o campo actor; toda escrita passa pela RPC abaixo.
revoke insert on public.system_logs from anon, authenticated;

create or replace function public.write_system_audit_log(
  p_id text,
  p_category text,
  p_title text,
  p_description text,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_email text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;
  if p_category not in ('auth', 'financial', 'moderation', 'system')
     or p_status not in ('info', 'success', 'warning', 'error')
     or nullif(btrim(p_id), '') is null
     or nullif(btrim(p_title), '') is null
     or length(p_title) > 200
     or length(p_description) > 2000 then
    raise exception using errcode = '23514', message = 'Evento de auditoria inválido.';
  end if;

  select email into actor_email from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (p_id, p_category, btrim(p_title), p_description, coalesce(actor_email, auth.uid()::text), p_status);
end;
$$;

revoke execute on function public.write_system_audit_log(text, text, text, text, text) from public, anon;
grant execute on function public.write_system_audit_log(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
-- END ADMIN COMPOSERS MANAGEMENT

-- BEGIN ADMIN FINANCIAL AUDIT
-- Corrige a auditoria financeira global e o vínculo com termos de liberação.
-- Execute após admin_composers_management.sql. É idempotente.

alter table public.releases add column if not exists sent_to_buyer_at timestamptz;
alter table public.interest_requests
  add column if not exists platform_fee_percentage numeric(5,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists composer_net_amount numeric(12,2);

-- Registros históricos permanecem nulos porque a taxa vigente na data do
-- pagamento não pode ser reconstruída com segurança a partir da configuração atual.

create or replace function public.capture_payment_financial_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fee_percentage numeric(5,2);
begin
  if old.payment_received_at is not null
     and old.agreed_value is distinct from new.agreed_value then
    raise exception using errcode = '23514', message = 'O valor não pode ser alterado após a confirmação do pagamento.';
  end if;
  if old.platform_fee_percentage is distinct from new.platform_fee_percentage
     or old.platform_fee_amount is distinct from new.platform_fee_amount
     or old.composer_net_amount is distinct from new.composer_net_amount then
    raise exception using errcode = '42501', message = 'O snapshot financeiro é imutável.';
  end if;

  if old.payment_received_at is null and new.payment_received_at is not null then
    if new.agreed_value is null or new.agreed_value <= 0 then
      raise exception using errcode = '23514', message = 'O pagamento exige valor acordado válido.';
    end if;
    select platform_fee_percentage into v_fee_percentage
    from public.platform_settings where id = true;
    v_fee_percentage := coalesce(v_fee_percentage, 0);
    if v_fee_percentage < 0 or v_fee_percentage > 100 then
      raise exception using errcode = '23514', message = 'A taxa da plataforma está fora do intervalo permitido.';
    end if;
    new.platform_fee_percentage := v_fee_percentage;
    new.platform_fee_amount := round(new.agreed_value * v_fee_percentage / 100, 2);
    new.composer_net_amount := new.agreed_value - new.platform_fee_amount;
  end if;
  return new;
end;
$$;
revoke execute on function public.capture_payment_financial_snapshot() from public, anon, authenticated;
drop trigger if exists capture_payment_financial_snapshot on public.interest_requests;
create trigger capture_payment_financial_snapshot
before update on public.interest_requests
for each row execute function public.capture_payment_financial_snapshot();

drop function if exists public.get_admin_global_requests(integer, integer, text, text);
create function public.get_admin_global_requests(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default null
)
returns table (
  id uuid, song_id uuid, song_title text, song_cover text,
  composer_id uuid, composer_name text, buyer_name text,
  buyer_stage_name text, cpf_cnpj text, buyer_email text,
  buyer_whatsapp text, buyer_city_state text, purpose text, message text,
  status text, agreed_value numeric, notes text, created_at timestamptz,
  payment_received_at timestamptz, archive_reason text, archived_at timestamptz,
  updated_at timestamptz, release_id uuid, platform_fee_percentage numeric,
  platform_fee_amount numeric, composer_net_amount numeric, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 500);
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à auditoria financeira.';
  end if;
  if length(coalesce(p_search, '')) > 100
     or (p_status is not null and p_status <> 'all' and p_status not in
       ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada')) then
    raise exception using errcode = '23514', message = 'Filtros da auditoria financeira inválidos.';
  end if;

  return query
  with filtered as (
    select r.id, r.song_id, s.title as song_title, s.cover_url as song_cover,
      r.composer_id, p.name as composer_name, r.buyer_name, r.buyer_stage_name,
      r.cpf_cnpj, r.buyer_email, r.buyer_whatsapp, r.buyer_city_state,
      r.purpose, r.message, r.status, r.agreed_value, r.notes, r.created_at,
      r.payment_received_at, r.archive_reason, r.archived_at, r.updated_at,
      rel.id as release_id, r.platform_fee_percentage,
      r.platform_fee_amount, r.composer_net_amount
    from public.interest_requests r
    left join public.songs s on s.id = r.song_id
    left join public.profiles p on p.user_id = r.composer_id
    left join public.releases rel on rel.request_id = r.id
    where (p_status is null or p_status = 'all' or r.status = p_status)
      and (v_search is null
        or s.title ilike '%' || v_search || '%'
        or r.buyer_name ilike '%' || v_search || '%'
        or p.name ilike '%' || v_search || '%'
        or r.buyer_email ilike '%' || v_search || '%'
        or r.cpf_cnpj ilike '%' || v_search || '%'
        or rel.document_code ilike '%' || v_search || '%')
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by coalesce(f.payment_received_at, f.created_at) desc, f.id desc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;
revoke execute on function public.get_admin_global_requests(integer, integer, text, text) from public, anon;
grant execute on function public.get_admin_global_requests(integer, integer, text, text) to authenticated;

drop function if exists public.get_admin_global_releases(integer, integer, text);
create function public.get_admin_global_releases(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null
)
returns table (
  id uuid, request_id uuid, song_id uuid, song_title text, authors text,
  composer_name text, composer_cpf text, composer_city_state text,
  buyer_name text, buyer_document text, buyer_city_state text,
  agreed_value numeric, authorized_purpose text, release_type text,
  issue_date date, expires_at date, additional_conditions text, digital_signature text,
  document_code text, document_path text, document_hash text,
  template_version text, document_archived_at timestamptz,
  sent_to_buyer_at timestamptz, created_at timestamptz, total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 500);
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à auditoria financeira.';
  end if;
  if length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = '23514', message = 'Filtro de termos inválido.';
  end if;

  return query
  with filtered as (
    select rel.id, rel.request_id, rel.song_id, rel.song_title, rel.authors,
      rel.composer_name, rel.composer_cpf, rel.composer_city_state,
      rel.buyer_name, rel.buyer_document, rel.buyer_city_state,
      rel.agreed_value, rel.authorized_purpose, rel.release_type,
      rel.issue_date, rel.expires_at, rel.additional_conditions, rel.digital_signature,
      rel.document_code, rel.document_path, rel.document_hash,
      rel.template_version, rel.document_archived_at,
      rel.sent_to_buyer_at, rel.created_at
    from public.releases rel
    where v_search is null
      or rel.song_title ilike '%' || v_search || '%'
      or rel.buyer_name ilike '%' || v_search || '%'
      or rel.composer_name ilike '%' || v_search || '%'
      or rel.document_code ilike '%' || v_search || '%'
      or rel.buyer_document ilike '%' || v_search || '%'
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;
revoke execute on function public.get_admin_global_releases(integer, integer, text) from public, anon;
grant execute on function public.get_admin_global_releases(integer, integer, text) to authenticated;

drop policy if exists "release documents owner or admin read" on storage.objects;
drop policy if exists "release documents owner or finance read" on storage.objects;
create policy "release documents owner or finance read" on storage.objects
for select to authenticated
using (
  bucket_id = 'release-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text
    or public.can_manage_composer_subscriptions())
);

notify pgrst, 'reload schema';
-- END ADMIN FINANCIAL AUDIT

-- BEGIN ADMIN SETTINGS GOVERNANCE
-- Protege configurações, papéis administrativos e o fluxo LGPD.
-- Execute após admin_composers_management.sql. É idempotente.

-- Unifica o tipo usado pela função de auditoria nos schemas antigos e novos.
alter table public.system_logs alter column id type text using id::text;

-- A chave Pix master é um dado financeiro sensível: a tabela nunca é legível
-- diretamente pelo cliente e a chave jamais trafega em texto claro por padrão.
revoke select, update on table public.platform_settings from anon, authenticated;
drop policy if exists "settings public read" on public.platform_settings;
drop policy if exists "settings admin update" on public.platform_settings;

-- Preview seguro: preserva apenas os 4 últimos caracteres para conferência visual.
create or replace function public.mask_pix_key(p_key text)
returns text language sql immutable set search_path='' as $$
  select case
    when coalesce(btrim(p_key),'')='' then ''
    when length(btrim(p_key))<=4 then repeat('•',length(btrim(p_key)))
    else concat(repeat('•',least(length(btrim(p_key))-4,12)),right(btrim(p_key),4))
  end
$$;
revoke execute on function public.mask_pix_key(text) from public;
grant execute on function public.mask_pix_key(text) to anon,authenticated;

create or replace function public.get_platform_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.platform_settings%rowtype; admin boolean:=public.is_admin();
begin
  select * into strict s from public.platform_settings where id=true;
  return jsonb_build_object(
    'platformName',s.platform_name,'tagline',s.tagline,'planMonthlyPrice',s.plan_monthly_price,
    'planMaxSongs',s.plan_max_songs,'platformFeePercentage',s.platform_fee_percentage,
    'supportWhatsapp',s.support_whatsapp,'supportEmail',s.support_email,
    'pixKeyMasked',case when admin then public.mask_pix_key(s.pix_key) else '' end,
    'pixKeyConfigured',case when admin then coalesce(btrim(s.pix_key),'')<>'' else false end,
    'maintenanceMode',s.maintenance_mode,'systemAnnouncement',s.system_announcement,
    'requireApprovalForNewSongs',s.require_approval_for_new_songs,
    'termsVersion',s.terms_version,'updatedAt',s.updated_at);
end; $$;
revoke execute on function public.get_platform_settings() from public;
grant execute on function public.get_platform_settings() to anon,authenticated;

-- Exibição em texto claro é uma operação explícita, exige sessão reautenticada
-- há menos de 5 minutos e fica registrada na trilha de auditoria.
create or replace function public.admin_reveal_pix_key()
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
    raise exception using errcode='42501',message='Reautenticação recente necessária para exibir a chave Pix master.';
  end if;
  select pix_key into strict k from public.platform_settings where id=true;
  perform public.write_system_audit_log(gen_random_uuid()::text,'financial','Chave Pix master exibida',
    'Um administrador solicitou a exibição em texto claro da chave Pix master de recebimento.','warning');
  return jsonb_build_object('pixKey',coalesce(k,''));
end; $$;
revoke execute on function public.admin_reveal_pix_key() from public,anon;
grant execute on function public.admin_reveal_pix_key() to authenticated;

create or replace function public.admin_update_platform_settings(p_settings jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cur public.platform_settings%rowtype; changed timestamptz:=clock_timestamp(); fee numeric; max_songs integer;
  critical boolean; jwt_iat bigint; has_pix boolean; next_pix text;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  select * into cur from public.platform_settings where id=true for update;
  if not found then raise exception using errcode='P0002',message='Configuração da plataforma não encontrada.'; end if;
  if p_expected_updated_at is null or cur.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='As configurações foram alteradas em outra sessão. Recarregue antes de salvar.';
  end if;
  begin
    fee:=(p_settings->>'platformFeePercentage')::numeric; max_songs:=(p_settings->>'planMaxSongs')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode='23514',message='Valores numéricos das configurações são inválidos.';
  end;
  -- A chave só muda quando enviada explicitamente; ausente significa "manter".
  -- Assim um salvamento comum (ou um reset) nunca apaga a chave em vigor.
  has_pix:=(p_settings ? 'pixKey') and jsonb_typeof(p_settings->'pixKey')='string';
  next_pix:=case when has_pix then btrim(p_settings->>'pixKey') else cur.pix_key end;
  if nullif(btrim(p_settings->>'platformName'),'') is null or fee not between 0 and 100 or max_songs<1
    or (p_settings->>'planMonthlyPrice')::numeric<0 or length(coalesce(p_settings->>'tagline',''))>300
    or length(coalesce(p_settings->>'systemAnnouncement',''))>1000 or length(coalesce(p_settings->>'supportEmail',''))>320
    or length(coalesce(p_settings->>'supportWhatsapp',''))>40 or length(coalesce(next_pix,''))>200
    or length(coalesce(p_settings->>'termsVersion',''))>40 then
    raise exception using errcode='23514',message='Configurações da plataforma inválidas.';
  end if;
  critical:=cur.pix_key is distinct from next_pix or cur.platform_fee_percentage is distinct from fee;
  if critical then
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
      raise exception using errcode='42501',message='Reautenticação recente necessária para alterar Pix ou taxa.';
    end if;
  end if;
  update public.platform_settings set platform_name=btrim(p_settings->>'platformName'),tagline=coalesce(p_settings->>'tagline',''),
    plan_monthly_price=(p_settings->>'planMonthlyPrice')::numeric,plan_max_songs=max_songs,platform_fee_percentage=fee,
    support_whatsapp=coalesce(p_settings->>'supportWhatsapp',''),support_email=lower(btrim(coalesce(p_settings->>'supportEmail',''))),
    pix_key=coalesce(next_pix,''),maintenance_mode=coalesce((p_settings->>'maintenanceMode')::boolean,false),
    system_announcement=coalesce(p_settings->>'systemAnnouncement',''),
    require_approval_for_new_songs=coalesce((p_settings->>'requireApprovalForNewSongs')::boolean,true),
    terms_version=coalesce(nullif(btrim(p_settings->>'termsVersion'),''),cur.terms_version),updated_at=changed where id=true;
  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Configurações da plataforma atualizadas',
    concat('Alteração administrativa; campos financeiros críticos: ',critical::text),case when critical then 'warning' else 'info' end);
  return public.get_platform_settings();
end; $$;
revoke execute on function public.admin_update_platform_settings(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_update_platform_settings(jsonb,timestamptz) to authenticated;

create or replace function public.admin_revoke_user_role(p_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n bigint; r text:=lower(btrim(p_role)); jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if r not in ('admin','moderator','financial') then raise exception using errcode='23514',message='Papel inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('admin-role-governance'));
  if r='admin' then
    if p_user_id=auth.uid() then raise exception using errcode='23514',message='Você não pode revogar seu próprio acesso administrativo.'; end if;
    select count(*) into n from public.user_roles where role='admin';
    if n<=1 then raise exception using errcode='23514',message='A plataforma deve manter pelo menos um administrador.'; end if;
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then raise exception using errcode='42501',message='Reautenticação recente necessária.'; end if;
  end if;
  delete from public.user_roles where user_id=p_user_id and role=r;
  if not found then raise exception using errcode='P0002',message='Papel não encontrado para este usuário.'; end if;
  perform public.write_system_audit_log(gen_random_uuid()::text,'auth','Papel administrativo revogado',concat('Papel ',r,' revogado do usuário ',p_user_id),'warning');
  return jsonb_build_object('success',true);
end; $$;
revoke execute on function public.admin_revoke_user_role(uuid,text) from public,anon;
grant execute on function public.admin_revoke_user_role(uuid,text) to authenticated;

create or replace function public.admin_assign_user_role(p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; r text:=lower(btrim(p_role)); jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if r not in ('admin','moderator','financial') then raise exception using errcode='23514',message='Papel inválido.'; end if;
  if r='admin' then
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then raise exception using errcode='42501',message='Reautenticação recente necessária.'; end if;
  end if;
  select id into uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if uid is null then select user_id into uid from public.private_profiles where lower(email)=lower(btrim(p_email)) limit 1; end if;
  if uid is null then raise exception using errcode='P0002',message='Usuário não encontrado.'; end if;
  insert into public.user_roles(user_id,role) values(uid,r) on conflict do nothing;
  perform public.write_system_audit_log(gen_random_uuid()::text,'auth','Papel administrativo concedido',concat('Papel ',r,' concedido ao usuário ',uid),'warning');
  return jsonb_build_object('success',true,'userId',uid,'role',r);
end; $$;
revoke execute on function public.admin_assign_user_role(text,text) from public,anon;
grant execute on function public.admin_assign_user_role(text,text) to authenticated;

create or replace function public.admin_update_deletion_request(p_request_id uuid,p_status text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if p_status not in ('em_analise','rejeitada') then
    raise exception using errcode='23514',message='A conclusão exige a rotina segura de eliminação e não pode ser apenas marcada manualmente.';
  end if;
  if length(coalesce(p_admin_notes,''))>2000 then raise exception using errcode='23514',message='Parecer administrativo muito longo.'; end if;
  update public.account_deletion_requests set status=p_status,admin_notes=nullif(btrim(p_admin_notes),''),
    resolved_at=case when p_status='rejeitada' then clock_timestamp() else null end,updated_at=clock_timestamp()
  where id=p_request_id and status in ('pendente','em_analise','rejeitada') returning to_jsonb(account_deletion_requests.*) into result;
  if result is null then raise exception using errcode='P0002',message='Solicitação não encontrada ou já concluída.'; end if;
  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Solicitação LGPD atualizada',concat('Solicitação ',p_request_id,' movida para ',p_status),'warning');
  return result;
end; $$;
revoke execute on function public.admin_update_deletion_request(uuid,text,text) from public,anon;
grant execute on function public.admin_update_deletion_request(uuid,text,text) to authenticated;
revoke update on table public.account_deletion_requests from authenticated;
-- Sem política de update: "concluida" não pode ser marcada por PATCH direto,
-- só pela rotina abaixo, que de fato elimina os dados.
drop policy if exists "deletion requests admin update" on public.account_deletion_requests;

-- Rotina que efetivamente cumpre a solicitação de exclusão (LGPD art. 18, VI).
-- Anonimiza em vez de dar DELETE no usuário porque todas as tabelas descem em
-- cascata de auth.users: apagar a linha destruiria junto o histórico financeiro
-- e os termos de liberação já assinados, que a plataforma e o contratante têm
-- obrigação/direito de reter (LGPD art. 16, I e art. 7º, VI). O que é dado
-- pessoal sem base de retenção é apagado; o que tem base é pseudonimizado.
create or replace function public.admin_finalize_account_deletion(p_request_id uuid,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req public.account_deletion_requests%rowtype; uid uuid; tag text; result jsonb; jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
    raise exception using errcode='42501',message='Reautenticação recente necessária para concluir uma exclusão de conta.';
  end if;
  if length(coalesce(p_admin_notes,''))>2000 then raise exception using errcode='23514',message='Parecer administrativo muito longo.'; end if;

  select * into req from public.account_deletion_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Solicitação não encontrada.'; end if;
  if req.status='concluida' then raise exception using errcode='23514',message='Esta solicitação já foi concluída.'; end if;
  if req.status='rejeitada' then raise exception using errcode='23514',message='Uma solicitação rejeitada não pode ser concluída. Reabra-a antes.'; end if;
  uid:=req.user_id;

  -- Uma conta administrativa não é eliminada sem antes perder o papel: evita
  -- ficar sem administrador e força a decisão a passar pela trava de RBAC.
  if exists(select 1 from public.user_roles where user_id=uid and role='admin') then
    raise exception using errcode='23514',message='Revogue o papel de administrador desta conta antes de concluir a exclusão.';
  end if;

  tag:=substr(md5(uid::text),1,10);

  -- 1. Dados pessoais sem base de retenção: eliminação.
  delete from public.private_profiles where user_id=uid;   -- e-mail, whatsapp, CPF, chave Pix
  delete from public.song_drafts       where user_id=uid;
  delete from public.user_preferences  where user_id=uid;
  delete from public.user_notifications where user_id=uid;
  delete from public.user_roles        where user_id=uid;

  -- 2. Perfil público: pseudonimizado (a linha sustenta as FKs do histórico).
  update public.profiles set
    username=concat('usuario-removido-',tag), name='', stage_name='Usuário removido',
    city='', state='', bio='', experience_years='', genres='{}',
    instagram='', youtube='', website='', photo_url='', cover_photo_url='',
    society='', spotify='', is_verified=false, updated_at=clock_timestamp()
  where user_id=uid;

  -- 3. Obras saem do ar. Não são apagadas porque releases/interest_requests
  --    descem em cascata de songs e levariam os contratos junto.
  update public.songs set status='rejected', is_available_for_release=false,
    is_featured=false, updated_at=clock_timestamp()
  where composer_id=uid;

  -- 4. Credenciais invalidadas: sem e-mail utilizável, sem senha, banido.
  update auth.users set
    email=concat('removido-',tag,'@invalido.local'), phone=null,
    encrypted_password=concat('removido-',gen_random_uuid()::text),
    email_change='', phone_change='', raw_user_meta_data='{}'::jsonb,
    banned_until='infinity'::timestamptz, updated_at=clock_timestamp()
  where id=uid;

  update public.account_deletion_requests set status='concluida',
    admin_notes=nullif(btrim(p_admin_notes),''), user_email=concat('removido-',tag,'@invalido.local'),
    user_name='Usuário removido', reason=null,
    resolved_at=clock_timestamp(), updated_at=clock_timestamp()
  where id=p_request_id returning to_jsonb(account_deletion_requests.*) into result;

  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Exclusão de conta concluída (LGPD)',
    concat('Solicitação ',p_request_id,': dados pessoais eliminados e perfil pseudonimizado sob a marca ',tag,
           '. Termos de liberação e histórico financeiro retidos por obrigação legal.'),'warning');
  return result;
end; $$;
revoke execute on function public.admin_finalize_account_deletion(uuid,text) from public,anon;
grant execute on function public.admin_finalize_account_deletion(uuid,text) to authenticated;

notify pgrst,'reload schema';
-- END ADMIN SETTINGS GOVERNANCE
