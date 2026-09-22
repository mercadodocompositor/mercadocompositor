-- ==============================================================================
-- ⚠️  SCRIPT DESATIVADO — NÃO EXECUTE A VERSÃO ANTIGA
-- ==============================================================================
-- Este arquivo continha:
--
--     grant select, insert, update, delete on public.songs to authenticated;
--     grant select, update on public.profiles to authenticated;
--
-- Esses dois comandos anulavam os grants por coluna definidos em
-- update_all_migrations.sql. A RLS controla QUAIS LINHAS um usuário alcança,
-- mas não quais COLUNAS da própria linha ele altera — com o privilégio amplo,
-- qualquer compositor autenticado podia, por uma chamada REST direta:
--
--     PATCH /rest/v1/profiles?user_id=eq.<ele mesmo>  { "is_verified": true }
--     PATCH /rest/v1/songs?id=eq.<obra dele>          { "is_featured": true,
--                                                       "play_count": 999999 }
--
-- ou seja: conceder a si o selo de verificado, colocar a própria obra no
-- destaque editorial da home e inflar os contadores de reprodução e interesse.
--
-- Também redefinia enforce_song_song_media_separation sem as validações de
-- confinamento de caminho de music_security.sql (áudio original preso ao
-- diretório do compositor e prévia restrita ao bucket song-previews).
--
-- O conteúdo válido foi incorporado a supabase/fix_auditoria_2026_09.sql, que é
-- o script a executar. Ele reaplica os grants por coluna (incluindo
-- original_media_id/preview_media_id, que faltavam em schema.sql e impediam o
-- cadastro de obras) e a versão definitiva do trigger de mídia.
--
-- Rodar este arquivo por engano apenas reaplica a correção segura abaixo.
-- ==============================================================================

revoke insert, update on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, society, spotify,
  updated_at
) on table public.profiles to authenticated;

revoke insert, update on table public.songs from anon, authenticated;
grant select, delete on table public.songs to authenticated;
grant insert (
  id, composer_id, title, genre, subgenre, authors, date_composed,
  date_registered, lyrics, cover_url, registry_code, notes, status,
  is_available_for_release, value_type, suggested_value, summary,
  original_audio_path, preview_audio_url, original_media_id, preview_media_id,
  created_at, updated_at
) on table public.songs to authenticated;
grant update (
  title, genre, subgenre, authors, date_composed, date_registered, lyrics,
  cover_url, registry_code, notes, status, is_available_for_release,
  value_type, suggested_value, summary, original_audio_path,
  preview_audio_url, original_media_id, preview_media_id, updated_at
) on table public.songs to authenticated;

grant select on public.validated_media to authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';
