-- Concorrência otimista e trilha de auditoria das solicitações.
alter table public.interest_requests
  add column if not exists updated_at timestamptz not null default now();

alter table public.releases
  add column if not exists expires_at date;

create or replace function public.calculate_release_expiration(
  p_release_type text,
  p_issue_date date
) returns date
language plpgsql
immutable
as $$
declare
  months_match text[];
  months_count int;
begin
  if p_release_type is null or p_issue_date is null then
    return null;
  end if;
  if not public.is_exclusive_release(p_release_type) then
    return null;
  end if;

  months_match := regexp_match(p_release_type, '(\d+)\s*meses', 'i');
  if months_match is not null then
    months_count := months_match[1]::int;
    return (p_issue_date + (months_count * interval '1 month'))::date;
  end if;

  return null;
end;
$$;
revoke execute on function public.calculate_release_expiration(text, date) from public, anon;
grant execute on function public.calculate_release_expiration(text, date) to authenticated;

create or replace function public.is_active_exclusive_release(
  p_release_type text,
  p_issue_date date,
  p_expires_at date default null,
  p_check_date date default current_date
) returns boolean
language plpgsql
stable
as $$
declare
  exp_date date;
begin
  if not public.is_exclusive_release(p_release_type) then
    return false;
  end if;

  exp_date := coalesce(p_expires_at, public.calculate_release_expiration(p_release_type, p_issue_date));
  if exp_date is null then
    return true;
  end if;

  return coalesce(p_check_date, current_date) <= exp_date;
end;
$$;
revoke execute on function public.is_active_exclusive_release(text, date, date, date) from public, anon;
grant execute on function public.is_active_exclusive_release(text, date, date, date) to authenticated;

