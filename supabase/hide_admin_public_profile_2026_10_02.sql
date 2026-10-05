-- A conta mercado serve apenas a administracao e nao integra o catalogo publico.
-- Mantem a conta e as rotinas administrativas intactas.
begin;

create or replace function public.get_public_composer(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
with target as (
  select coalesce(
    (select p.user_id from public.profiles p where p.username = p_username),
    (select h.user_id from public.username_history h
      where h.old_username = p_username and h.changed_at > now() - interval '180 days')
  ) as user_id
)
select jsonb_build_object(
 'profile',jsonb_build_object('username',p.username,'stageName',p.stage_name,'city',p.city,'state',p.state,'bio',p.bio,'experienceYears',p.experience_years,'genres',p.genres,'society',p.society,'spotify',p.spotify,'instagram',p.instagram,'youtube',p.youtube,'website',p.website,'photo',p.photo_url,'coverPhoto',p.cover_photo_url,'viewsCount',p.views_count,'isVerified',p.is_verified),
 'subscriptionStatus',sub.status,
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'genre',s.genre,'subgenre',s.subgenre,'authors',s.authors,'dateComposed',s.date_composed,'dateRegistered',s.date_registered,'lyrics',s.lyrics,'coverUrl',s.cover_url,'registryCode',s.registry_code,'status',s.status,'isAvailableForRelease',s.is_available_for_release,'valueType',s.value_type,'suggestedValue',s.suggested_value,'playCount',s.play_count,'interestedCount',s.interested_count,'summary',s.summary,'previewAudioUrl',s.preview_audio_url)) from public.songs s where s.composer_id=p.user_id and s.status='published' and sub.status='active'),'[]'::jsonb)
) from target t
  join public.profiles p on p.user_id=t.user_id
  join public.subscriptions sub on sub.user_id=p.user_id
where sub.status='active' and lower(p.username::text) <> 'mercado' limit 1
$$;

create or replace function public.get_public_composers(
  p_limit integer default 50,
  p_search text default null,
  p_genre text default null
) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item order by featured desc, featured_rank desc, is_verified desc, views_count desc, created_at desc), '[]'::jsonb) from (
  select
    jsonb_build_object(
      'id', p.user_id,
      'username', p.username,
      'name', p.stage_name,
      'cityState', concat_ws(' - ', nullif(btrim(p.city), ''), nullif(btrim(p.state), '')),
      'genres', p.genres,
      'songCount', stats.song_count,
      'photo', p.photo_url,
      'bio', p.bio,
      'isVerified', p.is_verified,
      'featured', (p.is_featured or coalesce(plan.includes_featured, false)) and stats.song_count > 0,
      'featuredReason', case
        when stats.song_count = 0 then null
        when coalesce(plan.includes_featured, false) then 'plan'
        when p.is_featured then 'editorial'
      end
    ) as item,
    (p.is_featured or coalesce(plan.includes_featured, false)) and stats.song_count > 0 as featured,
    coalesce(p.featured_at, sub.updated_at, p.created_at) as featured_rank,
    p.is_verified, p.views_count, p.created_at
  from public.profiles p
  join public.subscriptions sub on sub.user_id = p.user_id
  left join public.subscription_plans plan on plan.name = sub.plan_name
  cross join lateral (
    select count(*)::int as song_count from public.songs s
    where s.composer_id = p.user_id and s.status = 'published'
  ) stats
  where sub.status = 'active'
    and lower(p.username::text) <> 'mercado'
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
  order by 2 desc, 3 desc, p.is_verified desc, p.views_count desc, p.created_at desc
  limit greatest(1, least(p_limit, 1000))
) q;
$$;

create or replace function public.get_featured_composers(p_limit integer default 6) returns jsonb
language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item order by featured desc, is_verified desc, views_count desc), '[]'::jsonb) from (
  select
    jsonb_build_object('id',p.user_id,'username',p.username,'name',p.stage_name,
      'cityState',concat_ws(' - ',p.city,p.state),'genres',p.genres,'songCount',stats.song_count,
      'photo',p.photo_url,'bio',p.bio,'isVerified',p.is_verified,
      'featured',p.is_featured or coalesce(plan.includes_featured,false)) as item,
    p.is_featured or coalesce(plan.includes_featured,false) as featured,
    p.is_verified, p.views_count
  from public.profiles p
  join public.subscriptions sub on sub.user_id=p.user_id
  left join public.subscription_plans plan on plan.name=sub.plan_name
  cross join lateral (
    select count(*)::int as song_count from public.songs s
    where s.composer_id=p.user_id and s.status='published'
  ) stats
  where sub.status='active' and stats.song_count > 0
    and lower(p.username::text) <> 'mercado'
  order by 2 desc, p.is_verified desc, p.views_count desc
  limit greatest(1,least(p_limit,24))
) q
$$;

create or replace function public.get_featured_songs(p_limit integer default 6)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(featured) - 'rank' order by featured.rank), '[]'::jsonb)
  from (
    select s.id, s.composer_id, s.title, s.genre, s.subgenre, s.authors,
           s.date_composed, s.date_registered, s.cover_url, s.status,
           s.is_available_for_release, s.value_type, s.suggested_value,
           s.play_count, s.interested_count, s.summary, s.preview_audio_url,
           s.is_featured, ''::text as lyrics,
           row_number() over (order by s.play_count desc, s.created_at desc) as rank
    from public.songs s
    join public.subscriptions sub on sub.user_id = s.composer_id and sub.status = 'active'
    join public.profiles p on p.user_id = s.composer_id and lower(p.username::text) <> 'mercado'
    where s.is_featured and s.status = 'published' and s.is_available_for_release
      and nullif(btrim(coalesce(s.preview_audio_url, '')), '') is not null
    order by s.play_count desc, s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 24))
  ) featured;
$$;

commit;
notify pgrst, 'reload schema';
