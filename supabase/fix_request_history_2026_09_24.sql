-- ==============================================================================
-- Correção: histórico das negociações vazio
-- Pode ser executado a qualquer momento; é idempotente.
--
-- update_all_migrations.sql redefinia update_interest_request sem gravar
-- interest_request_history (e sem exigir a versão revisada), desfazendo
-- request_workflow_hardening.sql. A tela "Histórico de mudanças" ficava vazia
-- mesmo depois de várias mudanças de status e valor. A trava de exclusividade
-- também voltava a ignorar a validade das liberações exclusivas.
-- Mudanças anteriores a esta correção não são reconstruídas.
-- ==============================================================================

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

notify pgrst, 'reload schema';
