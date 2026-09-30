-- ==============================================================================
-- Compositores em destaque na página /compositores
-- Execute depois de get_public_composers.sql e featured_composers_with_songs_2026_09_24.sql.
-- É idempotente.
--
-- Entram no destaque, com assinatura ativa e ao menos uma obra publicada:
--   * quem assina um plano com `includes_featured` (Plano Ouro por padrão);
--   * quem o administrador destacar manualmente (`profiles.is_featured`).
--
-- Também corrige as permissões de `profiles`: o UPDATE amplo concedido pela
-- plataforma permitia ao compositor alterar pela API colunas administrativas
-- (is_verified, views_count e, agora, is_featured). Volta a valer a lista de
-- colunas editáveis prevista em schema.sql.
-- ==============================================================================

alter table public.profiles add column if not exists is_featured boolean not null default false;
alter table public.profiles add column if not exists featured_at timestamptz;

alter table public.subscription_plans add column if not exists includes_featured boolean not null default false;
-- Só na criação da coluna faz sentido marcar o Ouro; depois, vale o que o admin definir.
update public.subscription_plans set includes_featured = true
where name = 'Plano Ouro'
  and not exists (select 1 from public.subscription_plans where includes_featured);

revoke update on table public.profiles from anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, society, spotify,
  updated_at
) on table public.profiles to authenticated;

-- ------------------------------------------------------------------------------
-- Destaque manual pelo administrador, com registro na auditoria.
-- ------------------------------------------------------------------------------
create or replace function public.admin_set_composer_featured(p_user_id uuid, p_is_featured boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_actor text;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão de compositores.';
  end if;

  update public.profiles
  set is_featured = p_is_featured,
      featured_at = case when p_is_featured then coalesce(featured_at, now()) else null end,
      updated_at = now()
  where user_id = p_user_id
  returning coalesce(nullif(stage_name, ''), username::text) into v_name;
  if not found then
    raise exception using errcode = 'P0002', message = 'Compositor não encontrado.';
  end if;

  select email into v_actor from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (
    'featured-' || gen_random_uuid()::text,
    'moderation',
    case when p_is_featured then 'Compositor destacado na vitrine' else 'Destaque de compositor removido' end,
    format('%s (%s) %s da seção de destaque da página de compositores.', v_name, p_user_id,
      case when p_is_featured then 'foi incluído' else 'foi retirado' end),
    coalesce(v_actor, auth.uid()::text),
    'info'
  );
end $$;
revoke execute on function public.admin_set_composer_featured(uuid, boolean) from public, anon;
grant execute on function public.admin_set_composer_featured(uuid, boolean) to authenticated;

-- ------------------------------------------------------------------------------
-- Catálogo público: informa o destaque e o coloca primeiro.
-- ------------------------------------------------------------------------------
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
revoke execute on function public.get_public_composers(integer, text, text) from public;
grant execute on function public.get_public_composers(integer, text, text) to anon, authenticated;

-- Vitrine da home: mesmo critério, destaque primeiro.
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
  order by 2 desc, p.is_verified desc, p.views_count desc
  limit greatest(1,least(p_limit,24))
) q
$$;
grant execute on function public.get_featured_composers(integer) to anon,authenticated;

-- ------------------------------------------------------------------------------
-- Painel admin: mesmo conteúdo de admin_composers_management.sql + destaque.
-- ------------------------------------------------------------------------------
create or replace function public.get_admin_composers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.user_id,
        'username', p.username,
        'name', p.name,
        'stageName', p.stage_name,
        'email', coalesce(pp.email, ''),
        'whatsapp', coalesce(pp.whatsapp, ''),
        'cpf', coalesce(pp.cpf, ''),
        'cityState', concat_ws(' - ', nullif(p.city, ''), nullif(p.state, '')),
        'subscriptionStatus', coalesce(sub.status, 'pending'),
        'planName', coalesce(sub.plan_name, ''),
        'monthlyValue', coalesce(nullif(replace(sub.monthly_price, ',', '.'), '')::numeric, 0),
        'registeredAt', p.created_at,
        'songCount', coalesce(song_stats.song_count, 0),
        'totalPlays', coalesce(song_stats.total_plays, 0),
        'totalReleases', coalesce(release_stats.release_count, 0),
        'revenueGenerated', coalesce(release_stats.total_revenue, 0),
        'photo', p.photo_url,
        'isVerified', p.is_verified,
        'isFeatured', p.is_featured,
        'planIncludesFeatured', coalesce(plan.includes_featured, false)
      )
      order by p.created_at desc, p.user_id
    ),
    '[]'::jsonb
  )
  into result
  from public.profiles p
  left join public.private_profiles pp on pp.user_id = p.user_id
  left join public.subscriptions sub on sub.user_id = p.user_id
  left join public.subscription_plans plan on plan.name = sub.plan_name
  left join (
    select composer_id, count(*) as song_count, coalesce(sum(play_count), 0) as total_plays
    from public.songs
    group by composer_id
  ) song_stats on song_stats.composer_id = p.user_id
  left join (
    select composer_id, count(*) as release_count, coalesce(sum(agreed_value), 0) as total_revenue
    from public.releases
    group by composer_id
  ) release_stats on release_stats.composer_id = p.user_id;

  return result;
end;
$$;
revoke execute on function public.get_admin_composers() from public, anon;
grant execute on function public.get_admin_composers() to authenticated;

notify pgrst, 'reload schema';
