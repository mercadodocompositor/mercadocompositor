-- Corrige o bypass em que uma mídia era salva no rascunho e o status era
-- alterado depois sem que o registro de validação fosse conferido novamente.
--
-- ⚠️  SUPERADO por supabase/fix_auditoria_2026_09.sql (seção 4). A versão deste
--     arquivo (a) apagava capa, prévia e áudio original sempre que a obra
--     voltava para rascunho, deixando arquivos órfãos no Storage e exigindo
--     reupload para republicar, e (b) removia as validações de confinamento de
--     caminho que music_security.sql havia introduzido. Use o fix_auditoria.

create or replace function public.enforce_song_media_separation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  media_row public.validated_media%rowtype;
begin
  -- Rascunhos não mantêm referências para buckets públicos. A validação e o
  -- armazenamento permanente acontecem na aprovação ou publicação.
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
    where id = new.preview_media_id
      and user_id = new.composer_id
      and bucket_id = 'song-previews'
      and public_url = new.preview_audio_url
      and duration_seconds > 0 and duration_seconds <= 60
      and (consumed_by_song_id is null or consumed_by_song_id = new.id)
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'A prévia não possui validação válida ou já foi vinculada a outra música.';
    end if;

    update public.validated_media
    set consumed_by_song_id = new.id,
        consumed_at = coalesce(consumed_at, now())
    where id = media_row.id;
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
    where id = new.original_media_id
      and user_id = new.composer_id
      and bucket_id = 'song-originals'
      and object_path = new.original_audio_path
      and (consumed_by_song_id is null or consumed_by_song_id = new.id)
    for update;

    if not found then
      raise exception using errcode = '23514', message = 'O áudio original não possui validação válida ou já foi vinculado a outra música.';
    end if;

    update public.validated_media
    set consumed_by_song_id = new.id,
        consumed_at = coalesce(consumed_at, now())
    where id = media_row.id;
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

notify pgrst, 'reload schema';
