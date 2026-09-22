-- Endurecimento incremental para produção.
-- Pode ser executado após supabase/schema.sql em um projeto já existente.

create or replace function public.enforce_song_write_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_songs integer;
  current_song_count bigint;
begin
  -- Serializa cadastros do mesmo compositor para impedir corrida no limite.
  if tg_op = 'INSERT' then
    perform 1
      from public.profiles
      where user_id = new.composer_id
      for update;

    select sp.max_songs
      into max_songs
      from public.subscriptions sub
      join public.subscription_plans sp on sp.name = sub.plan_name and sp.is_active
      where sub.user_id = new.composer_id;

    if not found then
      raise exception using errcode = '23514', message = 'A conta não possui um plano de assinatura válido.';
    end if;

    select count(*)
      into current_song_count
      from public.songs
      where composer_id = new.composer_id;

    if max_songs is not null and current_song_count >= max_songs then
      raise exception using
        errcode = 'P0001',
        message = format('Limite de %s músicas atingido para esta conta.', max_songs),
        hint = 'Remova uma música sem histórico ou solicite a ampliação do plano.';
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

  if new.status = 'published' then
    if nullif(btrim(new.title), '') is null
       or nullif(btrim(new.authors), '') is null
       or nullif(btrim(new.lyrics), '') is null
       or nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
      raise exception using
        errcode = '23514',
        message = 'Para publicar, informe título, autores, letra e uma prévia pública de até 60 segundos.';
    end if;

    if not exists (
      select 1
      from public.subscriptions
      where user_id = new.composer_id
        and status = 'active'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Somente contas com assinatura ativa podem publicar músicas.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_write_rules on public.songs;
create trigger enforce_song_write_rules
before insert or update on public.songs
for each row execute function public.enforce_song_write_rules();

create or replace function public.preserve_song_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.interest_requests
    where song_id = old.id
  ) or exists (
    select 1
    from public.releases
    where song_id = old.id
  ) then
    raise exception using
      errcode = '23503',
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

create or replace function public.is_valid_storage_object(
  p_bucket text,
  p_name text,
  p_metadata jsonb
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    case p_bucket
      when 'profile-media' then
        lower(coalesce(storage.extension(p_name), '')) in ('jpg', 'jpeg', 'png', 'webp')
        and lower(coalesce(p_metadata->>'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
        and case when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
          then (p_metadata->>'size')::bigint else null end between 1 and 5242880
      when 'song-covers' then
        lower(coalesce(storage.extension(p_name), '')) in ('jpg', 'jpeg', 'png', 'webp')
        and lower(coalesce(p_metadata->>'mimetype', '')) in ('image/jpeg', 'image/png', 'image/webp')
        and case when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
          then (p_metadata->>'size')::bigint else null end between 1 and 5242880
      when 'song-previews' then
        lower(coalesce(storage.extension(p_name), '')) in ('mp3', 'm4a', 'aac', 'ogg')
        and lower(coalesce(p_metadata->>'mimetype', '')) in
          ('audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'application/ogg')
        and case when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
          then (p_metadata->>'size')::bigint else null end between 1 and 10485760
      when 'song-originals' then
        lower(coalesce(storage.extension(p_name), '')) in ('mp3', 'wav', 'm4a', 'aac', 'ogg')
        and lower(coalesce(p_metadata->>'mimetype', '')) in
          ('audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'application/ogg')
        and case when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
          then (p_metadata->>'size')::bigint else null end between 1 and 26214400
      when 'release-documents' then
        lower(coalesce(storage.extension(p_name), '')) = 'pdf'
        and lower(coalesce(p_metadata->>'mimetype', '')) = 'application/pdf'
        and case when coalesce(p_metadata->>'size', '') ~ '^[0-9]+$'
          then (p_metadata->>'size')::bigint else null end between 1 and 10485760
      else false
    end;
$$;

drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "media owner delete" on storage.objects;

-- Sem política de INSERT nos buckets finais: a promoção de arquivos validados
-- é executada exclusivamente pela Edge Function com service_role.

create policy "media owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('profile-media', 'song-covers', 'song-previews', 'song-originals', 'release-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  (storage.foldername(name))[1] = auth.uid()::text
  and public.is_valid_storage_object(bucket_id, name, metadata)
);

create policy "media owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('profile-media', 'song-covers', 'song-previews', 'song-originals', 'release-documents')
  and (storage.foldername(name))[1] = auth.uid()::text
);

revoke execute on function public.enforce_song_write_rules() from public, anon, authenticated;
revoke execute on function public.preserve_song_history() from public, anon, authenticated;
grant execute on function public.is_valid_storage_object(text, text, jsonb) to authenticated;
