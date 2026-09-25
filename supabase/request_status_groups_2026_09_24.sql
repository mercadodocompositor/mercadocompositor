-- ==============================================================================
-- Lista de solicitações por grupo operacional
-- Pode ser executado a qualquer momento; é idempotente.
--
-- p_status passa a aceitar vários status separados por vírgula
-- ("nova,pagamento_confirmado"), para as abas "Precisa de ação", "Em andamento"
-- e "Concluídas". Um status sozinho continua funcionando como antes.
-- ==============================================================================

create or replace function public.list_interest_requests(
  p_page integer default 1,
  p_page_size integer default 20,
  p_status text default null,
  p_song_id uuid default null,
  p_query text default '',
  p_oldest boolean default false
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  result jsonb;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;
  if p_page is null or p_page < 1 or p_page_size is null or p_page_size not between 1 and 100
     or length(coalesce(p_query, '')) > 100 or length(coalesce(p_status, '')) > 200 then
    raise exception using errcode = '23514', message = 'Parâmetros da lista de solicitações inválidos.';
  end if;
  with own as (
    select r.*, s.title as song_title, s.cover_url as song_cover
    from public.interest_requests r
    left join public.songs s on s.id = r.song_id
    where r.composer_id = auth.uid()
  ), filtered as (
    select * from own o
    where (p_status is null or o.status = any(string_to_array(p_status, ',')))
      and (p_song_id is null or o.song_id = p_song_id)
      and (nullif(btrim(p_query), '') is null or
        position(lower(btrim(p_query)) in lower(concat_ws(' ',
          o.buyer_name, o.buyer_stage_name, o.song_title,
          o.buyer_city_state, o.buyer_email, o.cpf_cnpj,
          split_part(o.id::text, '-', 1)
        ))) > 0)
  ), numbered as (
    select f.*, row_number() over (
      order by case when p_oldest then f.created_at end asc,
               case when not p_oldest then f.created_at end desc,
               f.id desc
    ) as rn from filtered f
  )
  select jsonb_build_object(
    'items', (select coalesce(jsonb_agg(to_jsonb(n) - 'rn' order by n.rn), '[]'::jsonb)
      from numbered n where n.rn > (p_page::bigint - 1) * p_page_size
        and n.rn <= p_page::bigint * p_page_size),
    'total', (select count(*) from filtered),
    'statusCounts', (select coalesce(jsonb_object_agg(c.status, c.count), '{}'::jsonb)
      from (select status, count(*) as count from own where status is not null group by status) c),
    'songCounts', (select coalesce(jsonb_object_agg(c.song_id, c.count), '{}'::jsonb)
      from (select song_id, count(*) as count from own where song_id is not null group by song_id) c)
  ) into result;
  return result;
end;
$$;
revoke execute on function public.list_interest_requests(integer,integer,text,uuid,text,boolean) from public, anon;
grant execute on function public.list_interest_requests(integer,integer,text,uuid,text,boolean) to authenticated;

notify pgrst, 'reload schema';
