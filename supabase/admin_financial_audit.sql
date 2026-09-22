-- Corrige a auditoria financeira global e o vínculo com termos de liberação.
-- Execute após admin_composers_management.sql. É idempotente.

alter table public.releases add column if not exists sent_to_buyer_at timestamptz;
alter table public.interest_requests
  add column if not exists platform_fee_percentage numeric(5,2),
  add column if not exists platform_fee_amount numeric(12,2),
  add column if not exists composer_net_amount numeric(12,2);

-- Registros históricos permanecem nulos porque a taxa vigente na data do
-- pagamento não pode ser reconstruída com segurança a partir da configuração atual.

create or replace function public.capture_payment_financial_snapshot()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_fee_percentage numeric(5,2);
begin
  if old.payment_received_at is not null
     and old.agreed_value is distinct from new.agreed_value then
    raise exception using errcode = '23514', message = 'O valor não pode ser alterado após a confirmação do pagamento.';
  end if;
  if old.platform_fee_percentage is distinct from new.platform_fee_percentage
     or old.platform_fee_amount is distinct from new.platform_fee_amount
     or old.composer_net_amount is distinct from new.composer_net_amount then
    raise exception using errcode = '42501', message = 'O snapshot financeiro é imutável.';
  end if;

  if old.payment_received_at is null and new.payment_received_at is not null then
    if new.agreed_value is null or new.agreed_value <= 0 then
      raise exception using errcode = '23514', message = 'O pagamento exige valor acordado válido.';
    end if;
    select platform_fee_percentage into v_fee_percentage
    from public.platform_settings where id = true;
    v_fee_percentage := coalesce(v_fee_percentage, 0);
    if v_fee_percentage < 0 or v_fee_percentage > 100 then
      raise exception using errcode = '23514', message = 'A taxa da plataforma está fora do intervalo permitido.';
    end if;
    new.platform_fee_percentage := v_fee_percentage;
    new.platform_fee_amount := round(new.agreed_value * v_fee_percentage / 100, 2);
    new.composer_net_amount := new.agreed_value - new.platform_fee_amount;
  end if;
  return new;
end;
$$;
revoke execute on function public.capture_payment_financial_snapshot() from public, anon, authenticated;
drop trigger if exists capture_payment_financial_snapshot on public.interest_requests;
create trigger capture_payment_financial_snapshot
before update on public.interest_requests
for each row execute function public.capture_payment_financial_snapshot();

drop function if exists public.get_admin_global_requests(integer, integer, text, text);
create function public.get_admin_global_requests(
  p_page integer default 1,
  p_page_size integer default 20,
  p_search text default null,
  p_status text default null
)
returns table (
  id uuid, song_id uuid, song_title text, song_cover text,
  composer_id uuid, composer_name text, buyer_name text,
  buyer_stage_name text, cpf_cnpj text, buyer_email text,
  buyer_whatsapp text, buyer_city_state text, purpose text, message text,
  status text, agreed_value numeric, notes text, created_at timestamptz,
  payment_received_at timestamptz, archive_reason text, archived_at timestamptz,
  updated_at timestamptz, release_id uuid, platform_fee_percentage numeric,
  platform_fee_amount numeric, composer_net_amount numeric, total_count bigint
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
  if length(coalesce(p_search, '')) > 100
     or (p_status is not null and p_status <> 'all' and p_status not in
       ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada')) then
    raise exception using errcode = '23514', message = 'Filtros da auditoria financeira inválidos.';
  end if;

  return query
  with filtered as (
    select r.id, r.song_id, s.title as song_title, s.cover_url as song_cover,
      r.composer_id, p.name as composer_name, r.buyer_name, r.buyer_stage_name,
      r.cpf_cnpj, r.buyer_email, r.buyer_whatsapp, r.buyer_city_state,
      r.purpose, r.message, r.status, r.agreed_value, r.notes, r.created_at,
      r.payment_received_at, r.archive_reason, r.archived_at, r.updated_at,
      rel.id as release_id, r.platform_fee_percentage,
      r.platform_fee_amount, r.composer_net_amount
    from public.interest_requests r
    left join public.songs s on s.id = r.song_id
    left join public.profiles p on p.user_id = r.composer_id
    left join public.releases rel on rel.request_id = r.id
    where (p_status is null or p_status = 'all' or r.status = p_status)
      and (v_search is null
        or s.title ilike '%' || v_search || '%'
        or r.buyer_name ilike '%' || v_search || '%'
        or p.name ilike '%' || v_search || '%'
        or r.buyer_email ilike '%' || v_search || '%'
        or r.cpf_cnpj ilike '%' || v_search || '%'
        or rel.document_code ilike '%' || v_search || '%')
  )
  select f.*, count(*) over() as total_count
  from filtered f
  order by coalesce(f.payment_received_at, f.created_at) desc, f.id desc
  limit v_page_size offset (v_page - 1) * v_page_size;
end;
$$;
revoke execute on function public.get_admin_global_requests(integer, integer, text, text) from public, anon;
grant execute on function public.get_admin_global_requests(integer, integer, text, text) to authenticated;

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
  sent_to_buyer_at timestamptz, created_at timestamptz, total_count bigint
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
      rel.sent_to_buyer_at, rel.created_at
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
end;
$$;
revoke execute on function public.get_admin_global_releases(integer, integer, text) from public, anon;
grant execute on function public.get_admin_global_releases(integer, integer, text) to authenticated;

drop policy if exists "release documents owner or admin read" on storage.objects;
drop policy if exists "release documents owner or finance read" on storage.objects;
create policy "release documents owner or finance read" on storage.objects
for select to authenticated
using (
  bucket_id = 'release-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text
    or public.can_manage_composer_subscriptions())
);

notify pgrst, 'reload schema';
