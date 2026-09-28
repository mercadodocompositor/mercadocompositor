-- ==============================================================================
-- Entrega da obra: áudio congelado na emissão, download do termo e pedido de
-- novo link pelo cliente.
-- Execute DEPOIS de release_delivery_2026_09_24.sql e ANTES de
-- verify_workflow_guarantees_2026_09_24.sql. É idempotente.
--
-- 1. A entrega guarda o caminho do áudio completo no momento da emissão, como
--    já fazia com a letra. Trocar o arquivo da obra depois não muda o que o
--    cliente licenciou, e o compositor não consegue apagar o arquivo entregue.
-- 2. Downloads do termo em PDF entram na prova de entrega ('document').
-- 3. Com o link expirado (ou sem áudio), o cliente avisa o compositor pela
--    própria página; no máximo um aviso a cada 24 horas por entrega.
-- ==============================================================================

alter table public.release_deliveries add column if not exists audio_path text;
alter table public.release_deliveries add column if not exists document_downloads integer not null default 0;
alter table public.release_deliveries add column if not exists composer_notified_at timestamptz;
create index if not exists release_deliveries_audio_path_idx on public.release_deliveries(audio_path) where audio_path is not null;

-- Entregas anteriores: o melhor registro disponível é o áudio atual da obra.
update public.release_deliveries d
set audio_path = nullif(btrim(coalesce(s.original_audio_path, '')), '')
from public.releases r
join public.songs s on s.id = r.song_id
where r.id = d.release_id and d.audio_path is null;

alter table public.release_delivery_events drop constraint if exists release_delivery_events_kind_check;
alter table public.release_delivery_events add constraint release_delivery_events_kind_check
  check (kind in ('view', 'audio', 'lyrics', 'document', 'composer_notified'));

-- ------------------------------------------------------------------------------
-- Token de entrega: agora também congela o áudio. O reenvio mantém a letra e o
-- áudio da primeira entrega (termos antigos sem registro recebem os atuais).
-- ------------------------------------------------------------------------------
create or replace function public.issue_release_delivery_token(p_release_id uuid, p_lyrics text default null)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_token text := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_hash text := encode(sha256(convert_to(v_token, 'UTF8')), 'hex');
  v_composer uuid;
  v_audio_path text;
begin
  select r.composer_id, nullif(btrim(coalesce(s.original_audio_path, '')), '')
    into v_composer, v_audio_path
  from public.releases r
  join public.songs s on s.id = r.song_id
  where r.id = p_release_id;
  if v_composer is null then
    raise exception using errcode = 'P0002', message = 'Termo de liberação não encontrado.';
  end if;
  insert into public.release_deliveries(release_id, composer_id, token_hash, lyrics, audio_path, expires_at)
  values (p_release_id, v_composer, v_hash, coalesce(p_lyrics, ''), v_audio_path, now() + interval '30 days')
  on conflict (release_id) do update
    set token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        audio_path = coalesce(public.release_deliveries.audio_path, excluded.audio_path),
        renewed_at = now();
  return v_token;
end $$;
revoke execute on function public.issue_release_delivery_token(uuid, text) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- Registro atômico de acesso, chamado pela Edge Function (service_role).
-- ------------------------------------------------------------------------------
create or replace function public.register_release_delivery_access(p_delivery_id uuid, p_kind text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_kind not in ('view', 'audio', 'lyrics', 'document') then
    raise exception using errcode = '23514', message = 'Tipo de acesso inválido.';
  end if;
  update public.release_deliveries set
    views = views + (p_kind = 'view')::int,
    audio_downloads = audio_downloads + (p_kind = 'audio')::int,
    lyrics_downloads = lyrics_downloads + (p_kind = 'lyrics')::int,
    document_downloads = document_downloads + (p_kind = 'document')::int,
    first_audio_download_at = case when p_kind = 'audio' then coalesce(first_audio_download_at, now()) else first_audio_download_at end,
    last_access_at = now()
  where id = p_delivery_id;
  insert into public.release_delivery_events(delivery_id, kind) values (p_delivery_id, p_kind);
end $$;
revoke execute on function public.register_release_delivery_access(uuid, text) from public, anon, authenticated;
grant execute on function public.register_release_delivery_access(uuid, text) to service_role;

-- ------------------------------------------------------------------------------
-- Aviso do cliente ao compositor (link expirado ou música indisponível).
-- Devolve false quando já houve aviso nas últimas 24 horas.
-- ------------------------------------------------------------------------------
create or replace function public.notify_composer_about_delivery(p_delivery_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_delivery public.release_deliveries%rowtype;
  v_release public.releases%rowtype;
begin
  if p_reason not in ('expired', 'audio_missing') then
    raise exception using errcode = '23514', message = 'Motivo inválido.';
  end if;
  select * into v_delivery from public.release_deliveries where id = p_delivery_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Entrega não encontrada.';
  end if;
  if v_delivery.composer_notified_at is not null and v_delivery.composer_notified_at > now() - interval '24 hours' then
    return false;
  end if;
  select * into v_release from public.releases where id = v_delivery.release_id;

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (
    v_delivery.composer_id,
    case p_reason when 'expired' then 'Cliente pediu um novo link de entrega' else 'Cliente não conseguiu baixar a música' end,
    case p_reason
      when 'expired' then format('%s tentou abrir a entrega do termo %s ("%s"), mas o link expirou. Reenvie a entrega pelo painel de Liberações.',
        v_release.buyer_name, v_release.document_code, v_release.song_title)
      else format('%s abriu a entrega do termo %s ("%s"), mas a música completa não está disponível. Confira o arquivo da obra e reenvie a entrega.',
        v_release.buyer_name, v_release.document_code, v_release.song_title)
    end,
    'release', false, '/dashboard/liberacoes'
  );
  update public.release_deliveries set composer_notified_at = now() where id = p_delivery_id;
  insert into public.release_delivery_events(delivery_id, kind) values (p_delivery_id, 'composer_notified');
  return true;
end $$;
revoke execute on function public.notify_composer_about_delivery(uuid, text) from public, anon, authenticated;
grant execute on function public.notify_composer_about_delivery(uuid, text) to service_role;

-- ------------------------------------------------------------------------------
-- O arquivo entregue ao cliente não pode ser apagado pelo compositor.
-- (Mesma policy de production_readiness_2026_09_18.sql, com a exceção.)
-- ------------------------------------------------------------------------------
drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects
for delete to authenticated
using (
  bucket_id in ('profile-media', 'song-covers', 'song-previews', 'song-originals')
  and (storage.foldername(name))[1] = auth.uid()::text
  and not (
    bucket_id = 'song-originals'
    and exists (select 1 from public.release_deliveries d where d.audio_path = objects.name)
  )
);

notify pgrst, 'reload schema';
