-- ==============================================================================
-- Correção: "Excluir minha conta" falhava para quem já emitiu termo
-- Execute DEPOIS de self_account_deletion_no_reauth_2026_09_24.sql. É idempotente.
--
-- guard_composer_identity impede o compositor de trocar sozinho o nome civil
-- depois do primeiro termo. A autoexclusão roda com o login do próprio titular
-- e anonimiza o nome, então era recusada com "O nome civil não pode ser
-- alterado...". delete_my_account passa a sinalizar a exclusão só dentro da
-- transação (set_config local), e o guard deixa a anonimização passar.
-- O mesmo vale para enforce_song_write_rules, que só deixava administradores
-- tirarem obras do ar ('rejected').
-- O usuário não consegue ligar esse sinal: pela API ele só chama funções.
-- ==============================================================================

create or replace function public.guard_composer_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- A exclusão da conta (delete_my_account) anonimiza o nome com o login do
  -- próprio titular; ela sinaliza isso só dentro da transação.
  if auth.uid() is distinct from new.user_id or public.is_admin()
     or current_setting('app.account_deletion', true) = 'on' then
    return new;
  end if;
  if not exists(select 1 from public.releases r where r.composer_id = new.user_id) then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    if btrim(coalesce(new.name,'')) is distinct from btrim(coalesce(old.name,'')) then
      raise exception using errcode='23514',
        message='O nome civil não pode ser alterado porque já existem termos de liberação emitidos com ele. Fale com o suporte para corrigir.';
    end if;
  elsif regexp_replace(coalesce(new.cpf,''),'[^0-9]','','g') is distinct from regexp_replace(coalesce(old.cpf,''),'[^0-9]','','g') then
    raise exception using errcode='23514',
      message='O CPF não pode ser alterado porque já existem termos de liberação emitidos com ele. Fale com o suporte para corrigir.';
  end if;
  return new;
end $$;
revoke execute on function public.guard_composer_identity() from public, anon, authenticated;

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

-- Mesma liberação para tirar as obras do ar: só administradores podem marcar
-- uma música como 'rejected', e a exclusão roda com o login do titular.
create or replace function public.enforce_song_write_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_songs integer;
  plan_found boolean := false;
  current_song_count bigint;
  approval_required boolean;
  admin_actor boolean;
begin
  -- A exclusão da conta tira as obras do ar (status 'rejected') com o login do titular.
  admin_actor := public.is_admin() or current_setting('app.account_deletion', true) = 'on';

  select sp.max_songs, true
    into max_songs, plan_found
    from public.subscriptions sub
    join public.subscription_plans sp on sp.name = sub.plan_name
    where sub.user_id = new.composer_id;

  if not coalesce(plan_found, false) then
    raise exception using errcode = '23514', message = 'A conta não possui um plano de assinatura válido.';
  end if;

  select require_approval_for_new_songs
    into approval_required
    from public.platform_settings
    where id = true;

  approval_required := coalesce(approval_required, true);

  if tg_op = 'INSERT' then
    perform 1
      from public.profiles
      where user_id = new.composer_id
      for update;

    select count(*)
      into current_song_count
      from public.songs
      where composer_id = new.composer_id;

    if max_songs is not null and current_song_count >= max_songs then
      raise exception using
        errcode = 'P0001',
        message = format('Limite de %s músicas atingido para esta conta.', max_songs),
        hint = 'Remova uma música sem histórico ou solicite a ampliação do plano.';
    end if;
  end if;

  if nullif(btrim(new.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe ao menos um título provisório para salvar o rascunho.';
  end if;

  if new.date_composed > current_date then
    raise exception using errcode = '23514', message = 'A data da composição não pode estar no futuro.';
  end if;

  new.authors := coalesce(new.authors, '');
  new.lyrics := coalesce(new.lyrics, '');
  new.cover_url := coalesce(new.cover_url, '');

  if new.value_type = 'suggested' then
    if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0) then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value is not null and new.suggested_value <= 0 then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value > 10000000 then
      raise exception using errcode = '23514', message = 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.';
    end if;
  end if;

  if not admin_actor then
    if new.status = 'rejected' then
      raise exception using errcode = '42501', message = 'Somente administradores podem rejeitar músicas.';
    end if;

    if approval_required
       and new.status = 'published'
       and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception using
        errcode = '42501',
        message = 'Esta música precisa ser enviada para aprovação antes da publicação.',
        hint = 'Use o status pending_approval.';
    end if;

    if approval_required
       and tg_op = 'UPDATE'
       and old.status = 'published'
       and new.status = 'published'
       and (
         new.title, new.genre, new.subgenre, new.authors, new.date_composed,
         new.lyrics, new.cover_url, new.registry_code, new.value_type,
         new.suggested_value, new.summary, new.original_audio_path,
         new.preview_audio_url
       ) is distinct from (
         old.title, old.genre, old.subgenre, old.authors, old.date_composed,
         old.lyrics, old.cover_url, old.registry_code, old.value_type,
         old.suggested_value, old.summary, old.original_audio_path,
         old.preview_audio_url
       ) then
      raise exception using
        errcode = '42501',
        message = 'Alterações em uma música publicada exigem nova aprovação.',
        hint = 'Salve a alteração com o status pending_approval.';
    end if;

    if not approval_required and new.status = 'pending_approval' then
      raise exception using
        errcode = '23514',
        message = 'A moderação prévia está desativada; publique a música diretamente.';
    end if;
  end if;

  if new.status in ('published', 'pending_approval') then
    if nullif(btrim(new.title), '') is null
       or nullif(btrim(new.authors), '') is null
       or nullif(btrim(new.lyrics), '') is null
       or nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
      raise exception using
        errcode = '23514',
        message = 'Para publicar, informe título, autores, letra e uma prévia pública de até 60 segundos.';
    end if;

    if not exists (
      select 1
      from public.subscriptions
      where user_id = new.composer_id
        and status = 'active'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Somente contas com assinatura ativa podem publicar músicas. Ative sua assinatura na página Assinatura.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_write_rules on public.songs;
create trigger enforce_song_write_rules
before insert or update on public.songs
for each row execute function public.enforce_song_write_rules();

revoke execute on function public.enforce_song_write_rules() from public, anon, authenticated;

notify pgrst, 'reload schema';
