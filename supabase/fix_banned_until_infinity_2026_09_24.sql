-- ==============================================================================
-- Correção: banimento com data infinita quebrava o login
-- Execute DEPOIS de self_account_deletion_2026_09_24.sql.
--
-- A exclusão de conta gravava auth.users.banned_until = 'infinity'. O Supabase
-- Auth é escrito em Go e não converte 'infinity' para data: qualquer operação
-- que carregasse o usuário excluído falhava com "Scan error on column
-- banned_until", e quem tentava entrar ou criar conta de novo via esse erro.
-- O banimento passa a valer por 100 anos (o mesmo que um ban longo pelo Auth).
-- ==============================================================================

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
  --    Data finita: o Auth (Go) não lê 'infinity' e quebrava o login e o cadastro.
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

-- Contas já excluídas com a data infinita.
update auth.users set banned_until = now() + interval '100 years'
where banned_until = 'infinity';

notify pgrst, 'reload schema';
