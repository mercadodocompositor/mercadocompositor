-- ==============================================================================
-- Avisos de solicitação de exclusão de conta (LGPD)
-- Execute DEPOIS de notification_delivery_2026_09_22.sql.
--
-- A exclusão não é imediata: o titular registra o pedido e um administrador o
-- conclui em Admin > Configurações > LGPD (admin_finalize_account_deletion).
-- Nada avisava a administração, então o pedido ficava pendente sem ninguém
-- saber, e a tela prometia retorno em até 48 horas.
--
--   1. Cada admin recebe "Solicitação de exclusão de conta" (e-mail pela fila).
--   2. O titular recebe a confirmação do pedido por e-mail.
--   3. Pedidos já pendentes geram o aviso aos admins uma única vez.
-- ==============================================================================

-- O id da solicitação vai no link: o painel ignora a query string, e ela serve
-- para não repetir o aviso quando este script é executado de novo.
create or replace function public.notify_admins_of_deletion_request(p_request public.account_deletion_requests)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_link text := '/admin/configuracoes?lgpd=' || p_request.id;
begin
  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  select distinct ur.user_id,
    'Solicitação de exclusão de conta',
    format('%s (%s) pediu a exclusão da conta em %s. O titular foi informado de que receberá retorno por e-mail em até 48 horas. Conclua ou responda na aba LGPD das configurações do painel administrativo.',
      coalesce(nullif(btrim(p_request.user_name), ''), 'Um compositor'),
      p_request.user_email,
      to_char(p_request.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')),
    'system',
    false,
    v_link
  from public.user_roles ur
  where ur.role = 'admin'
    and not exists (
      select 1 from public.user_notifications n
      where n.user_id = ur.user_id and n.link = v_link
    );
end $$;
revoke execute on function public.notify_admins_of_deletion_request(public.account_deletion_requests) from public, anon, authenticated;

create or replace function public.notify_account_deletion_requested() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.notify_admins_of_deletion_request(new);

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (
    new.user_id,
    'Recebemos seu pedido de exclusão de conta',
    'Seu pedido de exclusão foi registrado e será analisado pela nossa equipe. Enviaremos o andamento por e-mail em até 48 horas. Até a conclusão, sua conta continua ativa.',
    'system',
    false,
    '/dashboard/configuracoes'
  );
  return new;
end $$;
revoke execute on function public.notify_account_deletion_requested() from public, anon, authenticated;

-- Só pedidos que aguardam análise: a autoexclusão (delete_my_account) grava a
-- solicitação já concluída e não deve prometer retorno em 48 horas.
drop trigger if exists notify_account_deletion_requested on public.account_deletion_requests;
create trigger notify_account_deletion_requested
after insert on public.account_deletion_requests
for each row when (new.status = 'pendente')
execute function public.notify_account_deletion_requested();

-- Pedidos que ficaram pendentes antes deste gatilho.
select public.notify_admins_of_deletion_request(r)
from public.account_deletion_requests r
where r.status in ('pendente', 'em_analise');

notify pgrst, 'reload schema';
