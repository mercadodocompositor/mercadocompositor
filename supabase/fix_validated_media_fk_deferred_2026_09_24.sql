-- ==============================================================================
-- Correção: "Enviar para aprovação" falhava com violação de chave estrangeira
-- Pode ser executado a qualquer momento; é idempotente.
--
-- O gatilho enforce_song_media_separation roda BEFORE INSERT em songs e já marca
-- validated_media.consumed_by_song_id = new.id. Nesse instante a linha da música
-- ainda não existe, e a FK validated_media_consumed_song_fkey (criada em
-- update_all_migrations.sql) rejeitava a gravação com o erro 23503. Toda música
-- nova com prévia deixou de ser cadastrada.
-- A FK passa a ser conferida no fim da transação, quando a música já existe.
-- ==============================================================================

alter table public.validated_media drop constraint if exists validated_media_consumed_song_fkey;
alter table public.validated_media add constraint validated_media_consumed_song_fkey
  foreign key(consumed_by_song_id) references public.songs(id) on delete set null
  deferrable initially deferred;

notify pgrst, 'reload schema';
