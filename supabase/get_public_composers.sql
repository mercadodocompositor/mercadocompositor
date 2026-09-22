-- Função RPC para listar e pesquisar compositores públicos com assinatura ativa
-- Execute no SQL Editor do Supabase se desejar otimização nativa via backend.

create or replace function public.get_public_composers(
  p_limit integer default 50,
  p_search text default null,
  p_genre text default null
) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item), '[]'::jsonb) from (
  select jsonb_build_object(
    'id', p.user_id,
    'username', p.username,
    'name', p.stage_name,
    'cityState', concat_ws(' - ', nullif(btrim(p.city), ''), nullif(btrim(p.state), '')),
    'genres', p.genres,
    'songCount', (
      select count(*) 
      from public.songs s 
      where s.composer_id = p.user_id 
        and s.status = 'published'
    ),
    'photo', p.photo_url,
    'bio', p.bio
  ) as item
  from public.profiles p
  join public.subscriptions sub on sub.user_id = p.user_id
  where sub.status = 'active'
    and (
      p_search is null or btrim(p_search) = '' or
      p.stage_name ilike '%' || btrim(p_search) || '%' or
      p.username ilike '%' || btrim(p_search) || '%' or
      p.city ilike '%' || btrim(p_search) || '%' or
      p.state ilike '%' || btrim(p_search) || '%' or
      p.bio ilike '%' || btrim(p_search) || '%'
    )
    and (
      p_genre is null or btrim(p_genre) = '' or
      p_genre = any(p.genres)
    )
  order by p.is_verified desc, p.views_count desc, p.created_at desc
  limit greatest(1, least(p_limit, 100))
) q;
$$;

revoke execute on function public.get_public_composers(integer, text, text) from public;
grant execute on function public.get_public_composers(integer, text, text) to anon, authenticated;
