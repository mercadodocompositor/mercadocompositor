-- Execute após admin_financial_audit.sql. Preserva o termo e o histórico;
-- apenas o classifica para que indicadores operacionais possam excluí-lo.
begin;

alter table public.releases add column if not exists is_demo boolean not null default false;

do $$
declare matched_count integer;
begin
  select count(*) into matched_count
  from public.releases
  where song_title = 'Simulação Claude — Canção de Teste'
    and buyer_name = 'Interessado Simulação Claude'
    and agreed_value = 3500;
  if matched_count <> 1 then
    raise exception 'Esperado exatamente um termo de simulação; encontrados %', matched_count;
  end if;
  update public.releases set is_demo = true
  where song_title = 'Simulação Claude — Canção de Teste'
    and buyer_name = 'Interessado Simulação Claude'
    and agreed_value = 3500;
end $$;

drop function if exists public.get_admin_global_releases(integer, integer, text);
create function public.get_admin_global_releases(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null
)
returns table (
  id uuid, request_id uuid, song_id uuid, song_title text, authors text,
  composer_name text, composer_cpf text, composer_city_state text,
  buyer_name text, buyer_document text, buyer_city_state text,
  agreed_value numeric, authorized_purpose text, release_type text,
  issue_date date, expires_at date, additional_conditions text, digital_signature text,
  document_code text, document_path text, document_hash text,
  template_version text, document_archived_at timestamptz,
  sent_to_buyer_at timestamptz, created_at timestamptz, is_demo boolean,
  total_count bigint
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 500);
  v_search text := nullif(btrim(p_search), '');
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à auditoria financeira.';
  end if;
  if length(coalesce(p_search, '')) > 100 then
    raise exception using errcode = '23514', message = 'Filtro de termos inválido.';
  end if;

  return query
  with filtered as (
    select rel.id, rel.request_id, rel.song_id, rel.song_title, rel.authors,
      rel.composer_name, rel.composer_cpf, rel.composer_city_state,
      rel.buyer_name, rel.buyer_document, rel.buyer_city_state,
      rel.agreed_value, rel.authorized_purpose, rel.release_type,
      rel.issue_date, rel.expires_at, rel.additional_conditions, rel.digital_signature,
      rel.document_code, rel.document_path, rel.document_hash,
      rel.template_version, rel.document_archived_at,
      rel.sent_to_buyer_at, rel.created_at, rel.is_demo
    from public.releases rel
    where v_search is null
      or rel.song_title ilike '%' || v_search || '%'
      or rel.buyer_name ilike '%' || v_search || '%'
      or rel.composer_name ilike '%' || v_search || '%'
      or rel.document_code ilike '%' || v_search || '%'
      or rel.buyer_document ilike '%' || v_search || '%'
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by f.created_at desc, f.id desc
  limit v_page_size offset (v_page - 1) * v_page_size;
end $$;

revoke execute on function public.get_admin_global_releases(integer, integer, text) from public, anon;
grant execute on function public.get_admin_global_releases(integer, integer, text) to authenticated;

commit;
notify pgrst, 'reload schema';
