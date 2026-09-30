-- Garante que avisos de novas solicitações sejam enviados ao e-mail atual
-- da conta do compositor. Contas antigas podiam manter private_profiles.email
-- desatualizado e a fila priorizava esse valor em vez de auth.users.email.

-- Mantém o espelho privado consistente com a identidade autenticada.
update public.private_profiles pp
set email = lower(btrim(au.email))
from auth.users au
where au.id = pp.user_id
  and nullif(btrim(au.email), '') is not null
  and lower(btrim(coalesce(pp.email, ''))) is distinct from lower(btrim(au.email));

create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  prefs jsonb;
  destination text;
  should_send boolean := true;
begin
  -- auth.users.email é a fonte de verdade. O perfil privado fica somente como
  -- reserva para instalações legadas sem e-mail disponível no Auth.
  select
    coalesce(up.preferences, '{}'::jsonb),
    lower(btrim(coalesce(nullif(btrim(au.email), ''), nullif(btrim(pp.email), ''))))
  into prefs, destination
  from auth.users au
  left join public.private_profiles pp on pp.user_id = au.id
  left join public.user_preferences up on up.user_id = au.id
  where au.id = new.user_id;

  if destination is null or destination !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return new;
  end if;

  if new.type = 'request' then
    should_send := case prefs->>'emailNewRequest' when 'false' then false else true end;
  end if;
  if not should_send then return new; end if;

  insert into public.notification_email_outbox(
    notification_id, user_id, recipient, subject, body, action_url
  ) values (
    new.id, new.user_id, destination, new.title, new.message, new.link
  ) on conflict(notification_id) do nothing;

  return new;
end $$;

revoke execute on function public.queue_notification_email()
from public, anon, authenticated;

drop trigger if exists queue_notification_email on public.user_notifications;
create trigger queue_notification_email
after insert on public.user_notifications
for each row execute function public.queue_notification_email();

-- Recupera somente avisos recentes que não chegaram a entrar na fila. Não
-- duplica mensagens já enfileiradas e respeita a preferência do compositor.
insert into public.notification_email_outbox(
  notification_id, user_id, recipient, subject, body, action_url
)
select
  n.id,
  n.user_id,
  lower(btrim(coalesce(nullif(btrim(au.email), ''), nullif(btrim(pp.email), '')))),
  n.title,
  n.message,
  n.link
from public.user_notifications n
join auth.users au on au.id = n.user_id
left join public.private_profiles pp on pp.user_id = n.user_id
left join public.user_preferences up on up.user_id = n.user_id
where n.type = 'request'
  and n.created_at >= now() - interval '7 days'
  and coalesce(up.preferences->>'emailNewRequest', 'true') <> 'false'
  and coalesce(nullif(btrim(au.email), ''), nullif(btrim(pp.email), ''))
      ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  and not exists (
    select 1 from public.notification_email_outbox q
    where q.notification_id = n.id
  )
on conflict(notification_id) do nothing;

notify pgrst, 'reload schema';
