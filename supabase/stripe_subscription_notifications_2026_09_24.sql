-- ==============================================================================
-- Avisos de nova assinatura (Stripe)
-- Execute DEPOIS de notification_delivery_2026_09_22.sql e
-- stripe_integration_2026_09_23.sql.
--
-- O aviso "Assinatura ativada" nascia em process_mercadopago_payment, removida
-- na troca para o Stripe. O stripe-webhook só atualiza subscriptions, então a
-- assinatura era ativada sem nenhuma notificação: nem o compositor nem a
-- administração recebiam e-mail.
--
--   1. Quando uma assinatura do Stripe passa a valer, o compositor recebe
--      "Assinatura ativada" e cada admin/financeiro recebe "Nova assinatura".
--      Os dois viram e-mail pela fila já existente (queue_notification_email).
--   2. A fila de e-mails usa o e-mail de login quando private_profiles não tem
--      e-mail: contas só administrativas não têm perfil de compositor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. NOVA ASSINATURA
-- ------------------------------------------------------------------------------
-- O gatilho olha o status do Stripe, não subscriptions.status: um período de
-- teste local também deixa status='active' e esconderia a ativação.
-- Só avisa na passagem para active/trialing de uma assinatura nova ou que ainda
-- não valia (incomplete). past_due -> active é cobrança recuperada, e
-- trialing -> active é o fim do teste; nenhum dos dois é assinatura nova.
-- Reentrega do mesmo evento não repete o aviso: o status já está gravado.
create or replace function public.notify_stripe_subscription_started() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  v_name text;
  v_is_trial boolean := new.stripe_subscription_status = 'trialing';
  v_price text := coalesce(nullif(new.monthly_price, ''), '0,00');
begin
  select coalesce(nullif(btrim(p.stage_name), ''), nullif(btrim(p.name), ''), 'Compositor')
    into v_name
  from public.profiles p where p.user_id = new.user_id;
  v_name := coalesce(v_name, 'Compositor');

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (
    new.user_id,
    'Assinatura ativada',
    case when v_is_trial and new.trial_ends_at is not null
      then format('Seu %s está ativo em período de teste até %s. O catálogo e os recursos do plano já estão liberados; a primeira cobrança de R$ %s será feita no cartão ao fim do teste.',
        new.plan_name, to_char(new.trial_ends_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), v_price)
      else format('Sua assinatura do %s (R$ %s por mês) foi confirmada. O catálogo e os recursos do plano já estão liberados%s.',
        new.plan_name, v_price,
        case when new.next_billing_date is null then ''
          else '; a próxima cobrança será em ' || to_char(new.next_billing_date, 'DD/MM/YYYY') end)
    end,
    'system',
    false,
    '/dashboard/assinatura'
  );

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  select distinct ur.user_id,
    'Nova assinatura',
    format('%s assinou o %s (R$ %s por mês)%s.',
      v_name, new.plan_name, v_price,
      case when v_is_trial then ', em período de teste' else '' end),
    'system',
    false,
    '/admin/compositores'
  from public.user_roles ur
  where ur.role in ('admin', 'financial');

  insert into public.system_logs(category, title, description, actor, status)
  values ('financial', format('Nova assinatura Stripe (%s)', new.plan_name),
    format('%s assinou o %s (R$ %s). Assinatura Stripe %s com status %s.',
      v_name, new.plan_name, v_price, new.stripe_subscription_id, new.stripe_subscription_status),
    new.user_id::text, 'success');

  return new;
end $$;
revoke execute on function public.notify_stripe_subscription_started() from public, anon, authenticated;

drop trigger if exists notify_stripe_subscription_started on public.subscriptions;
create trigger notify_stripe_subscription_started
after update of stripe_subscription_status, stripe_subscription_id on public.subscriptions
for each row
when (
  new.stripe_subscription_status in ('active', 'trialing')
  and (
    old.stripe_subscription_id is distinct from new.stripe_subscription_id
    or coalesce(old.stripe_subscription_status, '') not in ('active', 'trialing', 'past_due')
  )
)
execute function public.notify_stripe_subscription_started();

-- ------------------------------------------------------------------------------
-- 2. FILA DE E-MAILS: E-MAIL DE LOGIN COMO RESERVA
-- ------------------------------------------------------------------------------
-- Mesma função de notification_delivery_2026_09_22.sql. Antes, sem linha em
-- private_profiles (caso do dono que só administra), o e-mail era descartado.
create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  prefs jsonb;
  destination text;
  should_send boolean := true;
begin
  select coalesce(up.preferences,'{}'::jsonb), lower(btrim(coalesce(nullif(btrim(pp.email),''), au.email)))
    into prefs,destination
  from auth.users au
  left join public.private_profiles pp on pp.user_id=au.id
  left join public.user_preferences up on up.user_id=au.id
  where au.id=new.user_id;

  if destination is null or destination !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return new; end if;
  if new.type='request' then
    should_send := case prefs->>'emailNewRequest' when 'false' then false else true end;
  end if;
  if not should_send then return new; end if;

  insert into public.notification_email_outbox(notification_id,user_id,recipient,subject,body,action_url)
  values(new.id,new.user_id,destination,new.title,new.message,new.link)
  on conflict(notification_id) do nothing;
  return new;
end $$;
revoke execute on function public.queue_notification_email() from public,anon,authenticated;

notify pgrst, 'reload schema';
