-- Agregados leves para a paginação server-side de "Minhas músicas".

create or replace function public.get_my_song_stats()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'published', count(*) filter (where status = 'published'),
    'drafts', count(*) filter (where status = 'draft'),
    'pending', count(*) filter (where status = 'pending_approval'),
    'rejected', count(*) filter (where status = 'rejected'),
    'plays', coalesce(sum(play_count), 0),
    'interests', coalesce(sum(interested_count), 0),
    'genres', coalesce(jsonb_agg(distinct genre order by genre) filter (where nullif(btrim(genre), '') is not null), '[]'::jsonb)
  )
  from public.songs
  where composer_id = auth.uid();
$$;

revoke execute on function public.get_my_song_stats() from public, anon;
grant execute on function public.get_my_song_stats() to authenticated;

