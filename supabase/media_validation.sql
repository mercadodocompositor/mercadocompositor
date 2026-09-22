-- Upload em quarentena com validação real pela Edge Function validate-media-upload.

insert into storage.buckets(id, name, public, file_size_limit)
values ('media-quarantine', 'media-quarantine', false, 26214400)
on conflict(id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "media owner insert" on storage.objects;
drop policy if exists "media owner update" on storage.objects;
drop policy if exists "quarantine owner insert" on storage.objects;
drop policy if exists "quarantine owner delete" on storage.objects;

-- Usuários não gravam diretamente nos buckets finais. A Edge Function validada,
-- executada com service_role, é a única responsável pela promoção.
create policy "quarantine owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
  and lower(coalesce(storage.extension(name), '')) in
    ('jpg', 'jpeg', 'png', 'webp', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'pdf')
);

create policy "quarantine owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "quarantine owner select" on storage.objects;
create policy "quarantine owner select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

