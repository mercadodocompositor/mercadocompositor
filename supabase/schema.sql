-- Schema de produção. Execute integralmente no SQL Editor do Supabase.
create extension if not exists citext;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username citext not null unique, name text not null default '', stage_name text not null default '',
  city text not null default '', state text not null default '', bio text not null default '',
  experience_years text not null default '', genres text[] not null default '{}',
  instagram text not null default '', youtube text not null default '', website text not null default '',
  photo_url text not null default '', cover_photo_url text not null default '',
  views_count bigint not null default 0, is_verified boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.private_profiles (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  email text not null default '', whatsapp text not null default '', cpf text not null default ''
);
create table if not exists public.subscriptions (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  status text not null default 'pending' check(status in ('active','pending','suspended','cancelled')),
  plan_name text not null default 'Plano Bronze', monthly_price text not null default '24,90',
  next_billing_date date, payment_method text not null default 'Pix', card_last4 text, card_brand text,
  invoices jsonb not null default '[]'::jsonb, updated_at timestamptz not null default now()
);

create table if not exists public.subscription_plans (
  name text primary key,
  monthly_price numeric(10,2) not null check(monthly_price >= 0),
  max_songs integer check(max_songs is null or max_songs > 0),
  is_active boolean not null default true,
  sort_order integer not null default 0,
  updated_at timestamptz not null default now()
);
insert into public.subscription_plans(name,monthly_price,max_songs,is_active,sort_order) values
  ('Plano Bronze',24.90,100,true,1),
  ('Plano Prata',34.90,200,true,2),
  ('Plano Ouro',54.90,null,true,3)
on conflict(name) do update set
  monthly_price=excluded.monthly_price,
  max_songs=excluded.max_songs,
  is_active=excluded.is_active,
  sort_order=excluded.sort_order,
  updated_at=now();

-- Novas contas aguardam confirmação financeira pelo backend/administrador.
-- Assinaturas existentes não são rebaixadas nem promovidas automaticamente.
alter table public.subscriptions
  alter column status set default 'pending';

create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(), composer_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null, genre text not null, subgenre text, authors text not null,
  date_composed date not null, date_registered date not null default current_date, lyrics text not null,
  cover_url text not null default '', registry_code text, notes text,
  status text not null default 'draft' check(status in ('draft','pending_approval','published','rejected')),
  is_available_for_release boolean not null default true,
  value_type text not null default 'consultation' check(value_type in ('suggested','consultation')),
  suggested_value numeric(12,2), play_count bigint not null default 0, interested_count bigint not null default 0,
  summary text, original_audio_path text, preview_audio_url text, is_featured boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists songs_composer_idx on public.songs(composer_id);
