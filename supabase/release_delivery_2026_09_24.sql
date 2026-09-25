-- ==============================================================================
-- Entrega da obra ao cliente: termo, música completa e letra
-- Execute DEPOIS de buyer_request_receipt_2026_09_24.sql. É idempotente.
--
-- Ao emitir o termo, o e-mail do cliente passa a levar um link de entrega
-- (/entrega/<token>) com o termo, a faixa completa e a letra. O arquivo fica no
-- bucket privado song-originals; a Edge Function release-delivery confere o
-- token e devolve um link assinado de poucos minutos. O token vale 30 dias, é
-- guardado só como hash e o compositor pode reenviá-lo (o que gera um novo).
-- Cada acesso é registrado como prova de entrega.
-- A emissão do termo passa a exigir a faixa completa enviada pelo Player Studio.
-- ==============================================================================

create table if not exists public.release_deliveries (
  id uuid primary key default gen_random_uuid(),
  release_id uuid not null unique references public.releases(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  token_hash text not null unique,
  -- A letra é registrada como foi licenciada; editar a obra depois não muda a entrega.
  lyrics text not null default '',
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  renewed_at timestamptz,
  email_status text not null default 'pending' check (email_status in ('pending', 'retry', 'sent', 'failed')),
  email_queued_at timestamptz,
  -- Só é preenchido depois que o provedor de e-mail aceita a mensagem.
  last_sent_at timestamptz,
  email_failed_at timestamptz,
  email_last_error text,
  views integer not null default 0,
  audio_downloads integer not null default 0,
  lyrics_downloads integer not null default 0,
  first_audio_download_at timestamptz,
  last_access_at timestamptz
);
create index if not exists release_deliveries_composer_idx on public.release_deliveries(composer_id);

-- Compatibilidade para quem já executou uma versão anterior desta migration.
alter table public.release_deliveries add column if not exists email_status text;
alter table public.release_deliveries add column if not exists email_queued_at timestamptz;
alter table public.release_deliveries add column if not exists email_failed_at timestamptz;
alter table public.release_deliveries add column if not exists email_last_error text;
update public.release_deliveries
set email_queued_at = last_sent_at,
    email_status = 'pending',
    last_sent_at = null
where email_queued_at is null and last_sent_at is not null;
update public.release_deliveries set email_status = coalesce(email_status, 'pending');
alter table public.release_deliveries alter column email_status set default 'pending';
alter table public.release_deliveries alter column email_status set not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'release_deliveries_email_status_check') then
    alter table public.release_deliveries add constraint release_deliveries_email_status_check
      check (email_status in ('pending', 'retry', 'sent', 'failed'));
  end if;
end $$;

create table if not exists public.release_delivery_events (
  id bigint generated always as identity primary key,
  delivery_id uuid not null references public.release_deliveries(id) on delete cascade,
  kind text not null check (kind in ('view', 'audio', 'lyrics')),
  created_at timestamptz not null default now()
);
create index if not exists release_delivery_events_delivery_idx on public.release_delivery_events(delivery_id, created_at desc);

alter table public.release_deliveries enable row level security;
alter table public.release_delivery_events enable row level security;
revoke all on table public.release_deliveries, public.release_delivery_events from anon, authenticated;
grant select on table public.release_deliveries, public.release_delivery_events to authenticated;
grant all on table public.release_deliveries, public.release_delivery_events to service_role;

drop policy if exists "delivery owner read" on public.release_deliveries;
create policy "delivery owner read" on public.release_deliveries
  for select to authenticated using (auth.uid() = composer_id or public.is_admin());
drop policy if exists "delivery events owner read" on public.release_delivery_events;
create policy "delivery events owner read" on public.release_delivery_events
  for select to authenticated using (exists (
    select 1 from public.release_deliveries d
    where d.id = delivery_id and (d.composer_id = auth.uid() or public.is_admin())
  ));

