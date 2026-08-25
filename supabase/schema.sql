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
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(), composer_id uuid not null references public.profiles(user_id) on delete cascade,
  title text not null, genre text not null, subgenre text, authors text not null,
  date_composed date not null, date_registered date not null default current_date, lyrics text not null,
  cover_url text not null default '', registry_code text, notes text,
  status text not null default 'draft' check(status in ('draft','published')),
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

create or replace function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.user_roles where user_id=auth.uid() and role='admin')
$$;
alter table public.profiles enable row level security;
alter table public.private_profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.songs enable row level security;
alter table public.interest_requests enable row level security;
alter table public.releases enable row level security;
alter table public.user_roles enable row level security;
alter table public.platform_settings enable row level security;
alter table public.system_logs enable row level security;
alter table public.user_preferences enable row level security;
drop policy if exists "profile owner or admin" on public.profiles;
drop policy if exists "private owner or admin" on public.private_profiles;
drop policy if exists "subscription owner or admin read" on public.subscriptions;
drop policy if exists "subscription admin update" on public.subscriptions;
drop policy if exists "songs owner or admin" on public.songs;
drop policy if exists "requests owner or admin read" on public.interest_requests;
drop policy if exists "requests public create" on public.interest_requests;
drop policy if exists "requests owner or admin update" on public.interest_requests;
drop policy if exists "releases owner or admin" on public.releases;
drop policy if exists "roles own read" on public.user_roles;
drop policy if exists "settings public read" on public.platform_settings;
drop policy if exists "settings admin update" on public.platform_settings;
drop policy if exists "logs admin" on public.system_logs;
drop policy if exists "preferences owner" on public.user_preferences;
create policy "profile owner or admin" on public.profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());
create policy "private owner or admin" on public.private_profiles for all using(auth.uid()=user_id or public.is_admin()) with check(auth.uid()=user_id or public.is_admin());
create policy "subscription owner or admin read" on public.subscriptions for select using(auth.uid()=user_id or public.is_admin());
create policy "subscription admin update" on public.subscriptions for update using(public.is_admin()) with check(public.is_admin());
create policy "songs owner or admin" on public.songs for all using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());
create policy "requests owner or admin read" on public.interest_requests for select using(auth.uid()=composer_id or public.is_admin());
create policy "requests public create" on public.interest_requests for insert to anon,authenticated with check(exists(select 1 from public.songs s where s.id=song_id and s.composer_id=composer_id and s.status='published' and s.is_available_for_release));
create policy "requests owner or admin update" on public.interest_requests for update using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());
create policy "releases owner or admin" on public.releases for all using(auth.uid()=composer_id or public.is_admin()) with check(auth.uid()=composer_id or public.is_admin());
create policy "roles own read" on public.user_roles for select using(auth.uid()=user_id or public.is_admin());
create policy "settings public read" on public.platform_settings for select using(true);
create policy "settings admin update" on public.platform_settings for update using(public.is_admin()) with check(public.is_admin());
create policy "logs admin" on public.system_logs for all using(public.is_admin()) with check(public.is_admin());
create policy "preferences owner" on public.user_preferences for all using(auth.uid()=user_id) with check(auth.uid()=user_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare p jsonb:=coalesce(new.raw_user_meta_data->'profile','{}'::jsonb); base_username text;
begin
  base_username:=coalesce(nullif(p->>'username',''),'compositor-'||substr(new.id::text,1,8));
  if exists(select 1 from public.profiles where username=base_username) then base_username:=base_username||'-'||substr(new.id::text,1,6); end if;
  insert into public.profiles(user_id,username,name,stage_name,city,state,bio,experience_years,genres,instagram,youtube,website,photo_url,cover_photo_url)
  values(new.id,base_username,coalesce(p->>'name',''),coalesce(p->>'stageName',p->>'name',''),coalesce(p->>'city',''),coalesce(p->>'state',''),coalesce(p->>'bio',''),coalesce(p->>'experienceYears',''),coalesce(array(select jsonb_array_elements_text(coalesce(p->'genres','[]'::jsonb))),'{}'),coalesce(p->>'instagram',''),coalesce(p->>'youtube',''),coalesce(p->>'website',''),coalesce(p->>'photo',''),coalesce(p->>'coverPhoto',''));
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
) from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where p.username=p_username limit 1
$$;
grant execute on function public.get_public_composer(text) to anon,authenticated;
create or replace function public.get_featured_composers(p_limit integer default 6) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item),'[]'::jsonb) from(select jsonb_build_object('id',p.user_id,'username',p.username,'name',p.stage_name,'cityState',concat_ws(' - ',p.city,p.state),'genres',p.genres,'songCount',(select count(*) from public.songs s where s.composer_id=p.user_id and s.status='published'),'photo',p.photo_url,'bio',p.bio) item from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where sub.status='active' order by p.is_verified desc,p.views_count desc limit greatest(1,least(p_limit,24))) q
$$;
grant execute on function public.get_featured_composers(integer) to anon,authenticated;

