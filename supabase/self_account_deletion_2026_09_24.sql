-- ==============================================================================
-- Autoexclusão de conta (LGPD)
-- Execute DEPOIS de notification_delivery_2026_09_22.sql,
-- buyer_copy_and_payment_failure_2026_09_22.sql e
-- account_deletion_notifications_2026_09_24.sql.
--
-- O titular passa a concluir a exclusão sozinho, pela Edge Function
-- delete-my-account (que cancela a assinatura no Stripe antes). A eliminação
-- continua sendo a mesma do admin: dados pessoais sem base de retenção são
-- apagados e o resto é pseudonimizado. Apagar a conta de verdade levaria em
-- cascata os termos de liberação dos intérpretes e o histórico financeiro.
--
--   1. perform_account_deletion(): a eliminação em si, usada pelo admin e pelo
--      titular. Recusa conta de administrador, assinatura do Stripe ainda viva
--      e pedido com pagamento confirmado sem termo emitido. Pedidos em aberto
--      são arquivados e os intérpretes avisados por e-mail.
--   2. admin_finalize_account_deletion(): mesmas travas de antes, agora
--      chamando perform_account_deletion().
--   3. delete_my_account(): autoexclusão pelo titular logado. Avisa os
--      administradores.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. FILA DE E-MAILS: AVISO DE PEDIDO ENCERRADO AO INTÉRPRETE
-- ------------------------------------------------------------------------------
alter table public.notification_email_outbox
  add column if not exists archived_request_id uuid references public.interest_requests(id) on delete cascade;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notification_email_outbox_archived_request_id_key') then
    alter table public.notification_email_outbox add constraint notification_email_outbox_archived_request_id_key unique (archived_request_id);
  end if;
end $$;
alter table public.notification_email_outbox drop constraint if exists notification_email_outbox_origin_check;
alter table public.notification_email_outbox add constraint notification_email_outbox_origin_check
  check (notification_id is not null or release_id is not null or archived_request_id is not null);