create table if not exists public.interest_requests (
  id uuid primary key default gen_random_uuid(), song_id uuid not null references public.songs(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  buyer_name text not null, buyer_stage_name text, cpf_cnpj text not null, buyer_email text not null,
  buyer_whatsapp text not null, buyer_city_state text not null, purpose text not null, message text not null,
  status text not null default 'nova' check(status in ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada')),
  agreed_value numeric(12,2), notes text, payment_received_at timestamptz, created_at timestamptz not null default now()
);
create index if not exists requests_composer_idx on public.interest_requests(composer_id,created_at desc);
create table if not exists public.releases (
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique references public.interest_requests(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade, song_title text not null, authors text not null,
  composer_name text not null, composer_cpf text not null, composer_city_state text not null,
  buyer_name text not null, buyer_document text not null, buyer_city_state text not null,
  agreed_value numeric(12,2) not null, authorized_purpose text not null, release_type text not null,
  issue_date date not null, additional_conditions text not null default '', digital_signature text not null,
  document_code text not null unique, document_path text, created_at timestamptz not null default now()
);
create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('admin','composer')), primary key(user_id,role)
);
create table if not exists public.platform_settings (
  id boolean primary key default true check(id), platform_name text not null default 'Mercado do Compositor', tagline text not null default '',
  plan_monthly_price numeric(10,2) not null default 24.90, plan_max_songs integer not null default 100,
  platform_fee_percentage numeric(5,2) not null default 0, support_whatsapp text not null default '', support_email text not null default '',
  pix_key text not null default '', maintenance_mode boolean not null default false, system_announcement text not null default '',
  require_approval_for_new_songs boolean not null default true, terms_version text not null default '1.0', updated_at timestamptz not null default now()
);
insert into public.platform_settings(id) values(true) on conflict do nothing;
create table if not exists public.system_logs (
  id uuid primary key default gen_random_uuid(), category text not null, title text not null, description text not null,
  actor text not null, status text not null, created_at timestamptz not null default now()
);
create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);
create table if not exists public.rpc_rate_limits (
  scope text not null,
  identity_hash text not null,
  window_bucket bigint not null,
  request_count integer not null default 1 check(request_count > 0),
  updated_at timestamptz not null default now(),
  primary key(scope,identity_hash,window_bucket)
);
create index if not exists rpc_rate_limits_updated_idx on public.rpc_rate_limits(updated_at);

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
$$;
alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.songs enable row level security;
alter table public.interest_requests enable row level security;
alter table public.releases enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.system_logs enable row level security;
alter table public.user_preferences enable row level security;
alter table public.rpc_rate_limits enable row level security;
drop policy if exists "profile owner or admin" on public.profiles;
drop policy if exists "private owner or admin" on public.private_profiles;
drop policy if exists "subscription owner or admin read" on public.subscriptions;
drop policy if exists "subscription admin update" on public.subscriptions;
drop policy if exists "plans public read" on public.subscription_plans;
drop policy if exists "plans admin write" on public.subscription_plans;
drop policy if exists "songs owner or admin" on public.songs;
drop policy if exists "requests owner or admin read" on public.interest_requests;
drop policy if exists "requests public create" on public.interest_requests;
drop policy if exists "requests owner or admin update" on public.interest_requests;
drop policy if exists "releases owner or admin" on public.releases;
drop policy if exists "releases owner or admin read" on public.releases;
drop policy if exists "releases admin write" on public.releases;
drop policy if exists "roles own read" on public.user_roles;
drop policy if exists "settings public read" on public.platform_settings;
drop policy if exists "settings admin update" on public.platform_settings;
drop policy if exists "logs admin" on public.system_logs;
drop policy if exists "preferences owner" on public.user_preferences;
create policy "profile owner or admin" on public.profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());
create policy "private owner or admin" on public.private_profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());
create policy "subscription owner or admin read" on public.subscriptions for select using(auth.uid()=user_id or public.is_admin());
create policy "subscription admin update" on public.subscriptions for update using(public.is_admin()) with check(public.is_admin());
create policy "plans public read" on public.subscription_plans for select using(true);
create policy "plans admin write" on public.subscription_plans for all using(public.is_admin()) with check(public.is_admin());
create policy "songs owner or admin" on public.songs for all using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());
create policy "requests owner or admin read" on public.interest_requests for select using(auth.uid()=composer_id or public.is_admin());
create policy "requests owner or admin update" on public.interest_requests for update using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());
create policy "releases owner or admin read" on public.releases for select using(auth.uid()=composer_id or public.is_admin());
create policy "releases admin write" on public.releases for all using(public.is_admin()) with check(public.is_admin());
create policy "roles own read" on public.user_roles for select using(auth.uid()=user_id or public.is_admin());
create policy "settings public read" on public.platform_settings for select using(true);
create policy "settings admin update" on public.platform_settings for update using(public.is_admin()) with check(public.is_admin());
create policy "logs admin" on public.system_logs for all using(public.is_admin()) with check(public.is_admin());
create policy "preferences owner" on public.user_preferences for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

-- RLS controla quais linhas podem ser alteradas, mas não protege colunas da mesma
-- linha. Remove as permissões amplas para impedir que um compositor altere pela
-- API campos administrativos e contadores (is_verified, views_count,
-- is_featured, play_count e interested_count).
revoke update on table public.profiles from anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, updated_at
) on table public.profiles to authenticated;

revoke insert, update on table public.songs from anon, authenticated;
grant insert (
  id, composer_id, title, genre, subgenre, authors, date_composed,
  date_registered, lyrics, cover_url, registry_code, notes, status,
  is_available_for_release, value_type, suggested_value, summary,
  original_audio_path, preview_audio_url, created_at, updated_at
) on table public.songs to authenticated;

