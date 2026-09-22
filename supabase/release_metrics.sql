-- Execute após schema.sql e request_workflow_hardening.sql.
-- Agrega o histórico completo no banco; nunca depende do limite de linhas da API.
-- Classificação alinhada à usada pelos cards e às modalidades conhecidas.
create or replace function public.is_exclusive_release(p_release_type text)
returns boolean language sql immutable
set search_path = ''
as $$
  select case
    when p_release_type is null or btrim(p_release_type) = '' then false
    when lower(p_release_type) ~* 'n[aã]o[\s\-_]*exclusiv' then false
    when lower(btrim(p_release_type)) ~* '^(autoriza[cç][aã]o\s+exclusiva|cess[aã]o\s+exclusiva|exclusiva\s+por|exclusiva$)' then true
    when lower(btrim(p_release_type)) ~* '^cess[aã]o\s+definitiva\s+de\s+direitos\s+patrimoniais$' then true
    else false
  end;
$$;
revoke execute on function public.is_exclusive_release(text) from public, anon;
grant execute on function public.is_exclusive_release(text) to authenticated;

create or replace function public.get_my_release_metrics(
  p_search text default null,
  p_song_id uuid default null,
  p_type text default null,
  p_period text default null
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  result jsonb;
  safe_search text := btrim(regexp_replace(coalesce(p_search, ''), '[,()%_*]', ' ', 'g'));
  digits_search text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  cutoff date;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;
  if length(coalesce(p_search, '')) > 100 or
     (p_type is not null and p_type not in ('exclusiva', 'nao_exclusiva')) or
     (p_period is not null and p_period not in ('30d', '180d', 'ano_atual')) then
    raise exception using errcode = '23514', message = 'Filtros de liberações inválidos.';
  end if;
  cutoff := case p_period
    when '30d' then current_date - 30
    when '180d' then current_date - 180
    when 'ano_atual' then date_trunc('year', current_date)::date
    else null end;

  with own as (
    select r.* from public.releases r where r.composer_id = auth.uid()
  ), filtered as (
    select r.* from own r
    where (p_song_id is null or r.song_id = p_song_id)
      and (cutoff is null or r.issue_date >= cutoff)
      and (p_type is null or (p_type = 'exclusiva' and public.is_exclusive_release(r.release_type))
        or (p_type = 'nao_exclusiva' and not public.is_exclusive_release(r.release_type)))
      and (safe_search = '' or r.song_title ilike '%' || safe_search || '%'
        or r.buyer_name ilike '%' || safe_search || '%'
        or r.document_code ilike '%' || safe_search || '%'
        or r.authors ilike '%' || safe_search || '%'
        or r.buyer_city_state ilike '%' || safe_search || '%'
        or r.buyer_document ilike '%' || safe_search || '%'
        or (length(digits_search) >= 3 and r.buyer_document ilike '%' || digits_search || '%')
        or (length(digits_search) = 11 and r.buyer_document ilike '%' ||
          substr(digits_search, 1, 3) || '.' || substr(digits_search, 4, 3) || '.' ||
          substr(digits_search, 7, 3) || '-' || substr(digits_search, 10, 2) || '%')
        or (length(digits_search) = 14 and r.buyer_document ilike '%' ||
          substr(digits_search, 1, 2) || '.' || substr(digits_search, 3, 3) || '.' ||
          substr(digits_search, 6, 3) || '/' || substr(digits_search, 9, 4) || '-' ||
          substr(digits_search, 13, 2) || '%'))
  )
  select jsonb_build_object(
    'count', (select count(*) from filtered),
    'totalValue', (select coalesce(sum(agreed_value), 0) from filtered),
    'averageTicket', (select coalesce(avg(agreed_value), 0) from filtered),
    'exclusiveCount', (select count(*) from filtered where public.is_exclusive_release(release_type)),
    'nonExclusiveCount', (select count(*) from filtered where not public.is_exclusive_release(release_type)),
    'uniqueBuyers', (select count(distinct nullif(regexp_replace(buyer_document, '[^0-9]', '', 'g'), '')) from filtered),
    'songs', (select coalesce(jsonb_agg(jsonb_build_object('id', s.song_id, 'title', s.song_title) order by s.song_title), '[]'::jsonb)
      from (select distinct on (song_id) song_id, song_title from own where song_id is not null
        order by song_id, issue_date desc) s)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.get_my_release_metrics(text, uuid, text, text) from public, anon;
grant execute on function public.get_my_release_metrics(text, uuid, text, text) to authenticated;

-- A listagem paginada usa a mesma classificação dos indicadores.
create or replace function public.list_my_releases(
  p_page integer,
  p_page_size integer,
  p_search text default null,
  p_song_id uuid default null,
  p_type text default null,
  p_period text default null,
  p_sort text default 'recent'
) returns jsonb
language plpgsql stable security invoker
set search_path = ''
as $$
declare
  result jsonb;
  safe_search text := btrim(regexp_replace(coalesce(p_search, ''), '[,()%_*]', ' ', 'g'));
  digits_search text := regexp_replace(coalesce(p_search, ''), '[^0-9]', '', 'g');
  cutoff date;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 500
     or length(coalesce(p_search, '')) > 100
     or (p_type is not null and p_type not in ('exclusiva', 'nao_exclusiva'))
     or (p_period is not null and p_period not in ('30d', '180d', 'ano_atual'))
     or p_sort not in ('recent', 'oldest', 'value_high', 'value_low', 'title') then
    raise exception using errcode = '23514', message = 'Parâmetros da lista de liberações inválidos.';
  end if;
  cutoff := case p_period
    when '30d' then current_date - 30
    when '180d' then current_date - 180
    when 'ano_atual' then date_trunc('year', current_date)::date
    else null end;

  with filtered as (
    select r.* from public.releases r
    where r.composer_id = auth.uid()
      and (p_song_id is null or r.song_id = p_song_id)
      and (cutoff is null or r.issue_date >= cutoff)
      and (p_type is null or (p_type = 'exclusiva' and public.is_exclusive_release(r.release_type))
        or (p_type = 'nao_exclusiva' and not public.is_exclusive_release(r.release_type)))
      and (safe_search = '' or r.song_title ilike '%' || safe_search || '%'
        or r.buyer_name ilike '%' || safe_search || '%'
        or r.document_code ilike '%' || safe_search || '%'
        or r.authors ilike '%' || safe_search || '%'
        or r.buyer_city_state ilike '%' || safe_search || '%'
        or r.buyer_document ilike '%' || safe_search || '%'
        or (length(digits_search) >= 3 and r.buyer_document ilike '%' || digits_search || '%')
        or (length(digits_search) = 11 and r.buyer_document ilike '%' ||
          substr(digits_search, 1, 3) || '.' || substr(digits_search, 4, 3) || '.' ||
          substr(digits_search, 7, 3) || '-' || substr(digits_search, 10, 2) || '%')
        or (length(digits_search) = 14 and r.buyer_document ilike '%' ||
          substr(digits_search, 1, 2) || '.' || substr(digits_search, 3, 3) || '.' ||
          substr(digits_search, 6, 3) || '/' || substr(digits_search, 9, 4) || '-' ||
          substr(digits_search, 13, 2) || '%'))
  ), numbered as (
    select f.*, row_number() over (
      order by case when p_sort = 'oldest' then f.issue_date end asc,
               case when p_sort = 'recent' then f.issue_date end desc,
               case when p_sort = 'value_high' then f.agreed_value end desc,
               case when p_sort = 'value_low' then f.agreed_value end asc,
               case when p_sort = 'title' then f.song_title end asc,
               f.id asc
    ) as rn from filtered f
  )
  select jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(n) - 'rn' order by n.rn), '[]'::jsonb)
      from numbered n where n.rn > (p_page::bigint - 1) * p_page_size
        and n.rn <= p_page::bigint * p_page_size),
    'total', (select count(*) from filtered)
  ) into result;
  return result;
end;
$$;

revoke execute on function public.list_my_releases(integer, integer, text, uuid, text, text, text) from public, anon;
grant execute on function public.list_my_releases(integer, integer, text, uuid, text, text, text) to authenticated;
notify pgrst, 'reload schema';