-- ------------------------------------------------------------------------------
-- Token de entrega: 64 caracteres aleatórios; no banco fica só o SHA-256.
-- ------------------------------------------------------------------------------
create or replace function public.issue_release_delivery_token(p_release_id uuid, p_lyrics text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash text := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');
  v_composer uuid;
begin
  select composer_id into v_composer from public.releases where id = p_release_id;
  if v_composer is null then
    raise exception using errcode = 'P0002', message = 'Termo de liberação não encontrado.';
  end if;
  insert into public.release_deliveries(release_id, composer_id, token_hash, lyrics, expires_at)
  values (p_release_id, v_composer, v_hash, coalesce(p_lyrics, ''), now() + interval '30 days')
  on conflict (release_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        renewed_at = now();
  return v_token;
end $$;
revoke execute on function public.issue_release_delivery_token(uuid, text) from public, anon, authenticated;

-- Registro atômico de acesso, chamado pela Edge Function (service_role).
create or replace function public.register_release_delivery_access(p_delivery_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view', 'audio', 'lyrics') then
    raise exception using errcode = '23514', message = 'Tipo de acesso inválido.';
  end if;
  update public.release_deliveries set
    views = views + (p_kind = 'view')::int,
    audio_downloads = audio_downloads + (p_kind = 'audio')::int,
    lyrics_downloads = lyrics_downloads + (p_kind = 'lyrics')::int,
    first_audio_download_at = case when p_kind = 'audio' then coalesce(first_audio_download_at, now()) else first_audio_download_at end,
    last_access_at = now()
  where id = p_delivery_id;
  insert into public.release_delivery_events(delivery_id, kind) values (p_delivery_id, p_kind);
end $$;
revoke execute on function public.register_release_delivery_access(uuid, text) from public, anon, authenticated;
grant execute on function public.register_release_delivery_access(uuid, text) to service_role;

-- ------------------------------------------------------------------------------
-- A emissão exige a faixa completa: sem ela não há o que entregar.
-- ------------------------------------------------------------------------------
create or replace function public.require_release_full_audio() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.songs
    where id = new.song_id and nullif(btrim(coalesce(original_audio_path, '')), '') is not null
  ) then
    raise exception using errcode = '23514',
      message = 'Envie a música completa pelo Player Studio antes de emitir o termo. Ela é entregue ao cliente junto com o termo e a letra.';
  end if;
  return new;
end $$;
revoke execute on function public.require_release_full_audio() from public, anon, authenticated;
drop trigger if exists require_release_full_audio on public.releases;
create trigger require_release_full_audio
before insert on public.releases
for each row execute function public.require_release_full_audio();

-- ------------------------------------------------------------------------------
-- Fila de e-mails: reenvios da entrega têm origem própria.
-- ------------------------------------------------------------------------------
alter table public.notification_email_outbox
  add column if not exists delivery_send_id uuid;
alter table public.notification_email_outbox
  add column if not exists delivery_id uuid references public.release_deliveries(id) on delete cascade;
update public.notification_email_outbox q
set delivery_id = d.id
from public.release_deliveries d
where q.delivery_id is null and q.release_id = d.release_id;

-- Reconstrói o melhor estado conhecido dos envios anteriores a esta versão.
with latest as (
  select distinct on (delivery_id)
    delivery_id, status, created_at, updated_at, sent_at, last_error
  from public.notification_email_outbox
  where delivery_id is not null
  order by delivery_id, created_at desc
)
update public.release_deliveries d set
  email_status = case when q.status = 'processing' then 'pending' else q.status end,
  email_queued_at = coalesce(d.email_queued_at, q.created_at),
  last_sent_at = case when q.status = 'sent' then coalesce(q.sent_at, q.updated_at) else d.last_sent_at end,
  email_failed_at = case when q.status = 'failed' then q.updated_at else null end,
  email_last_error = case when q.status in ('retry', 'failed') then q.last_error else null end
from latest q where q.delivery_id = d.id;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_delivery_send_id_key') then
    alter table public.notification_email_outbox
      add constraint notification_email_outbox_delivery_send_id_key unique (delivery_send_id);
  end if;
end $$;
alter table public.notification_email_outbox drop constraint if exists notification_email_outbox_origin_check;
alter table public.notification_email_outbox add constraint notification_email_outbox_origin_check
  check (notification_id is not null or release_id is not null or archived_request_id is not null
         or received_request_id is not null or delivery_send_id is not null);

create or replace function public.delivery_email_body(p_buyer_name text, p_composer_name text, p_document_code text,
  p_song_title text, p_agreed_value numeric)
returns text language sql immutable set search_path = '' as $$
  select format('Olá, %s. %s emitiu o termo de liberação %s da obra "%s", no valor acordado de R$ %s. Pelo botão abaixo você baixa o termo oficial em PDF, a música completa e a letra. O link de entrega vale por 30 dias; depois disso, peça um novo ao compositor. Guarde este e-mail.',
    btrim(p_buyer_name), p_composer_name, p_document_code, p_song_title,
    replace(to_char(coalesce(p_agreed_value, 0), 'FM999999990.00'), '.', ','))
$$;
revoke execute on function public.delivery_email_body(text, text, text, text, numeric) from public, anon, authenticated;

-- Espelha atomicamente o estado real do outbox. `last_sent_at` só nasce quando
-- o processador grava `sent` depois da resposta positiva do provedor.
create or replace function public.sync_release_delivery_email_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.delivery_id is null then return new; end if;
  update public.release_deliveries set
    email_status = case when new.status = 'processing' then 'pending' else new.status end,
    email_queued_at = coalesce(email_queued_at, new.created_at),
    last_sent_at = case when new.status = 'sent' then coalesce(new.sent_at, new.updated_at) else last_sent_at end,
    email_failed_at = case when new.status = 'failed' then new.updated_at when new.status = 'sent' then null else email_failed_at end,
    email_last_error = case when new.status in ('retry', 'failed') then left(new.last_error, 500) else null end
  where id = new.delivery_id;
  return new;
end $$;
revoke execute on function public.sync_release_delivery_email_status() from public, anon, authenticated;
drop trigger if exists sync_release_delivery_email_status on public.notification_email_outbox;
create trigger sync_release_delivery_email_status
after insert or update of status, sent_at, last_error on public.notification_email_outbox
for each row execute function public.sync_release_delivery_email_status();

-- ------------------------------------------------------------------------------
-- Termo emitido: aviso ao compositor + e-mail de entrega ao cliente.
-- (Substitui a versão de buyer_copy_and_payment_failure_2026_09_22.sql.)
-- ------------------------------------------------------------------------------
create or replace function public.notify_release_issued() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_buyer_email text;
  v_buyer_ok boolean;
  v_lyrics text;
  v_token text;
  v_delivery_id uuid;
begin
  select lower(btrim(ir.buyer_email)) into v_buyer_email
  from public.interest_requests ir where ir.id = new.request_id;
  v_buyer_ok := coalesce(v_buyer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$', false);

  select coalesce(s.lyrics, '') into v_lyrics from public.songs s where s.id = new.song_id;
  v_token := public.issue_release_delivery_token(new.id, v_lyrics);
  select id into v_delivery_id from public.release_deliveries where release_id = new.id;

  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(
    new.composer_id,
    'Termo de liberação emitido',
    format('O termo %s da obra "%s" foi emitido.%s',
      new.document_code, new.song_title,
      case when v_buyer_ok then ' O link de entrega com o termo, a música completa e a letra foi colocado na fila de e-mail e vale por 30 dias.' else ' O e-mail do intérprete é inválido: corrija o contato antes de reenviar a entrega pelo painel de Liberações.' end),
    'release',
    false,
    '/validar/' || new.document_code
  );

  if v_buyer_ok then
    insert into public.notification_email_outbox(user_id,recipient,subject,body,action_url,audience,release_id,delivery_id)
    values(
      new.composer_id,
      v_buyer_email,
      format('Termo de liberação da obra "%s"', new.song_title),
      public.delivery_email_body(new.buyer_name, new.composer_name, new.document_code, new.song_title, new.agreed_value),
      '/entrega/' || v_token,
      'buyer',
      new.id,
      v_delivery_id
    )
    on conflict (release_id) do nothing;
    update public.release_deliveries set
      email_status = 'pending', email_queued_at = now(), email_failed_at = null, email_last_error = null
    where release_id = new.id;
  else
    update public.release_deliveries set
      email_status = 'failed', email_failed_at = now(), email_last_error = 'E-mail do intérprete inválido.'
    where release_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.notify_release_issued() from public,anon,authenticated;

-- ------------------------------------------------------------------------------
-- Reenvio pelo compositor: novo token (o anterior deixa de valer), mais 30 dias.
-- Também atende termos emitidos antes desta migração.
-- ------------------------------------------------------------------------------
create or replace function public.resend_release_delivery(p_release_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_release public.releases%rowtype;
  v_buyer_email text;
  v_lyrics text;
  v_audio text;
  v_last_sent timestamptz;
  v_token text;
  v_delivery_id uuid;
  v_result jsonb;
begin
  select * into v_release from public.releases where id = p_release_id and composer_id = auth.uid();
  if not found then
    raise exception using errcode = '42501', message = 'Termo de liberação não encontrado para este compositor.';
  end if;

  select lower(btrim(buyer_email)) into v_buyer_email from public.interest_requests where id = v_release.request_id;
  if coalesce(v_buyer_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception using errcode = '23514', message = 'O e-mail informado pelo intérprete é inválido. Envie o termo por outro canal.';
  end if;

  select coalesce(s.lyrics, ''), nullif(btrim(coalesce(s.original_audio_path, '')), '')
    into v_lyrics, v_audio
  from public.songs s where s.id = v_release.song_id;
  if v_audio is null then
    raise exception using errcode = '23514', message = 'Envie a música completa pelo Player Studio antes de enviar a entrega ao cliente.';
  end if;

  select greatest(last_sent_at, email_queued_at) into v_last_sent
  from public.release_deliveries where release_id = p_release_id;
  if v_last_sent is not null and v_last_sent > now() - interval '10 minutes' then
    raise exception using errcode = 'P0001', message = 'A entrega já foi encaminhada há poucos minutos. Aguarde antes de reenviar.';
  end if;

  -- A letra registrada na primeira entrega é mantida; termos antigos recebem a atual.
  v_token := public.issue_release_delivery_token(p_release_id, v_lyrics);
  select id into v_delivery_id from public.release_deliveries where release_id = p_release_id;

  insert into public.notification_email_outbox(user_id, recipient, subject, body, action_url, audience, delivery_send_id, delivery_id)
  values (
    v_release.composer_id, v_buyer_email,
    format('Termo de liberação da obra "%s"', v_release.song_title),
    public.delivery_email_body(v_release.buyer_name, v_release.composer_name, v_release.document_code, v_release.song_title, v_release.agreed_value),
    '/entrega/' || v_token, 'buyer', gen_random_uuid(), v_delivery_id
  );
  update public.release_deliveries set
    email_status = 'pending', email_queued_at = now(), email_failed_at = null, email_last_error = null
  where release_id = p_release_id
  returning jsonb_build_object('expiresAt', expires_at, 'queuedAt', email_queued_at,
    'emailStatus', email_status, 'lastSentAt', last_sent_at) into v_result;
  return v_result;
end $$;
revoke execute on function public.resend_release_delivery(uuid) from public, anon;
grant execute on function public.resend_release_delivery(uuid) to authenticated;

notify pgrst, 'reload schema';