-- Solicitações são criadas exclusivamente por create_interest_request. Depois
-- do envio, o compositor pode administrar somente o workflow da negociação;
-- identidade, contato e declarações do interessado permanecem imutáveis.
revoke insert, update on table public.interest_requests from anon, authenticated;
grant update (status, agreed_value, notes, payment_received_at)
on table public.interest_requests to authenticated;

create or replace function public.preserve_interest_request_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
    raise exception using
      errcode = '42501',
      message = 'Os dados originais enviados pelo interessado são imutáveis.';
  end if;
  return new;
end;
$$;

drop trigger if exists preserve_interest_request_identity on public.interest_requests;
create trigger preserve_interest_request_identity
before update on public.interest_requests
for each row execute function public.preserve_interest_request_identity();

revoke execute on function public.preserve_interest_request_identity() from public, anon, authenticated;
grant update (
  title, genre, subgenre, authors, date_composed, date_registered, lyrics,
  cover_url, registry_code, notes, status, is_available_for_release,
  value_type, suggested_value, summary, original_audio_path,
  preview_audio_url, updated_at
) on table public.songs to authenticated;

create or replace function public.admin_set_profile_verified(
  p_user_id uuid,
  p_is_verified boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso administrativo necessário.';
  end if;

  update public.profiles
  set is_verified = p_is_verified, updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Compositor não encontrado.';
  end if;
end;
$$;

create or replace function public.admin_set_song_featured(
  p_song_id uuid,
  p_is_featured boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso administrativo necessário.';
  end if;

  update public.songs
  set is_featured = p_is_featured, updated_at = now()
  where id = p_song_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Música não encontrada.';
  end if;
end;
$$;

revoke execute on function public.admin_set_profile_verified(uuid, boolean) from public, anon;
revoke execute on function public.admin_set_song_featured(uuid, boolean) from public, anon;
grant execute on function public.admin_set_profile_verified(uuid, boolean) to authenticated;
grant execute on function public.admin_set_song_featured(uuid, boolean) to authenticated;

-- Uma liberação oficial nunca é inserida diretamente pelo cliente. A função
-- valida a solicitação, cria um retrato dos dados registrados e conclui o fluxo
-- na mesma transação.
revoke insert, update, delete on table public.releases from anon, authenticated;

create or replace function public.issue_release(
  p_request_id uuid,
  p_release_type text,
  p_additional_conditions text default '',
  p_digital_signature text default ''
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
     or request_row.payment_received_at is null
     or request_row.agreed_value is null
     or request_row.agreed_value <= 0 then
    raise exception using errcode = '23514', message = 'A liberação exige pagamento confirmado e valor acordado válido.';
  end if;
  if exists (select 1 from public.releases where request_id = p_request_id) then
    raise exception using errcode = '23505', message = 'Esta solicitação já possui uma liberação.';
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
    raise exception using errcode = '23514', message = 'Complete o nome e CPF do compositor antes de emitir a liberação.';
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

revoke execute on function public.issue_release(uuid, text, text, text) from public, anon;
grant execute on function public.issue_release(uuid, text, text, text) to authenticated;

-- Consulta pública de autenticidade. Mantém a tabela protegida por RLS e expõe
-- somente os dados necessários para validar o documento, com CPF/CNPJ reduzidos
-- aos quatro últimos dígitos.
create or replace function public.validate_release_document(p_document_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(btrim(coalesce(p_document_code, '')));
  release_row public.releases%rowtype;
begin
  if length(normalized_code) < 12
     or length(normalized_code) > 40
     or normalized_code !~ '^LIB-[0-9]{4}-[A-Z0-9]+$' then
    return null;
  end if;

  select * into release_row
  from public.releases
  where document_code = normalized_code
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'songTitle', release_row.song_title,
    'authors', release_row.authors,
    'composerName', release_row.composer_name,
    'composerDocumentLast4', right(regexp_replace(release_row.composer_cpf, '[^0-9]', '', 'g'), 4),
    'composerCityState', release_row.composer_city_state,
    'buyerName', release_row.buyer_name,
    'buyerDocumentLast4', right(regexp_replace(release_row.buyer_document, '[^0-9]', '', 'g'), 4),
    'buyerCityState', release_row.buyer_city_state,
    'authorizedPurpose', release_row.authorized_purpose,
    'releaseType', release_row.release_type,
    'issueDate', release_row.issue_date,
    'digitalSignature', release_row.digital_signature,
    'documentCode', release_row.document_code
  );
end;
$$;

revoke execute on function public.validate_release_document(text) from public;
grant execute on function public.validate_release_document(text) to anon, authenticated;

create or replace function public.consume_rpc_rate_limit(
  p_scope text,
  p_identity text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  bucket bigint;
  accepted integer;
begin
  if nullif(p_identity,'') is null or p_max_requests < 1 or p_window_seconds < 1 then return false; end if;
  bucket := floor(extract(epoch from clock_timestamp()) / p_window_seconds)::bigint;
  insert into public.rpc_rate_limits(scope,identity_hash,window_bucket,request_count,updated_at)
  values(p_scope,md5(p_identity),bucket,1,now())
  on conflict(scope,identity_hash,window_bucket) do update
    set request_count=public.rpc_rate_limits.request_count+1,updated_at=now()
    where public.rpc_rate_limits.request_count < p_max_requests
  returning request_count into accepted;
  return accepted is not null;
end;
$$;

revoke execute on function public.consume_rpc_rate_limit(text,text,integer,integer) from public,anon,authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb:=coalesce(new.raw_user_meta_data->'profile','{}'::jsonb); base_username text;
begin
  base_username:=coalesce(nullif(p->>'username',''),nullif(new.raw_user_meta_data->>'preferred_username',''),'compositor-'||substr(new.id::text,1,8));
  if exists(select 1 from public.profiles where username=base_username) then base_username:=base_username||'-'||substr(new.id::text,1,6); end if;
  insert into public.profiles(user_id,username,name,stage_name,city,state,bio,experience_years,genres,instagram,youtube,website,photo_url,cover_photo_url)
  values(new.id,base_username,coalesce(nullif(p->>'name',''),new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),coalesce(nullif(p->>'stageName',''),nullif(p->>'name',''),new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),coalesce(p->>'city',''),coalesce(p->>'state',''),coalesce(p->>'bio',''),coalesce(p->>'experienceYears',''),coalesce(array(select jsonb_array_elements_text(coalesce(p->'genres','[]'::jsonb))),'{}'),coalesce(p->>'instagram',''),coalesce(p->>'youtube',''),coalesce(p->>'website',''),coalesce(nullif(p->>'photo',''),new.raw_user_meta_data->>'avatar_url',new.raw_user_meta_data->>'picture',''),coalesce(p->>'coverPhoto',''));
  insert into public.private_profiles(user_id,email,whatsapp,cpf) values(new.id,new.email,coalesce(p->>'whatsapp',''),coalesce(p->>'cpf',''));
  insert into public.subscriptions(user_id) values(new.id);
  insert into public.user_roles(user_id,role) values(new.id,'composer');
  insert into public.user_preferences(user_id) values(new.id);
  return new;
end $$;
drop trigger if exists on_auth_user_created_data on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

-- Backfill idempotente para contas criadas antes deste schema relacional.
insert into public.profiles(user_id,username,name,stage_name)
select u.id,'compositor-'||substr(u.id::text,1,8),coalesce(u.raw_user_meta_data->'profile'->>'name',''),coalesce(u.raw_user_meta_data->'profile'->>'stageName',u.raw_user_meta_data->'profile'->>'name','')
from auth.users u on conflict(user_id) do nothing;
insert into public.private_profiles(user_id,email)
select u.id,coalesce(u.email,'') from auth.users u on conflict(user_id) do nothing;
insert into public.subscriptions(user_id) select id from auth.users on conflict(user_id) do nothing;
insert into public.user_roles(user_id,role) select id,'composer' from auth.users on conflict do nothing;
insert into public.user_preferences(user_id) select id from auth.users on conflict do nothing;

create or replace function public.get_public_composer(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'profile',jsonb_build_object('username',p.username,'name',p.name,'stageName',p.stage_name,'city',p.city,'state',p.state,'bio',p.bio,'experienceYears',p.experience_years,'genres',p.genres,'instagram',p.instagram,'youtube',p.youtube,'website',p.website,'photo',p.photo_url,'coverPhoto',p.cover_photo_url,'viewsCount',p.views_count),
 'subscriptionStatus',sub.status,
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'genre',s.genre,'subgenre',s.subgenre,'authors',s.authors,'dateComposed',s.date_composed,'dateRegistered',s.date_registered,'lyrics',s.lyrics,'coverUrl',s.cover_url,'registryCode',s.registry_code,'status',s.status,'isAvailableForRelease',s.is_available_for_release,'valueType',s.value_type,'suggestedValue',s.suggested_value,'playCount',s.play_count,'interestedCount',s.interested_count,'summary',s.summary,'previewAudioUrl',s.preview_audio_url)) from public.songs s where s.composer_id=p.user_id and s.status='published' and sub.status='active'),'[]'::jsonb)
) from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where p.username=p_username and sub.status='active' limit 1
$$;
grant execute on function public.get_public_composer(text) to anon,authenticated;

