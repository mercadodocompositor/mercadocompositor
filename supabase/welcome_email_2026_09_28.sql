-- =============================================================================
-- MERCADO DO COMPOSITOR — BOAS-VINDAS AO CONFIRMAR A CONTA (2026-09-28)
-- =============================================================================
-- Quem entra pelo Google chega com o e-mail já confirmado e não recebia nenhuma
-- mensagem. Agora toda conta recebe uma notificação de boas-vindas no momento
-- em que o e-mail fica confirmado:
--   • Google: logo no cadastro;
--   • e-mail e senha: quando clica no link de confirmação.
-- A notificação entra em user_notifications e o gatilho queue_notification_email
-- já existente a coloca na fila de e-mails (notification_email_outbox).
-- Contas antigas não recebem nada. É idempotente.

create or replace function public.notify_account_welcome() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  welcome_title constant text := 'Boas-vindas ao Mercado do Compositor';
begin
  if new.email_confirmed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.email_confirmed_at is not null then return new; end if;

  -- Uma única vez por conta, mesmo se a confirmação se repetir.
  if exists (
    select 1 from public.user_notifications
    where user_id = new.id and type = 'system' and title = welcome_title
  ) then return new; end if;

  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(
    new.id,
    welcome_title,
    E'Sua conta está ativa. Para começar a receber propostas de artistas:\n'
    || E'1. Complete seu perfil público com foto, apresentação e redes sociais.\n'
    || E'2. Cadastre suas músicas com a gravação completa e a letra.\n'
    || E'3. Compartilhe o link do seu perfil e de cada obra.\n'
    || 'Quando um artista pedir a liberação de uma música, você recebe o aviso por e-mail.',
    'system',
    false,
    '/dashboard/perfil'
  );
  return new;
end $$;
revoke execute on function public.notify_account_welcome() from public, anon, authenticated;

drop trigger if exists on_auth_user_welcome on auth.users;
create trigger on_auth_user_welcome
  after insert or update of email_confirmed_at on auth.users
  for each row execute function public.notify_account_welcome();

notify pgrst, 'reload schema';
