-- A vitrine pública precisa ser consultável por visitantes. O destaque só pode
-- ser ativado quando a obra realmente atende aos critérios dessa vitrine.
begin;

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
    where s.is_featured and s.status = 'published' and s.is_available_for_release
      and nullif(btrim(coalesce(s.preview_audio_url, '')), '') is not null
    order by s.play_count desc, s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 24))
  ) featured;
$$;

revoke execute on function public.get_featured_songs(integer) from public;
grant execute on function public.get_featured_songs(integer) to anon, authenticated;

create or replace function public.admin_set_song_featured(p_song_id uuid, p_is_featured boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare target public.songs%rowtype;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Acesso administrativo necessário.';
  end if;
  if p_is_featured is null then
    raise exception using errcode = '23514', message = 'Valor de destaque inválido.';
  end if;
  select * into target from public.songs where id = p_song_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Música não encontrada.';
  end if;
  if p_is_featured and (
    target.status <> 'published' or not target.is_available_for_release
    or nullif(btrim(coalesce(target.preview_audio_url, '')), '') is null
    or not exists (select 1 from public.subscriptions sub
                   where sub.user_id = target.composer_id and sub.status = 'active')
  ) then
    raise exception using errcode = '23514',
      message = 'A obra precisa estar publicada e disponível, com prévia e assinatura ativa, para aparecer na Home.';
  end if;
  update public.songs set is_featured = p_is_featured, updated_at = now()
  where id = p_song_id;
end;
$$;

revoke execute on function public.admin_set_song_featured(uuid, boolean) from public, anon;
grant execute on function public.admin_set_song_featured(uuid, boolean) to authenticated;

commit;
notify pgrst, 'reload schema';