-- Conta uma visualização somente para perfis ativos e, por visitante,
-- no máximo uma vez a cada 30 minutos. O navegador nunca altera o contador
-- diretamente.
create or replace function public.increment_profile_view(
  p_username text,
  p_visitor_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_id uuid;
  identity_value text;
begin
  if auth.uid() is null and coalesce(p_visitor_id,'') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;

  select p.user_id into profile_id
  from public.profiles p
  join public.subscriptions sub on sub.user_id=p.user_id and sub.status='active'
  where p.username=p_username
  limit 1;

  if profile_id is null then return false; end if;

  identity_value:=coalesce(auth.uid()::text,lower(p_visitor_id))||':'||coalesce(current_setting('request.headers',true),'');
  if not public.consume_rpc_rate_limit('profile-view-'||profile_id,identity_value,1,1800) then return false; end if;

  update public.profiles
  set views_count=views_count+1
  where user_id=profile_id;
  return found;
end $$;

revoke execute on function public.increment_profile_view(text,text) from public;
grant execute on function public.increment_profile_view(text,text) to anon,authenticated;

create or replace function public.get_featured_composers(p_limit integer default 6) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item),'[]'::jsonb) from(select jsonb_build_object('id',p.user_id,'username',p.username,'name',p.stage_name,'cityState',concat_ws(' - ',p.city,p.state),'genres',p.genres,'songCount',(select count(*) from public.songs s where s.composer_id=p.user_id and s.status='published'),'photo',p.photo_url,'bio',p.bio) item from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where sub.status='active' order by p.is_verified desc,p.views_count desc limit greatest(1,least(p_limit,24))) q
$$;
grant execute on function public.get_featured_composers(integer) to anon,authenticated;

