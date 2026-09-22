-- Fila transacional de e-mails gerada a partir das notificações internas.
-- WhatsApp não faz parte deste fluxo.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create table if not exists public.notification_email_outbox (
  id bigint generated always as identity primary key,
  notification_id uuid not null unique references public.user_notifications(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  recipient text not null,
  subject text not null,
  body text not null,
  action_url text,
  status text not null default 'pending' check(status in ('pending','processing','sent','retry','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notification_email_outbox_pending_idx
  on public.notification_email_outbox(status,next_attempt_at) where status in ('pending','retry');
alter table public.notification_email_outbox enable row level security;
revoke all on table public.notification_email_outbox from public, anon, authenticated;
grant all on table public.notification_email_outbox to service_role;

create or replace function public.queue_notification_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare
  prefs jsonb;
  destination text;
  should_send boolean := true;
begin
  select coalesce(up.preferences,'{}'::jsonb), lower(btrim(pp.email))
    into prefs,destination
  from public.private_profiles pp
  left join public.user_preferences up on up.user_id=pp.user_id
  where pp.user_id=new.user_id;

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

drop trigger if exists queue_notification_email on public.user_notifications;
create trigger queue_notification_email after insert on public.user_notifications
for each row execute function public.queue_notification_email();

create or replace function public.notify_release_issued() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  values(new.composer_id,'Termo de liberação emitido',format('O termo %s da obra "%s" foi emitido e está disponível para seu arquivo.',new.document_code,new.song_title),'release',false,'/dashboard/liberacoes');
  return new;
end $$;
revoke execute on function public.notify_release_issued() from public,anon,authenticated;
drop trigger if exists notify_release_issued on public.releases;
create trigger notify_release_issued after insert on public.releases
for each row execute function public.notify_release_issued();

create or replace function public.claim_notification_email_jobs(p_limit integer default 25) returns setof public.notification_email_outbox
language plpgsql security definer set search_path='' as $$
begin
  if auth.role() <> 'service_role' then raise exception using errcode='42501',message='Acesso negado.'; end if;
  update public.notification_email_outbox set status='retry',next_attempt_at=now(),updated_at=now(),last_error='Processamento anterior interrompido.'
  where status='processing' and updated_at < now()-interval '10 minutes' and attempts<5;
  update public.notification_email_outbox set status='failed',updated_at=now(),last_error=coalesce(last_error,'Limite de tentativas atingido.')
  where status in ('processing','retry') and attempts>=5;
  return query
  update public.notification_email_outbox q set status='processing',attempts=q.attempts+1,updated_at=now()
  where q.id in (
    select id from public.notification_email_outbox
    where status in ('pending','retry') and next_attempt_at<=now() and attempts<5
    order by created_at for update skip locked limit greatest(1,least(p_limit,100))
  ) returning q.*;
end $$;
revoke execute on function public.claim_notification_email_jobs(integer) from public,anon,authenticated;
grant execute on function public.claim_notification_email_jobs(integer) to service_role;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='user_notifications') then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
exception when undefined_object then
  raise notice 'Publicação supabase_realtime indisponível; habilite Realtime para user_notifications no painel.';
end $$;

-- O cron chama a Edge Function a cada minuto. Cadastre no Vault os secrets
-- notification_dispatch_url (URL completa da função) e notification_cron_secret.
do $$
declare dispatch_url text; cron_secret text;
begin
  if not exists(select 1 from information_schema.tables where table_schema='vault' and table_name='decrypted_secrets') then
    raise notice 'Vault indisponível; configure o agendamento manual da função process-notification-emails.'; return;
  end if;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''notification_dispatch_url''' into dispatch_url;
  execute 'select decrypted_secret from vault.decrypted_secrets where name=''notification_cron_secret''' into cron_secret;
  if coalesce(dispatch_url,'')='' or coalesce(cron_secret,'')='' then
    raise notice 'Secrets de notificação ausentes no Vault; o outbox está ativo, mas o cron não foi criado.'; return;
  end if;
  perform cron.unschedule(jobid) from cron.job where jobname='process-notification-emails';
  perform cron.schedule('process-notification-emails','* * * * *',format(
    $cmd$select net.http_post(url := %L, headers := jsonb_build_object('Authorization',%L,'Content-Type','application/json'), body := '{}'::jsonb);$cmd$,
    dispatch_url,'Bearer '||cron_secret));
end $$;

notify pgrst, 'reload schema';
