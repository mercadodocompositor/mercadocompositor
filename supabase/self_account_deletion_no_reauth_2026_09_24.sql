-- ==============================================================================
-- Autoexclusão sem pedir a senha de novo
-- Execute DEPOIS de self_account_deletion_2026_09_24.sql.
--
-- delete_my_account() exigia sessão com menos de 5 minutos (senha redigitada).
-- A tela deixou de pedir a senha, então a checagem sai também daqui; sem isso,
-- quem entrou há mais de 5 minutos receberia erro ao excluir a conta.
-- ==============================================================================

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
