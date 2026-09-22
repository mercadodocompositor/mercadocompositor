-- ==============================================================================
-- MERCADO DO COMPOSITOR — SELO "COMPOSITOR VERIFICADO" NA VITRINE (2026-09-22)
-- ==============================================================================
-- A vitrine pública exibia o selo para todos os compositores. Agora ela só o
-- mostra quando profiles.is_verified = true, campo que apenas a equipe altera
-- via admin_set_profile_verified(). Esta migração expõe 'isVerified' no RPC
-- público. Sem ela, o selo simplesmente deixa de aparecer para todos.
-- É idempotente: pode ser executada novamente sem efeitos colaterais.

create or replace function public.get_public_composer(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'profile',jsonb_build_object('username',p.username,'stageName',p.stage_name,'city',p.city,'state',p.state,'bio',p.bio,'experienceYears',p.experience_years,'genres',p.genres,'society',p.society,'spotify',p.spotify,'instagram',p.instagram,'youtube',p.youtube,'website',p.website,'photo',p.photo_url,'coverPhoto',p.cover_photo_url,'viewsCount',p.views_count,'isVerified',p.is_verified),
 'subscriptionStatus',sub.status,
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'genre',s.genre,'subgenre',s.subgenre,'authors',s.authors,'dateComposed',s.date_composed,'dateRegistered',s.date_registered,'lyrics',s.lyrics,'coverUrl',s.cover_url,'registryCode',s.registry_code,'status',s.status,'isAvailableForRelease',s.is_available_for_release,'valueType',s.value_type,'suggestedValue',s.suggested_value,'playCount',s.play_count,'interestedCount',s.interested_count,'summary',s.summary,'previewAudioUrl',s.preview_audio_url)) from public.songs s where s.composer_id=p.user_id and s.status='published' and sub.status='active'),'[]'::jsonb)
) from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where p.username=p_username and sub.status='active' limit 1
$$;

revoke execute on function public.get_public_composer(text) from public;
grant execute on function public.get_public_composer(text) to anon, authenticated;

notify pgrst, 'reload schema';

-- Conferência:
-- select public.get_public_composer('<username>') -> 'profile' ->> 'isVerified';
