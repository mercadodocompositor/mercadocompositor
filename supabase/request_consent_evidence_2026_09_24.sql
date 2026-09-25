-- ==============================================================================
-- Evidência imutável do aceite enviado junto com uma solicitação de liberação.
-- Execute depois de fix_auditoria_2026_09.sql (e depois de update_all_migrations.sql,
-- caso o consolidado também seja usado).
-- ==============================================================================

alter table public.interest_requests add column if not exists consent_accepted_at timestamptz;
alter table public.interest_requests add column if not exists consent_policy_version text;
alter table public.interest_requests add column if not exists consent_statement text;
alter table public.interest_requests add column if not exists consent_source text;

create or replace function public.preserve_interest_request_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (
    new.song_id, new.composer_id, new.buyer_name, new.buyer_stage_name,
    new.cpf_cnpj, new.buyer_email, new.buyer_whatsapp, new.buyer_city_state,
    new.purpose, new.message, new.created_at, new.consent_accepted_at,
    new.consent_policy_version, new.consent_statement, new.consent_source
  ) is distinct from (
    old.song_id, old.composer_id, old.buyer_name, old.buyer_stage_name,
    old.cpf_cnpj, old.buyer_email, old.buyer_whatsapp, old.buyer_city_state,
    old.purpose, old.message, old.created_at, old.consent_accepted_at,
    old.consent_policy_version, old.consent_statement, old.consent_source
  ) then
    raise exception using errcode = '42501',
      message = 'Os dados originais e a evidência de consentimento da solicitação são imutáveis.';
  end if;
  return new;
end $$;
revoke execute on function public.preserve_interest_request_identity() from public, anon, authenticated;

drop trigger if exists preserve_interest_request_identity on public.interest_requests;
create trigger preserve_interest_request_identity
before update on public.interest_requests
for each row execute function public.preserve_interest_request_identity();

create or replace function public.create_interest_request(p_song_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  new_id uuid;
  email_value text;
  document_digits text;
  phone_digits text;
  origin_value text;
  song_title text;
  consent_version constant text := '2026-09-24';
  consent_text constant text := 'Declaro que os dados informados são verdadeiros, autorizo seu tratamento para registrar e conduzir esta solicitação de liberação e estou ciente de que valores e autorização serão negociados diretamente com o compositor.';
begin
  email_value := lower(btrim(coalesce(p_data->>'buyerEmail', '')));
  document_digits := regexp_replace(coalesce(p_data->>'cpfCnpj', ''), '[^0-9]', '', 'g');
  phone_digits := regexp_replace(coalesce(p_data->>'buyerWhatsapp', ''), '[^0-9]', '', 'g');
  origin_value := public.rpc_client_identity();

  if coalesce(p_data->>'consentAccepted', '') <> 'true'
     or coalesce(p_data->>'consentPolicyVersion', '') <> consent_version then
    raise exception using errcode = '23514',
      message = 'Confirme a declaração de veracidade e a Política de Privacidade antes de enviar.';
  end if;

  if length(btrim(coalesce(p_data->>'buyerName',''))) not between 2 and 160
     or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(document_digits) not in (11,14)
     or length(phone_digits) not between 10 and 13
     or length(btrim(coalesce(p_data->>'buyerCityState',''))) not between 3 and 160
     or length(btrim(coalesce(p_data->>'purpose',''))) not between 3 and 300
     or length(btrim(coalesce(p_data->>'message',''))) not between 20 and 3000 then
    raise exception using errcode = '23514', message = 'Dados da solicitação inválidos.';
  end if;

  if not public.consume_rpc_rate_limit('interest-person-'||p_song_id, email_value||':'||document_digits, 3, 3600)
     or not public.consume_rpc_rate_limit('interest-origin', origin_value, 30, 3600) then
    raise exception using errcode = 'P0001', message = 'Limite de solicitações atingido. Tente novamente mais tarde.';
  end if;

  select s.composer_id, s.title into owner_id, song_title
  from public.songs s
  join public.subscriptions sub on sub.user_id = s.composer_id and sub.status = 'active'
  where s.id = p_song_id and s.status = 'published' and s.is_available_for_release;
  if owner_id is null then
    raise exception using errcode = 'P0002', message = 'Esta música não está disponível para solicitações.';
  end if;

  insert into public.interest_requests(
    song_id, composer_id, buyer_name, buyer_stage_name, cpf_cnpj, buyer_email,
    buyer_whatsapp, buyer_city_state, purpose, message, consent_accepted_at,
    consent_policy_version, consent_statement, consent_source
  ) values (
    p_song_id, owner_id, btrim(p_data->>'buyerName'), nullif(btrim(p_data->>'buyerStageName'), ''),
    p_data->>'cpfCnpj', email_value, p_data->>'buyerWhatsapp', btrim(p_data->>'buyerCityState'),
    btrim(p_data->>'purpose'), btrim(p_data->>'message'), clock_timestamp(),
    consent_version, consent_text, 'public_interest_request_form'
  ) returning id into new_id;

  update public.songs set interested_count = interested_count + 1 where id = p_song_id;
  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (owner_id, 'Nova solicitação de interesse',
    format('%s demonstrou interesse na obra "%s".', btrim(p_data->>'buyerName'), coalesce(song_title, '')),
    'request', false, '/dashboard/solicitacoes');
  return new_id;
end $$;
revoke execute on function public.create_interest_request(uuid, jsonb) from public;
grant execute on function public.create_interest_request(uuid, jsonb) to anon, authenticated;

notify pgrst, 'reload schema';
