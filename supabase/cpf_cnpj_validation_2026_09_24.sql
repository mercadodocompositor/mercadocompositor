-- ==============================================================================
-- Validação dos dígitos verificadores de CPF/CNPJ nas novas solicitações.
-- Execute depois de request_consent_evidence_2026_09_24.sql. É idempotente.
-- Registros históricos não são reclassificados nem alterados.
-- ==============================================================================

create or replace function public.is_valid_cpf_cnpj(p_value text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d text := regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
  total integer;
  remainder integer;
  expected integer;
  i integer;
  weights integer[];
begin
  if length(d) not in (11, 14) or d = repeat(substr(d, 1, 1), length(d)) then
    return false;
  end if;

  if length(d) = 11 then
    total := 0;
    for i in 1..9 loop
      total := total + substr(d, i, 1)::integer * (11 - i);
    end loop;
    remainder := (total * 10) % 11;
    expected := case when remainder = 10 then 0 else remainder end;
    if expected <> substr(d, 10, 1)::integer then return false; end if;

    total := 0;
    for i in 1..10 loop
      total := total + substr(d, i, 1)::integer * (12 - i);
    end loop;
    remainder := (total * 10) % 11;
    expected := case when remainder = 10 then 0 else remainder end;
    return expected = substr(d, 11, 1)::integer;
  end if;

  weights := array[5,4,3,2,9,8,7,6,5,4,3,2];
  total := 0;
  for i in 1..12 loop
    total := total + substr(d, i, 1)::integer * weights[i];
  end loop;
  remainder := total % 11;
  expected := case when remainder < 2 then 0 else 11 - remainder end;
  if expected <> substr(d, 13, 1)::integer then return false; end if;

  weights := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  total := 0;
  for i in 1..13 loop
    total := total + substr(d, i, 1)::integer * weights[i];
  end loop;
  remainder := total % 11;
  expected := case when remainder < 2 then 0 else 11 - remainder end;
  return expected = substr(d, 14, 1)::integer;
end $$;
revoke execute on function public.is_valid_cpf_cnpj(text) from public, anon, authenticated;

create or replace function public.require_valid_interest_request_document()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_valid_cpf_cnpj(new.cpf_cnpj) then
    raise exception using errcode = '23514',
      message = 'CPF ou CNPJ inválido. Verifique os números e os dígitos verificadores.';
  end if;
  return new;
end $$;
revoke execute on function public.require_valid_interest_request_document() from public, anon, authenticated;

drop trigger if exists require_valid_interest_request_document on public.interest_requests;
create trigger require_valid_interest_request_document
before insert on public.interest_requests
for each row execute function public.require_valid_interest_request_document();

notify pgrst, 'reload schema';
