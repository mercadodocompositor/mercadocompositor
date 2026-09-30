-- ==============================================================================
-- Abuso do formulário público e registro de erros do navegador (2026-09-30)
-- Execute depois de request_consent_evidence_2026_09_24.sql e ANTES de
-- verify_workflow_guarantees_2026_09_24.sql. É idempotente.
--
--   1. rpc_client_identity passa a preferir cf-connecting-ip, que a borda da
--      Cloudflare (na frente da API do Supabase) sobrescreve. O primeiro valor
--      de x-forwarded-for pode ser enviado pelo próprio cliente, o que permitia
--      trocar de "IP" a cada requisição e zerar o limite por origem.
--   2. create_interest_request ganha dois tetos que não dependem do IP: cada
--      endereço de e-mail recebe no máximo 5 comprovantes por dia e cada obra
--      aceita no máximo 20 pedidos por hora. O formulário não pode mais ser
--      usado para encher a caixa de entrada de um terceiro.
--   3. client_error_events guarda os erros enviados pelo navegador à Edge
--      Function client-telemetry. Sem isso, falhas de usuários em produção não
--      ficavam registradas em lugar nenhum.
-- ==============================================================================

create or replace function public.rpc_client_identity()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  headers json;
  origin text;
begin
  if auth.uid() is not null then
    return 'uid:' || auth.uid()::text;
  end if;
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  origin := btrim(coalesce(headers->>'cf-connecting-ip', ''));
  if origin = '' then
    origin := btrim(coalesce(headers->>'x-real-ip', ''));
  end if;
  if origin = '' then
    origin := btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1));
  end if;
  return 'ip:' || coalesce(nullif(origin, ''), 'unknown');
end $$;
revoke execute on function public.rpc_client_identity() from public, anon, authenticated;

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
     or not public.consume_rpc_rate_limit('interest-origin', origin_value, 30, 3600)
     -- Tetos que não dependem do IP: por destinatário do comprovante e por obra.
     or not public.consume_rpc_rate_limit('interest-email', email_value, 5, 86400)
     or not public.consume_rpc_rate_limit('interest-song', p_song_id::text, 20, 3600) then
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

-- ------------------------------------------------------------------------------
-- Erros do navegador
-- ------------------------------------------------------------------------------
create table if not exists public.client_error_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  level text not null check (level in ('error', 'warning')),
  message text not null,
  path text not null default '',
  release text not null default '',
  context jsonb not null default '{}'::jsonb,
  user_agent text not null default ''
);
create index if not exists client_error_events_created_idx on public.client_error_events(created_at desc);
alter table public.client_error_events enable row level security;
revoke all on table public.client_error_events from public, anon, authenticated;
grant select on table public.client_error_events to authenticated;
grant all on table public.client_error_events to service_role;
drop policy if exists "client errors admin read" on public.client_error_events;
create policy "client errors admin read" on public.client_error_events
  for select to authenticated using (public.is_admin());

-- A Edge Function (service_role) limita o volume por origem antes de gravar.
grant execute on function public.consume_rpc_rate_limit(text, text, integer, integer) to service_role;

-- Guarda 30 dias de erros e aproveita para limpar janelas antigas do limite de
-- requisições, que nunca eram apagadas.
create or replace function public.purge_operational_logs() returns void
language sql security definer set search_path = '' as $$
  delete from public.client_error_events where created_at < now() - interval '30 days';
  delete from public.rpc_rate_limits where updated_at < now() - interval '2 days';
$$;
revoke execute on function public.purge_operational_logs() from public, anon, authenticated;

do $$
begin
  if to_regnamespace('cron') is null then
    raise notice 'pg_cron indisponível: agende public.purge_operational_logs() manualmente.';
    return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname = 'purge-operational-logs';
  perform cron.schedule('purge-operational-logs', '40 3 * * *', 'select public.purge_operational_logs();');
end $$;

notify pgrst, 'reload schema';
