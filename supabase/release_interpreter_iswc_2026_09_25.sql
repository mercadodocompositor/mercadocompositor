-- ==============================================================================
-- Termo de liberação: intérprete e código ISWC
-- Execute DEPOIS de release_delivery_2026_09_24.sql. É idempotente.
--
-- A liberação sai em nome de quem tem CPF/CNPJ (o responsável), mas quem grava
-- pode ser uma banda ou dupla. O termo passa a registrar o intérprete (nome
-- artístico informado na solicitação) e o ISWC da obra, congelados na emissão
-- como os demais dados do documento.
-- ==============================================================================

alter table public.songs add column if not exists iswc text;
alter table public.songs drop constraint if exists songs_iswc_length;
alter table public.songs add constraint songs_iswc_length check (iswc is null or length(iswc) <= 40);

grant insert (iswc) on table public.songs to authenticated;
grant update (iswc) on table public.songs to authenticated;

alter table public.releases add column if not exists interpreter_name text;
alter table public.releases add column if not exists iswc text;

-- Termos já emitidos: o intérprete vem da solicitação original.
update public.releases rel
set interpreter_name = coalesce(nullif(btrim(req.buyer_stage_name), ''), rel.buyer_name)
from public.interest_requests req
where req.id = rel.request_id and rel.interpreter_name is null;

create or replace function public.fill_release_interpreter_iswc() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if nullif(btrim(coalesce(new.interpreter_name, '')), '') is null then
    select coalesce(nullif(btrim(buyer_stage_name), ''), new.buyer_name)
    into new.interpreter_name
    from public.interest_requests where id = new.request_id;
  end if;
  if nullif(btrim(coalesce(new.iswc, '')), '') is null then
    select nullif(btrim(iswc), '') into new.iswc from public.songs where id = new.song_id;
  end if;
  return new;
end $$;
revoke execute on function public.fill_release_interpreter_iswc() from public, anon, authenticated;
drop trigger if exists fill_release_interpreter_iswc on public.releases;
create trigger fill_release_interpreter_iswc
before insert on public.releases
for each row execute function public.fill_release_interpreter_iswc();

-- Consulta pública passa a devolver intérprete e ISWC. CPF/CNPJ seguem
-- reduzidos aos quatro últimos dígitos: a validação é aberta a qualquer pessoa.
create or replace function public.validate_release_document(p_document_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_code text := upper(btrim(coalesce(p_document_code, '')));
  release_row public.releases%rowtype;
begin
  if length(normalized_code) < 12
     or length(normalized_code) > 40
     or normalized_code !~ '^LIB-[0-9]{4}-[A-Z0-9]+$' then
    return null;
  end if;

  select * into release_row
  from public.releases
  where document_code = normalized_code
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'songTitle', release_row.song_title,
    'authors', release_row.authors,
    'iswc', coalesce(release_row.iswc, ''),
    'composerName', release_row.composer_name,
    'composerDocumentLast4', right(regexp_replace(release_row.composer_cpf, '[^0-9]', '', 'g'), 4),
    'composerCityState', release_row.composer_city_state,
    'buyerName', release_row.buyer_name,
    'interpreterName', coalesce(release_row.interpreter_name, ''),
    'buyerDocumentLast4', right(regexp_replace(release_row.buyer_document, '[^0-9]', '', 'g'), 4),
    'buyerCityState', release_row.buyer_city_state,
    'authorizedPurpose', release_row.authorized_purpose,
    'releaseType', release_row.release_type,
    'issueDate', release_row.issue_date,
    'digitalSignature', release_row.digital_signature,
    'documentCode', release_row.document_code
  );
end;
$$;

revoke execute on function public.validate_release_document(text) from public;
grant execute on function public.validate_release_document(text) to anon, authenticated;