create or replace function public.create_interest_request(p_song_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid; new_id uuid; email_value text; document_digits text; phone_digits text; origin_value text;
begin
  email_value:=lower(btrim(coalesce(p_data->>'buyerEmail','')));
  document_digits:=regexp_replace(coalesce(p_data->>'cpfCnpj',''),'[^0-9]','','g');
  phone_digits:=regexp_replace(coalesce(p_data->>'buyerWhatsapp',''),'[^0-9]','','g');
  origin_value:=coalesce(auth.uid()::text,current_setting('request.headers',true),'anonymous');
  if length(btrim(coalesce(p_data->>'buyerName',''))) not between 2 and 160
     or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(document_digits) not in (11,14)
     or length(phone_digits) not between 10 and 13
     or length(btrim(coalesce(p_data->>'buyerCityState',''))) not between 3 and 160
     or length(btrim(coalesce(p_data->>'purpose',''))) not between 3 and 300
     or length(btrim(coalesce(p_data->>'message',''))) not between 20 and 3000 then
    raise exception using errcode='23514',message='Dados da solicitação inválidos.';
  end if;
  if not public.consume_rpc_rate_limit('interest-person-'||p_song_id,email_value||':'||document_digits,3,3600)
     or not public.consume_rpc_rate_limit('interest-origin',origin_value,30,3600) then
    raise exception using errcode='P0001',message='Limite de solicitações atingido. Tente novamente mais tarde.';
  end if;
  select s.composer_id into owner_id
  from public.songs s
  join public.subscriptions sub on sub.user_id=s.composer_id and sub.status='active'
  where s.id=p_song_id and s.status='published' and s.is_available_for_release;
  if owner_id is null then raise exception 'Música indisponível'; end if;
  insert into public.interest_requests(song_id,composer_id,buyer_name,buyer_stage_name,cpf_cnpj,buyer_email,buyer_whatsapp,buyer_city_state,purpose,message)
  values(p_song_id,owner_id,p_data->>'buyerName',p_data->>'buyerStageName',p_data->>'cpfCnpj',p_data->>'buyerEmail',p_data->>'buyerWhatsapp',p_data->>'buyerCityState',p_data->>'purpose',p_data->>'message') returning id into new_id;
  update public.songs set interested_count=interested_count+1 where id=p_song_id; return new_id;
end $$;
grant execute on function public.create_interest_request(uuid,jsonb) to anon,authenticated;
create or replace function public.increment_song_play(p_song_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin raise exception using errcode='42501',message='Use a versão protegida do contador de reproduções.'; end $$;
revoke execute on function public.increment_song_play(uuid) from public,anon,authenticated;
create or replace function public.increment_song_play(p_song_id uuid,p_visitor_id text) returns boolean language plpgsql security definer set search_path='' as $$
declare identity_value text;
begin
  if auth.uid() is null and coalesce(p_visitor_id,'') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  identity_value:=coalesce(auth.uid()::text,lower(p_visitor_id))||':'||coalesce(current_setting('request.headers',true),'');
  if not public.consume_rpc_rate_limit('song-play-'||p_song_id,identity_value,1,1800) then return false; end if;
  update public.songs s set play_count=s.play_count+1
  where s.id=p_song_id and s.status='published'
    and exists(select 1 from public.subscriptions sub where sub.user_id=s.composer_id and sub.status='active');
  return found;
end $$;
revoke execute on function public.increment_song_play(uuid,text) from public;
grant execute on function public.increment_song_play(uuid,text) to anon,authenticated;
-- Compatibilidade com clientes antigos: a assinatura nunca mais é modificada
-- por dados enviados pelo navegador. O provedor de pagamento ou um admin deve
-- atualizar public.subscriptions usando credenciais de servidor.
create or replace function public.update_my_subscription(p_plan_name text,p_monthly_price text,p_payment_method text,p_card_last4 text default null) returns void language plpgsql security definer set search_path='' as $$
begin
  raise exception using errcode='42501',message='Alterações de assinatura exigem confirmação do provedor de pagamento.';
end $$;
revoke execute on function public.update_my_subscription(text,text,text,text) from public,anon;
revoke execute on function public.update_my_subscription(text,text,text,text) from authenticated;

insert into storage.buckets(id,name,public) values('profile-media','profile-media',true),('song-covers','song-covers',true),('song-previews','song-previews',true),('song-originals','song-originals',false),('release-documents','release-documents',false) on conflict(id) do update set public=excluded.public;
drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;
drop policy if exists "private media owner read" on storage.objects;
drop policy if exists "song originals owner read" on storage.objects;
drop policy if exists "release documents owner or admin read" on storage.objects;
create policy "media owner insert" on storage.objects for insert to authenticated with check(bucket_id in ('profile-media','song-covers','song-previews','song-originals','release-documents') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media owner update" on storage.objects for update to authenticated using((storage.foldername(name))[1]=auth.uid()::text) with check((storage.foldername(name))[1]=auth.uid()::text);
create policy "media owner delete" on storage.objects for delete to authenticated using((storage.foldername(name))[1]=auth.uid()::text);
create policy "song originals owner read" on storage.objects for select to authenticated using(bucket_id='song-originals' and (storage.foldername(name))[1]=auth.uid()::text);
create policy "release documents owner or admin read" on storage.objects for select to authenticated using(bucket_id='release-documents' and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

-- Promova o proprietário uma vez: insert into public.user_roles(user_id,role) values('SEU-UUID','admin') on conflict do nothing;

-- Depois do schema base, execute também supabase/production_hardening.sql.
-- Esse arquivo adiciona validações de publicação, limite do catálogo,
-- preservação de histórico e restrições de tipo/tamanho no Storage.
-- Para ativar a fila de moderação, execute depois supabase/approval_workflow.sql.
-- Para ativar uploads validados no servidor, execute supabase/media_validation.sql.
-- Para ativar a paginação server-side, execute supabase/pagination.sql.
-- Para reforçar o isolamento do áudio original, execute por último supabase/music_security.sql.
