-- ==============================================================================
-- Vitrine da home: só compositores com ao menos uma obra publicada
-- Pode ser executado a qualquer momento; é idempotente.
--
-- get_featured_composers listava todo perfil com assinatura ativa, inclusive
-- sem nenhuma obra no ar: o visitante clicava e caía em "Nenhuma música
-- disponível no momento".
-- ==============================================================================

create or replace function public.get_featured_composers(p_limit integer default 6) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item),'[]'::jsonb) from(select jsonb_build_object('id',p.user_id,'username',p.username,'name',p.stage_name,'cityState',concat_ws(' - ',p.city,p.state),'genres',p.genres,'songCount',(select count(*) from public.songs s where s.composer_id=p.user_id and s.status='published'),'photo',p.photo_url,'bio',p.bio) item from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where sub.status='active' and exists(select 1 from public.songs s where s.composer_id=p.user_id and s.status='published') order by p.is_verified desc,p.views_count desc limit greatest(1,least(p_limit,24))) q
$$;
grant execute on function public.get_featured_composers(integer) to anon,authenticated;

notify pgrst, 'reload schema';
