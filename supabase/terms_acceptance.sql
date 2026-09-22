-- ==============================================================================
-- REGISTRO DE ACEITE DOS TERMOS (LGPD / rastreabilidade)
-- ==============================================================================
-- `platform_settings.terms_version` era editável no painel mas não participava
-- de nenhum aceite: não havia como provar qual versão cada compositor aceitou.
--
-- Este script cria o registro. NÃO bloqueia quem está com versão antiga —
-- esse passo fica para depois, se desejado.

create table if not exists public.terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);

alter table public.terms_acceptances enable row level security;

drop policy if exists "terms own read" on public.terms_acceptances;
create policy "terms own read" on public.terms_acceptances
  for select using (auth.uid() = user_id or public.is_admin());

drop policy if exists "terms own insert" on public.terms_acceptances;
create policy "terms own insert" on public.terms_acceptances
  for insert with check (auth.uid() = user_id);

-- O aceite do cadastro chega antes de existir sessão (confirmação de e-mail),
-- então é gravado a partir do metadado enviado no signUp.
create or replace function public.handle_new_user_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text := nullif(btrim(coalesce(new.raw_user_meta_data->>'terms_version','')),'');
begin
  if v is not null then
    insert into public.terms_acceptances(user_id, terms_version)
    values (new.id, v)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_terms on auth.users;
create trigger on_auth_user_created_terms after insert on auth.users
  for each row execute procedure public.handle_new_user_terms();

-- Aceite explícito de um usuário já autenticado (ex.: nova versão dos termos).
create or replace function public.record_terms_acceptance(p_version text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v text := nullif(btrim(coalesce(p_version,'')),''); cur text;
begin
  if auth.uid() is null then
    raise exception using errcode='42501', message='Sessão expirada.';
  end if;
  select terms_version into cur from public.platform_settings where id = true;
  if v is null or v is distinct from cur then
    raise exception using errcode='23514', message='Versão de termos inválida.';
  end if;
  insert into public.terms_acceptances(user_id, terms_version)
  values (auth.uid(), v)
  on conflict do nothing;
  return jsonb_build_object('success', true, 'termsVersion', v);
end $$;

revoke execute on function public.record_terms_acceptance(text) from public, anon;
grant execute on function public.record_terms_acceptance(text) to authenticated;
