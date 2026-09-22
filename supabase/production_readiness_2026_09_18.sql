-- ==============================================================================
-- MERCADO DO COMPOSITOR — PREPARAÇÃO PARA PRODUÇÃO (2026-09-18)
-- ==============================================================================
-- Execute este script INTEIRO no SQL Editor do Supabase, DEPOIS de:
--   1. update_all_migrations.sql
--   2. fix_auditoria_2026_09.sql
-- É idempotente: pode rodar várias vezes.
--
-- Resolve:
--   1. Assinatura paga uma vez ficava ativa para sempre. O Checkout Pro é um
--      pagamento avulso: o webhook grava next_billing_date = hoje + 30 dias,
--      mas nada suspendia a conta quando a data passava.
--   2. A policy "media owner delete" deixava o compositor apagar os PDFs de
--      termos de liberação já emitidos (release-documents/<uid>/...), que são
--      documentos imutáveis.
--   3. A policy "media owner update" não filtrava bucket: um arquivo enviado à
--      quarentena podia ser movido direto para um bucket público sem passar
--      pela validação da Edge Function validate-media-upload.
--   4. system_logs.id não tinha default em bancos criados pelo script
--      consolidado. process_mercadopago_payment grava log sem id: o insert
--      falhava e derrubava a transação inteira do pagamento aprovado.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. system_logs.id com default (pré-requisito do webhook de pagamento)
-- ------------------------------------------------------------------------------
alter table public.system_logs alter column id set default gen_random_uuid()::text;

-- ------------------------------------------------------------------------------
-- 1. STORAGE: UPDATE só na quarentena, DELETE nunca em release-documents
-- ------------------------------------------------------------------------------
drop policy if exists "media owner update" on storage.objects;
create policy "media owner update" on storage.objects
for update to authenticated
using (bucket_id = 'media-quarantine' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'media-quarantine' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects
for delete to authenticated
using (
  bucket_id in ('profile-media', 'song-covers', 'song-previews', 'song-originals')
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- ------------------------------------------------------------------------------
-- 2. EXPIRAÇÃO DE ASSINATURAS VENCIDAS
-- ------------------------------------------------------------------------------
-- Vencida há mais de p_grace_days dias: volta para 'pending' (perfil e obras
-- saem do catálogo público, painel continua acessível e o compositor paga de
-- novo pela tela de assinatura). Assinaturas sem next_billing_date — cortesia
-- ou ativação manual pelo admin — não expiram.
-- Também avisa quem vence em 3 dias. Rode uma vez por dia (ver agendamento).
create or replace function public.expire_overdue_subscriptions(p_grace_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
begin
  with expired as (
    update public.subscriptions
    set status = 'pending', updated_at = now()
    where status = 'active'
      and next_billing_date is not null
      and next_billing_date + greatest(0, p_grace_days) < current_date
    returning user_id, plan_name, next_billing_date
  ), notified as (
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    select
      user_id,
      'Assinatura vencida',
      format('Seu %s venceu em %s. Seu perfil e suas obras saíram do catálogo público até a renovação.',
        plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
      'system',
      false,
      '/dashboard/assinatura'
    from expired
    returning 1
  )
  select count(*) into v_expired from notified;

  -- Aviso prévio: executada uma vez por dia, cada assinatura recebe um aviso.
  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  select
    user_id,
    'Sua assinatura vence em breve',
    format('Seu %s vence em %s. Renove pela tela de assinatura para manter seu catálogo público.',
      plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
    'system',
    false,
    '/dashboard/assinatura'
  from public.subscriptions
  where status = 'active'
    and next_billing_date = current_date + 3;

  if v_expired > 0 then
    insert into public.system_logs(category, title, description, actor, status)
    values ('financial', 'Assinaturas vencidas expiradas',
      format('%s assinatura(s) vencida(s) há mais de %s dia(s) voltaram para pendente.', v_expired, p_grace_days),
      'sistema', 'warning');
  end if;

  return v_expired;
end;
$$;

revoke execute on function public.expire_overdue_subscriptions(integer) from public, anon, authenticated;

-- Agendamento diário às 03:15 UTC (00:15 em Brasília) com pg_cron.
-- Se a extensão não puder ser criada por aqui, ative em
-- Supabase > Integrations > Cron e rode este bloco de novo.
do $$
begin
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'pg_cron indisponível (%). Ative em Integrations > Cron e execute este script de novo.', sqlerrm;
    return;
  end;

  perform cron.unschedule(jobid) from cron.job where jobname = 'expire-overdue-subscriptions';
  perform cron.schedule(
    'expire-overdue-subscriptions',
    '15 3 * * *',
    'select public.expire_overdue_subscriptions();'
  );
end $$;

notify pgrst, 'reload schema';

-- ==============================================================================
-- FIM. Para conferir:
--   select jobname, schedule, active from cron.job;
--   select public.expire_overdue_subscriptions();   -- execução manual
-- ==============================================================================