create or replace function public.create_interest_request(p_song_id uuid,p_data jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare owner_id uuid; new_id uuid;
begin
  select composer_id into owner_id from public.songs where id=p_song_id and status='published' and is_available_for_release;
  if owner_id is null then raise exception 'Música indisponível'; end if;
  insert into public.interest_requests(song_id,composer_id,buyer_name,buyer_stage_name,cpf_cnpj,buyer_email,buyer_whatsapp,buyer_city_state,purpose,message)
  values(p_song_id,owner_id,p_data->>'buyerName',p_data->>'buyerStageName',p_data->>'cpfCnpj',p_data->>'buyerEmail',p_data->>'buyerWhatsapp',p_data->>'buyerCityState',p_data->>'purpose',p_data->>'message') returning id into new_id;
  update public.songs set interested_count=interested_count+1 where id=p_song_id; return new_id;
end $$;
grant execute on function public.create_interest_request(uuid,jsonb) to anon,authenticated;
create or replace function public.increment_song_play(p_song_id uuid) returns void language sql security definer set search_path='' as $$
  update public.songs set play_count=play_count+1 where id=p_song_id and status='published'
$$;
grant execute on function public.increment_song_play(uuid) to anon,authenticated;
create or replace function public.update_my_subscription(p_plan_name text,p_monthly_price text,p_payment_method text,p_card_last4 text default null) returns void language sql security definer set search_path='' as $$
  update public.subscriptions set plan_name=coalesce(p_plan_name,plan_name),monthly_price=coalesce(p_monthly_price,monthly_price),payment_method=coalesce(p_payment_method,payment_method),card_last4=coalesce(p_card_last4,card_last4),updated_at=now() where user_id=auth.uid()
$$;
revoke execute on function public.update_my_subscription(text,text,text,text) from public,anon;
grant execute on function public.update_my_subscription(text,text,text,text) to authenticated;

insert into storage.buckets(id,name,public) values('profile-media','profile-media',true),('song-covers','song-covers',true),('song-previews','song-previews',true),('song-originals','song-originals',false),('release-documents','release-documents',false) on conflict(id) do update set public=excluded.public;
drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;
drop policy if exists "private media owner read" on storage.objects;
create policy "media owner insert" on storage.objects for insert to authenticated with check(bucket_id in ('profile-media','song-covers','song-previews','song-originals','release-documents') and (storage.foldername(name))[1]=auth.uid()::text);
create policy "media owner update" on storage.objects for update to authenticated using((storage.foldername(name))[1]=auth.uid()::text) with check((storage.foldername(name))[1]=auth.uid()::text);
create policy "media owner delete" on storage.objects for delete to authenticated using((storage.foldername(name))[1]=auth.uid()::text);
create policy "private media owner read" on storage.objects for select to authenticated using(bucket_id in ('song-originals','release-documents') and ((storage.foldername(name))[1]=auth.uid()::text or public.is_admin()));

-- Promova o proprietário uma vez: insert into public.user_roles(user_id,role) values('SEU-UUID','admin') on conflict do nothing;
