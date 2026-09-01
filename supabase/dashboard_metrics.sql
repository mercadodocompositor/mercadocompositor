-- Métricas históricas agregadas do dashboard.
-- Execute depois de schema.sql. A série começa na data desta implantação.
create table if not exists public.composer_daily_metrics (
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  metric_date date not null default current_date,
  metric_name text not null check(metric_name in ('profile_view','song_play','interest_request','release_issued','song_published')),
  metric_value bigint not null default 0 check(metric_value >= 0),
  updated_at timestamptz not null default now(),
  primary key(composer_id,metric_date,metric_name)
);
create index if not exists composer_daily_metrics_date_idx
  on public.composer_daily_metrics(composer_id,metric_date desc);
alter table public.composer_daily_metrics enable row level security;
revoke all on table public.composer_daily_metrics from anon, authenticated;

create or replace function public.record_composer_metric(
  p_composer_id uuid,
  p_metric_name text,
  p_increment integer default 1
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_composer_id is null
     or p_metric_name not in ('profile_view','song_play','interest_request','release_issued','song_published')
     or p_increment < 1 or p_increment > 1000 then
    raise exception using errcode='23514',message='Métrica inválida.';
  end if;
  insert into public.composer_daily_metrics(composer_id,metric_date,metric_name,metric_value)
  values(p_composer_id,current_date,p_metric_name,p_increment)
  on conflict(composer_id,metric_date,metric_name) do update
    set metric_value=public.composer_daily_metrics.metric_value+excluded.metric_value,updated_at=now();
end;
$$;
revoke execute on function public.record_composer_metric(uuid,text,integer) from public,anon,authenticated;

create or replace function public.get_my_dashboard_metrics(p_days integer default 30)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with bounds as (
    select greatest(7,least(coalesce(p_days,30),90))::integer as days
  ), dates as (
    select generate_series(current_date-(select days-1 from bounds),current_date,'1 day'::interval)::date as day
  ), own as (
    select metric_date,metric_name,metric_value
    from public.composer_daily_metrics
    where composer_id=auth.uid()
      and metric_date>=current_date-(select days-1 from bounds)
  ), daily as (
    select d.day,
      coalesce(sum(o.metric_value) filter(where o.metric_name='profile_view'),0) as profile_views,
      coalesce(sum(o.metric_value) filter(where o.metric_name='song_play'),0) as song_plays,
      coalesce(sum(o.metric_value) filter(where o.metric_name='interest_request'),0) as interest_requests,
      coalesce(sum(o.metric_value) filter(where o.metric_name='release_issued'),0) as releases_issued,
      coalesce(sum(o.metric_value) filter(where o.metric_name='song_published'),0) as songs_published
    from dates d left join own o on o.metric_date=d.day
    group by d.day
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'date',day,'profileViews',profile_views,'songPlays',song_plays,
    'interestRequests',interest_requests,'releasesIssued',releases_issued,
    'songsPublished',songs_published
  ) order by day),'[]'::jsonb)
  from daily
$$;
revoke execute on function public.get_my_dashboard_metrics(integer) from public,anon;
grant execute on function public.get_my_dashboard_metrics(integer) to authenticated;

-- Os eventos públicos já validados são registrados dentro das mesmas RPCs.
create or replace function public.metrics_on_song_published()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status='published' and old.status is distinct from 'published' then
    perform public.record_composer_metric(new.composer_id,'song_published',1);
  end if;
  return new;
end $$;
drop trigger if exists metrics_song_published on public.songs;
create trigger metrics_song_published after update of status on public.songs
for each row execute function public.metrics_on_song_published();
revoke execute on function public.metrics_on_song_published() from public,anon,authenticated;

-- Integrações nas funções do schema base. Reexecute este arquivo após qualquer
-- create or replace dessas RPCs para manter o registro transacional.
create or replace function public.metrics_profile_view_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.views_count > old.views_count then
    perform public.record_composer_metric(new.user_id,'profile_view',(new.views_count-old.views_count)::integer);
  end if;
  return new;
end $$;
drop trigger if exists metrics_profile_view on public.profiles;
create trigger metrics_profile_view after update of views_count on public.profiles
for each row execute function public.metrics_profile_view_trigger();
revoke execute on function public.metrics_profile_view_trigger() from public,anon,authenticated;

create or replace function public.metrics_song_play_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.play_count > old.play_count then
    perform public.record_composer_metric(new.composer_id,'song_play',(new.play_count-old.play_count)::integer);
  end if;
  return new;
end $$;
drop trigger if exists metrics_song_play on public.songs;
create trigger metrics_song_play after update of play_count on public.songs
for each row execute function public.metrics_song_play_trigger();
revoke execute on function public.metrics_song_play_trigger() from public,anon,authenticated;

create or replace function public.metrics_interest_request_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.record_composer_metric(new.composer_id,'interest_request',1); return new; end $$;
drop trigger if exists metrics_interest_request on public.interest_requests;
create trigger metrics_interest_request after insert on public.interest_requests
for each row execute function public.metrics_interest_request_trigger();
revoke execute on function public.metrics_interest_request_trigger() from public,anon,authenticated;

create or replace function public.metrics_release_trigger()
returns trigger language plpgsql security definer set search_path='' as $$
begin perform public.record_composer_metric(new.composer_id,'release_issued',1); return new; end $$;
drop trigger if exists metrics_release_issued on public.releases;
create trigger metrics_release_issued after insert on public.releases
for each row execute function public.metrics_release_trigger();
revoke execute on function public.metrics_release_trigger() from public,anon,authenticated;