-- ------------------------------------------------------------------------------
-- 1. ELIMINAÇÃO (INTERNA)
-- ------------------------------------------------------------------------------
create or replace function public.perform_account_deletion(p_user_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare tag text; archived integer;
begin
  -- Uma conta administrativa não é eliminada sem antes perder o papel: evita
  -- ficar sem administrador e força a decisão a passar pela trava de RBAC.
  if exists(select 1 from public.user_roles where user_id=p_user_id and role='admin') then
    raise exception using errcode='23514',message='Revogue o papel de administrador desta conta antes de concluir a exclusão.';
  end if;
  -- A conta anonimizada continuaria sendo cobrada no cartão.
  if exists(select 1 from public.subscriptions where user_id=p_user_id
            and stripe_subscription_status in ('active','trialing','past_due','unpaid')) then
    raise exception using errcode='23514',message='Cancele a assinatura no Stripe antes de concluir a exclusão da conta.';
  end if;
  -- O intérprete já pagou e ainda não recebeu o termo: arquivar o pedido o
  -- deixaria sem o documento pelo qual pagou.
  if exists(select 1 from public.interest_requests where composer_id=p_user_id and status='pagamento_confirmado') then
    raise exception using errcode='23514',message='Há pedidos com pagamento confirmado aguardando o termo de liberação. Emita os termos antes de excluir a conta.';
  end if;

  tag:=substr(md5(p_user_id::text),1,10);

  -- 0. Negociações em aberto são encerradas e o intérprete, avisado.
  with closed as (
    update public.interest_requests set status='arquivada', archive_reason='Conta do compositor excluída',
      archived_at=clock_timestamp(), updated_at=clock_timestamp()
    where composer_id=p_user_id and status in ('nova','em_negociacao','pagamento_pendente')
    returning id, song_id, buyer_name, lower(btrim(buyer_email)) as buyer_email
  ), queued as (
    insert into public.notification_email_outbox(user_id,recipient,subject,body,action_url,audience,archived_request_id)
    select p_user_id, c.buyer_email,
      format('Pedido de liberação da obra "%s" encerrado', s.title),
      format('Olá, %s. O compositor da obra "%s" encerrou a conta no Mercado do Compositor, e por isso seu pedido de liberação foi encerrado sem emissão de termo. Se você chegou a fazer algum pagamento, trate o reembolso com o compositor pelos contatos que vocês usaram na negociação.',
        c.buyer_name, s.title),
      '/', 'buyer', c.id
    from closed c join public.songs s on s.id=c.song_id
    where c.buyer_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    on conflict (archived_request_id) do nothing
    returning 1
  )
  select count(*) into archived from closed;

  -- 1. Dados pessoais sem base de retenção: eliminação.
  delete from public.private_profiles where user_id=p_user_id;   -- e-mail, whatsapp, CPF, chave Pix
  delete from public.song_drafts       where user_id=p_user_id;
  delete from public.user_preferences  where user_id=p_user_id;
  delete from public.user_notifications where user_id=p_user_id;
  delete from public.user_roles        where user_id=p_user_id;

  -- 2. Perfil público: pseudonimizado (a linha sustenta as FKs do histórico).
  update public.profiles set
    username=concat('usuario-removido-',tag), name='', stage_name='Usuário removido',
    city='', state='', bio='', experience_years='', genres='{}',
    instagram='', youtube='', website='', photo_url='', cover_photo_url='',
    society='', spotify='', is_verified=false, updated_at=clock_timestamp()
  where user_id=p_user_id;

  -- 3. Obras saem do ar. Não são apagadas porque releases/interest_requests
  --    descem em cascata de songs e levariam os contratos junto.
  update public.songs set status='rejected', is_available_for_release=false,
    is_featured=false, updated_at=clock_timestamp()
  where composer_id=p_user_id;

  -- 4. Assinatura local encerrada (a do Stripe já foi cancelada, ver acima).
  update public.subscriptions set status='cancelled', updated_at=clock_timestamp() where user_id=p_user_id;

  -- 5. Credenciais invalidadas: sem e-mail utilizável, sem senha, banido.
  update auth.users set
    email=concat('removido-',tag,'@invalido.local'), phone=null,
    encrypted_password=concat('removido-',gen_random_uuid()::text),
    email_change='', phone_change='', raw_user_meta_data='{}'::jsonb,
    banned_until=now()+interval '100 years', updated_at=clock_timestamp()
  where id=p_user_id;
  -- O vínculo com o Google (e o de e-mail) guarda nome e e-mail e, se ficasse,
  -- um novo login com o mesmo Google cairia nesta conta banida em vez de criar
  -- outra. Sessões e tokens saem junto: o login atual deixa de valer.
  delete from auth.identities where user_id=p_user_id;
  delete from auth.mfa_factors where user_id=p_user_id;
  delete from auth.sessions where user_id=p_user_id;
  delete from auth.refresh_tokens where user_id=p_user_id::text;

  return jsonb_build_object('tag',tag,'archived_requests',archived);
end $$;
revoke execute on function public.perform_account_deletion(uuid) from public, anon, authenticated;

-- O aviso "Solicitação de exclusão de conta" (account_deletion_notifications)
-- traz nome e e-mail do titular. Concluída a exclusão, ele não pode continuar na
-- caixa dos admins nem na fila de e-mails (a linha da fila desce em cascata).
create or replace function public.forget_deletion_request_notices(p_request_id uuid) returns void
language sql security definer set search_path='' as $$
  delete from public.user_notifications
  where link = '/admin/configuracoes?lgpd=' || p_request_id and title = 'Solicitação de exclusão de conta';
$$;
revoke execute on function public.forget_deletion_request_notices(uuid) from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. CONCLUSÃO PELO ADMINISTRADOR
-- ------------------------------------------------------------------------------
create or replace function public.admin_finalize_account_deletion(p_request_id uuid,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req public.account_deletion_requests%rowtype; done jsonb; tag text; result jsonb; jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
    raise exception using errcode='42501',message='Reautenticação recente necessária para concluir uma exclusão de conta.';
  end if;
  if length(coalesce(p_admin_notes,''))>2000 then raise exception using errcode='23514',message='Parecer administrativo muito longo.'; end if;

  select * into req from public.account_deletion_requests where id=p_request_id for update;
  if not found then raise exception using errcode='P0002',message='Solicitação não encontrada.'; end if;
  if req.status='concluida' then raise exception using errcode='23514',message='Esta solicitação já foi concluída.'; end if;
  if req.status='rejeitada' then raise exception using errcode='23514',message='Uma solicitação rejeitada não pode ser concluída. Reabra-a antes.'; end if;

  done:=public.perform_account_deletion(req.user_id);
  tag:=done->>'tag';

  update public.account_deletion_requests set status='concluida',
    admin_notes=nullif(btrim(p_admin_notes),''), user_email=concat('removido-',tag,'@invalido.local'),
    user_name='Usuário removido', reason=null,
    resolved_at=clock_timestamp(), updated_at=clock_timestamp()
  where id=p_request_id returning to_jsonb(account_deletion_requests.*) into result;
  perform public.forget_deletion_request_notices(p_request_id);

  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Exclusão de conta concluída (LGPD)',
    concat('Solicitação ',p_request_id,': dados pessoais eliminados e perfil pseudonimizado sob a marca ',tag,
           '. ',done->>'archived_requests',' pedido(s) em aberto encerrado(s).',
           ' Termos de liberação e histórico financeiro retidos por obrigação legal.'),'warning');
  return result;
end; $$;
revoke execute on function public.admin_finalize_account_deletion(uuid,text) from public,anon;
grant execute on function public.admin_finalize_account_deletion(uuid,text) to authenticated;

-- ------------------------------------------------------------------------------
-- 3. AUTOEXCLUSÃO
-- ------------------------------------------------------------------------------
-- Chamada pela Edge Function delete-my-account com o JWT do próprio titular,
-- depois de cancelar a assinatura no Stripe. Não pede senha de novo: a
-- confirmação é digitar EXCLUIR na tela.
create or replace function public.delete_my_account() returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); done jsonb; tag text; req_id uuid;
begin
  if uid is null then raise exception using errcode='42501',message='Autenticação necessária.'; end if;

  -- Libera a anonimização do nome civil no guard_composer_identity (só nesta transação).
  perform set_config('app.account_deletion', 'on', true);
  done:=public.perform_account_deletion(uid);
  tag:=done->>'tag';

  -- O registro do pedido fica, sem dados pessoais, como prova do atendimento.
  update public.account_deletion_requests set status='concluida',
    admin_notes='Excluída pelo próprio titular.', user_email=concat('removido-',tag,'@invalido.local'),
    user_name='Usuário removido', reason=null, resolved_at=clock_timestamp(), updated_at=clock_timestamp()
  where user_id=uid and status in ('pendente','em_analise')
  returning id into req_id;
  if req_id is null then
    insert into public.account_deletion_requests(user_id,user_email,user_name,status,admin_notes,resolved_at)
    values(uid,concat('removido-',tag,'@invalido.local'),'Usuário removido','concluida','Excluída pelo próprio titular.',clock_timestamp())
    returning id into req_id;
  end if;

  perform public.forget_deletion_request_notices(req_id);

  -- Sem nome nem e-mail: o aviso fica guardado e não pode reter o que foi eliminado.
  insert into public.user_notifications(user_id,title,message,type,is_read,link)
  select distinct ur.user_id,
    'Conta excluída pelo titular',
    format('Um compositor excluiu a própria conta (marca %s). Os dados pessoais foram eliminados, as obras saíram do ar e %s pedido(s) em aberto foram encerrados com aviso aos intérpretes.',
      tag, done->>'archived_requests'),
    'system', false, '/admin/configuracoes?lgpd=' || req_id
  from public.user_roles ur where ur.role='admin';

  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Exclusão de conta pelo titular (LGPD)',
    concat('Solicitação ',req_id,': dados pessoais eliminados e perfil pseudonimizado sob a marca ',tag,
           '. ',done->>'archived_requests',' pedido(s) em aberto encerrado(s).',
           ' Termos de liberação e histórico financeiro retidos por obrigação legal.'),'warning');
  return jsonb_build_object('request_id',req_id,'tag',tag,'archived_requests',(done->>'archived_requests')::int);
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

notify pgrst, 'reload schema';
