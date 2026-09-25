-- ==============================================================================
-- Comprovante por e-mail ao interessado que envia um pedido de liberação
-- Execute DEPOIS de self_account_deletion_2026_09_24.sql. É idempotente.
--
-- O interessado não tem conta e, até aqui, só recebia e-mail quando o termo
-- era emitido. Depois de enviar o pedido ficava sem nenhum registro do código.
-- Agora cada pedido novo coloca na fila (notification_email_outbox) um e-mail
-- com o código da solicitação, a obra e o compositor.
-- ==============================================================================

alter table public.notification_email_outbox
  add column if not exists received_request_id uuid references public.interest_requests(id) on delete cascade;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_received_request_id_key') then
    alter table public.notification_email_outbox
      add constraint notification_email_outbox_received_request_id_key unique (received_request_id);
  end if;
end $$;

alter table public.notification_email_outbox drop constraint if exists notification_email_outbox_origin_check;
alter table public.notification_email_outbox add constraint notification_email_outbox_origin_check
  check (notification_id is not null or release_id is not null or archived_request_id is not null
         or received_request_id is not null);

create or replace function public.queue_buyer_request_receipt() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_email text := lower(btrim(coalesce(new.buyer_email, '')));
  v_song_title text;
  v_composer text;
  v_username text;
begin
  if v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return new;
  end if;

  select s.title, coalesce(nullif(btrim(p.stage_name), ''), nullif(btrim(p.name), ''), 'o compositor'), p.username
    into v_song_title, v_composer, v_username
  from public.songs s
  join public.profiles p on p.user_id = s.composer_id
  where s.id = new.song_id;

  insert into public.notification_email_outbox(user_id, recipient, subject, body, action_url, audience, received_request_id)
  values (
    new.composer_id,
    v_email,
    format('Recebemos seu pedido de liberação da obra "%s"', coalesce(v_song_title, 'solicitada')),
    format('Olá, %s. Seu pedido de liberação da obra "%s" foi entregue a %s. Código da solicitação: %s. O compositor vai entrar em contato pelos canais que você informou para combinar valores e condições. O envio não gera cobrança nem autorização automática. Guarde este e-mail.',
      btrim(new.buyer_name), coalesce(v_song_title, 'solicitada'), v_composer,
      upper(left(new.id::text, 8))),
    case when v_username is not null then '/compositor/' || v_username else '/' end,
    'buyer',
    new.id
  )
  on conflict (received_request_id) do nothing;
  return new;
end $$;
revoke execute on function public.queue_buyer_request_receipt() from public, anon, authenticated;

drop trigger if exists queue_buyer_request_receipt on public.interest_requests;
create trigger queue_buyer_request_receipt
after insert on public.interest_requests
for each row execute function public.queue_buyer_request_receipt();

notify pgrst, 'reload schema';
