-- ==============================================================================
-- Prévia pública passa de 60 para 85 segundos
-- Execute a qualquer momento. É idempotente.
--
-- Acompanha:
--   * src/config/media.ts (PREVIEW_MAX_SECONDS = 85) — gera a prévia no navegador;
--   * supabase/functions/validate-media-upload (maxDuration 85) — mede o arquivo
--     no servidor. A Edge Function precisa ser publicada de novo:
--       supabase functions deploy validate-media-upload
--
-- Em vez de recriar as funções inteiras (há várias versões delas nos arquivos
-- de migração), lê a definição ativa no banco, troca só o limite e a mensagem e
-- recria. Se o trecho esperado não for encontrado, aborta sem alterar nada.
-- ==============================================================================

do $$
declare
  definition text;
  patched text;
begin
  -- Limite de duração conferido ao vincular a prévia à música.
  definition := pg_get_functiondef('public.enforce_song_media_separation()'::regprocedure);
  patched := replace(definition, 'duration_seconds <= 60', 'duration_seconds <= 85');
  patched := replace(patched, 'prévia pública de até 60 segundos', 'prévia pública de até 85 segundos');
  if patched = definition and position('duration_seconds <= 85' in definition) = 0 then
    raise exception 'enforce_song_media_separation: limite de 60 segundos não encontrado; nada foi alterado.';
  end if;
  if patched <> definition then
    execute patched;
  end if;

  -- Só a mensagem de erro cita a duração.
  definition := pg_get_functiondef('public.enforce_song_write_rules()'::regprocedure);
  patched := replace(definition, 'prévia pública de até 60 segundos', 'prévia pública de até 85 segundos');
  if patched <> definition then
    execute patched;
  end if;
end $$;
