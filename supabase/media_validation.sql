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
  and case when coalesce(metadata->>'size', '') ~ '^[0-9]+$'
    then (metadata->>'size')::bigint else null end between 1 and 26214400
);

create policy "quarantine owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'media-quarantine'
  and (storage.foldername(name))[1] = auth.uid()::text
);