create table if not exists public.interest_request_history (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.interest_requests(id) on delete cascade,
  composer_id uuid not null references public.profiles(user_id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete restrict,
  previous_status text not null,
  new_status text not null,
  previous_agreed_value numeric(12,2),
  new_agreed_value numeric(12,2),
  changed_at timestamptz not null default now()
);

create index if not exists interest_request_history_request_idx
  on public.interest_request_history(request_id, changed_at desc);

alter table public.interest_request_history enable row level security;
drop policy if exists "request history owner read" on public.interest_request_history;
create policy "request history owner read" on public.interest_request_history
  for select using (auth.uid() = composer_id or public.is_admin());
revoke insert, update, delete on table public.interest_request_history from anon, authenticated;
grant select on table public.interest_request_history to authenticated;

drop function if exists public.update_interest_request(uuid,text,numeric,text,text);
drop function if exists public.update_interest_request(uuid,text,numeric,text,text,timestamptz);
drop function if exists public.update_interest_request(uuid,text,numeric,text,text,timestamptz,boolean);
create function public.update_interest_request(
  p_request_id uuid,
  p_status text,
  p_agreed_value numeric default null,
  p_notes text default null,
  p_archive_reason text default null,
  p_expected_updated_at timestamptz default null,
  p_clear_agreed_value boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_request public.interest_requests%rowtype;
  target_agreed_value numeric;
  changed_at_value timestamptz := clock_timestamp();
  result_json jsonb;
begin
  select * into current_request from public.interest_requests
  where id = p_request_id and composer_id = auth.uid() for update;
  if not found then
    raise exception using errcode = '42501', message = 'Solicitação não encontrada para este compositor.';
  end if;
  if p_expected_updated_at is null or current_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Esta solicitação foi alterada em outra aba. Recarregue a página antes de salvar novamente.';
  end if;
  if p_status not in ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada') then
    raise exception using errcode = '23514', message = 'Status de solicitação inválido.';
  end if;
  if p_status <> current_request.status and not (
    (current_request.status = 'nova' and p_status in ('em_negociacao','arquivada')) or
    (current_request.status = 'em_negociacao' and p_status in ('pagamento_pendente','arquivada')) or
    (current_request.status = 'pagamento_pendente' and p_status in ('em_negociacao','pagamento_confirmado','arquivada')) or
    (current_request.status = 'pagamento_confirmado' and p_status = 'arquivada') or
    (current_request.status = 'arquivada' and p_status = 'nova')
  ) then
    raise exception using errcode = '23514', message = 'Transição de status não permitida.';
  end if;
  if p_status in ('pagamento_pendente','pagamento_confirmado') and exists (
    select 1 from public.releases where song_id = current_request.song_id
      and request_id <> current_request.id and public.is_active_exclusive_release(release_type, issue_date, expires_at)
  ) then
    raise exception using errcode = '23514', message = 'Esta obra já possui uma liberação exclusiva emitida para outro interessado.';
  end if;

  -- Zero solicita a limpeza do valor antes do pagamento; null mantém o valor.
  target_agreed_value := case when p_agreed_value = 0 then null
    when p_clear_agreed_value then null
    else coalesce(p_agreed_value, current_request.agreed_value) end;
  if current_request.status = 'liberacao_enviada'
     and target_agreed_value is distinct from current_request.agreed_value then
    raise exception using errcode = '23514', message = 'O valor de uma liberação emitida não pode ser alterado.';
  end if;
  if p_status in ('pagamento_pendente','pagamento_confirmado') and coalesce(target_agreed_value,0) <= 0 then
    raise exception using errcode = '23514', message = 'Informe um valor acordado maior que zero.';
  end if;
  if target_agreed_value is not null and target_agreed_value > 10000000 then
    raise exception using errcode = '23514', message = 'O valor acordado não pode ultrapassar R$ 10.000.000,00.';
  end if;
  if length(coalesce(p_notes,'')) > 500 or length(coalesce(p_archive_reason,'')) > 160 then
    raise exception using errcode = '23514', message = 'Um dos textos ultrapassa o limite permitido.';
  end if;

  update public.interest_requests set status=p_status, agreed_value=target_agreed_value,
    notes=coalesce(p_notes,current_request.notes),
    payment_received_at=case when p_status='pagamento_confirmado' then coalesce(current_request.payment_received_at,changed_at_value) else current_request.payment_received_at end,
    archive_reason=case when p_status='arquivada' then nullif(btrim(p_archive_reason),'') when p_status='nova' then null else current_request.archive_reason end,
    archived_at=case when p_status='arquivada' then coalesce(current_request.archived_at,changed_at_value) when p_status='nova' then null else current_request.archived_at end,
    updated_at=changed_at_value where id=p_request_id;

  if current_request.status is distinct from p_status or current_request.agreed_value is distinct from target_agreed_value then
    insert into public.interest_request_history(request_id,composer_id,actor_id,previous_status,new_status,previous_agreed_value,new_agreed_value,changed_at)
    values(p_request_id,current_request.composer_id,auth.uid(),current_request.status,p_status,current_request.agreed_value,target_agreed_value,changed_at_value);
  end if;

  select to_jsonb(r) into result_json
  from (
    select ir.*, s.title as song_title, s.cover_url as song_cover
    from public.interest_requests ir
    left join public.songs s on s.id = ir.song_id
    where ir.id = p_request_id
  ) r;
  return result_json;
end;
$$;
revoke execute on function public.update_interest_request(uuid,text,numeric,text,text,timestamptz,boolean) from public, anon;
grant execute on function public.update_interest_request(uuid,text,numeric,text,text,timestamptz,boolean) to authenticated;

-- Protege também alterações fora da RPC, inclusive por rotas administrativas.
create or replace function public.preserve_issued_request_value()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.agreed_value is distinct from new.agreed_value
     and (old.status = 'liberacao_enviada' or exists (
       select 1 from public.releases where request_id = old.id
     )) then
    raise exception using errcode = '23514', message = 'O valor de uma liberação emitida não pode ser alterado.';
  end if;
  return new;
end;
$$;
revoke execute on function public.preserve_issued_request_value() from public, anon, authenticated;
drop trigger if exists preserve_issued_request_value on public.interest_requests;
create trigger preserve_issued_request_value
before update of agreed_value on public.interest_requests
for each row execute function public.preserve_issued_request_value();

-- Serializa liberações por obra. Sem este bloqueio, duas transações de
-- solicitações diferentes poderiam verificar a ausência de liberações ao mesmo
-- tempo e ambas conceder exclusividade.
create or replace function public.enforce_release_exclusivity()
returns trigger
language plpgsql
security definer
set search_path = '' as $$
begin
  perform 1
  from public.songs
  where id = new.song_id
  for update;

  if not found then
    raise exception using errcode = '23503', message = 'A obra vinculada à liberação não foi encontrada.';
  end if;

  if new.expires_at is null and new.issue_date is not null then
    new.expires_at := public.calculate_release_expiration(new.release_type, new.issue_date);
  end if;

  if exists (
    select 1
    from public.releases
    where song_id = new.song_id
      and id is distinct from new.id
      and public.is_active_exclusive_release(release_type, issue_date, expires_at, coalesce(new.issue_date, current_date))
  ) then
    raise exception using errcode = '23514', message = 'Esta obra já possui uma liberação exclusiva emitida para outro interessado.';
  end if;

  if public.is_exclusive_release(new.release_type) and exists (
    select 1
    from public.releases
    where song_id = new.song_id
      and id is distinct from new.id
      and (expires_at is null or expires_at >= coalesce(new.issue_date, current_date))
  ) then
    raise exception using errcode = '23514', message = 'Não é possível conceder exclusividade para uma obra que já possui outras liberações emitidas.';
  end if;

  return new;
end;
$$;

revoke execute on function public.enforce_release_exclusivity() from public, anon, authenticated;
drop trigger if exists enforce_release_exclusivity on public.releases;
create trigger enforce_release_exclusivity
before insert or update of song_id, release_type on public.releases
for each row execute function public.enforce_release_exclusivity();

-- A emissão usa a versão que o compositor revisou. A função antiga permanece
-- apenas para uso interno da nova RPC, sem permissão de chamada pelo cliente.
create or replace function public.issue_release(
  p_request_id uuid,
  p_release_type text,
  p_additional_conditions text,
  p_digital_signature text,
  p_close_song boolean,
  p_agreed_value numeric,
  p_expected_updated_at timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  current_request public.interest_requests%rowtype;
  issued_request public.interest_requests%rowtype;
  release_result jsonb;
  changed_at_value timestamptz;
begin
  select * into current_request from public.interest_requests
  where id = p_request_id and composer_id = auth.uid() for update;
  if not found then
    raise exception using errcode = '42501', message = 'Solicitação não encontrada para este compositor.';
  end if;
  if p_expected_updated_at is null or current_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = '40001', message = 'Esta solicitação foi alterada. Recarregue a página antes de emitir a liberação.';
  end if;

  release_result := public.issue_release(
    p_request_id, p_release_type, p_additional_conditions,
    p_digital_signature, p_close_song, p_agreed_value
  );

  changed_at_value := clock_timestamp();
  update public.interest_requests set updated_at = changed_at_value
  where id = p_request_id returning * into issued_request;
  insert into public.interest_request_history(
    request_id, composer_id, actor_id, previous_status, new_status,
    previous_agreed_value, new_agreed_value, changed_at
  ) values (
    p_request_id, current_request.composer_id, auth.uid(),
    current_request.status, issued_request.status,
    current_request.agreed_value, issued_request.agreed_value, changed_at_value
  );
  return release_result || jsonb_build_object('requestUpdatedAt', changed_at_value);
end;
$$;
revoke execute on function public.issue_release(uuid,text,text,text,boolean,numeric,timestamptz) from public, anon;
grant execute on function public.issue_release(uuid,text,text,text,boolean,numeric,timestamptz) to authenticated;
do $$
declare
  legacy_signature text;
begin
  for legacy_signature in
    select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'issue_release' and p.pronargs <> 7
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', legacy_signature);
  end loop;
end $$;

-- Lista paginada no banco; a consulta lê apenas solicitações do usuário atual.
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
