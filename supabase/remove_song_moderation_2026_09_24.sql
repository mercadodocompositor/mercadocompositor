-- ==============================================================================
-- Remoção da moderação prévia de músicas
-- Execute DEPOIS de fix_song_triggers_regression_2026_09_24.sql. É idempotente.
--
-- Toda música salva para publicação vai direto ao perfil público. A opção
-- "Exigir Moderação Prévia de Obras" saiu do painel e a coluna fica sempre
-- falsa. O administrador continua podendo rejeitar (tirar do ar) uma obra.
-- ==============================================================================

-- Moderação prévia removida: toda obra salva para publicação vai direto ao
-- perfil público. O gatilho mantém a coluna sempre falsa, porque
-- admin_update_platform_settings grava true quando a chave não vem no JSON.
alter table public.platform_settings alter column require_approval_for_new_songs set default false;

create or replace function public.force_song_moderation_off()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.require_approval_for_new_songs := false;
  return new;
end;
$$;
revoke execute on function public.force_song_moderation_off() from public, anon, authenticated;
drop trigger if exists force_song_moderation_off on public.platform_settings;
create trigger force_song_moderation_off
before insert or update on public.platform_settings
for each row execute function public.force_song_moderation_off();

update public.platform_settings set require_approval_for_new_songs = false
where require_approval_for_new_songs;

-- Obras que estavam aguardando análise vão ao ar. O gatilho de publicação exige
-- assinatura ativa; as de contas sem assinatura ativa voltam para rascunho (sem
-- perder mídia) e o compositor publica quando reativar.
update public.songs s set status = 'published', updated_at = now()
where s.status = 'pending_approval'
  and exists (select 1 from public.subscriptions sub where sub.user_id = s.composer_id and sub.status = 'active');

update public.songs set status = 'draft', updated_at = now()
where status = 'pending_approval';

notify pgrst, 'reload schema';
