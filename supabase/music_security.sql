-- Defesa em profundidade para impedir exposição do áudio original.
-- Execute depois dos demais scripts de produção.

update storage.buckets
set public = false
where id in ('song-originals', 'release-documents', 'media-quarantine');

create or replace function public.enforce_song_media_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.original_audio_path is not null and (
    new.original_audio_path not like new.composer_id::text || '/%'
    or new.original_audio_path like '%..%'
    or new.original_audio_path like '%://%'
  ) then
    raise exception using
      errcode = '23514',
      message = 'O áudio original deve permanecer no diretório privado do próprio compositor.';
  end if;

  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is not null and (
    position('/storage/v1/object/public/song-previews/' || new.composer_id::text || '/' in new.preview_audio_url) = 0
    or position('/song-originals/' in new.preview_audio_url) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'A prévia pública deve apontar exclusivamente para o bucket song-previews do compositor.';
  end if;

  if new.status in ('published', 'pending_approval')
     and (new.original_audio_path is null or new.preview_audio_url is null) then
    raise exception using
      errcode = '23514',
      message = 'Áudio original privado e prévia pública são obrigatórios e devem permanecer separados.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_media_separation on public.songs;
create trigger enforce_song_media_separation
before insert or update on public.songs
for each row execute function public.enforce_song_media_separation();

revoke execute on function public.enforce_song_media_separation()
from public, anon, authenticated;

drop policy if exists "private media owner read" on storage.objects;
drop policy if exists "song originals owner read" on storage.objects;
drop policy if exists "release documents owner or admin read" on storage.objects;

-- Nem administradores recebem acesso ao original completo. A moderação usa somente a prévia.
create policy "song originals owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'song-originals'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "release documents owner or admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'release-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Remove o EXECUTE implícito concedido a PUBLIC e libera somente os RPCs públicos necessários.
revoke execute on function public.get_public_composer(text) from public;
revoke execute on function public.get_featured_composers(integer) from public;
revoke execute on function public.create_interest_request(uuid, jsonb) from public;
revoke execute on function public.increment_song_play(uuid) from public;

grant execute on function public.get_public_composer(text) to anon, authenticated;
grant execute on function public.get_featured_composers(integer) to anon, authenticated;
grant execute on function public.create_interest_request(uuid, jsonb) to anon, authenticated;
grant execute on function public.increment_song_play(uuid) to anon, authenticated;

