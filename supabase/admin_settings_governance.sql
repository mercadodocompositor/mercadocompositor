-- Protege configurações, papéis administrativos e o fluxo LGPD.
-- Execute após admin_composers_management.sql. É idempotente.

-- Unifica o tipo usado pela função de auditoria nos schemas antigos e novos.
alter table public.system_logs alter column id type text using id::text;

-- A chave Pix master é um dado financeiro sensível: a tabela nunca é legível
-- nem gravável diretamente pelo cliente (mesmo por um admin) — toda leitura e
-- escrita passa pelas funções security definer abaixo, que reautenticam,
-- validam e auditam. Removemos aqui uma política antiga "for update
-- using(is_admin())" que permitia PATCH direto via PostgREST, ignorando essas
-- garantias; ela não deve ser recriada.
revoke select, update on table public.platform_settings from anon, authenticated;
drop policy if exists "settings public read" on public.platform_settings;
drop policy if exists "settings admin update" on public.platform_settings;

-- Preview seguro: preserva apenas os 4 últimos caracteres para conferência visual.
create or replace function public.mask_pix_key(p_key text)
returns text language sql immutable set search_path='' as $$
  select case
    when coalesce(btrim(p_key),'')='' then ''
    when length(btrim(p_key))<=4 then repeat('•',length(btrim(p_key)))
    else concat(repeat('•',least(length(btrim(p_key))-4,12)),right(btrim(p_key),4))
  end
$$;
revoke execute on function public.mask_pix_key(text) from public;
grant execute on function public.mask_pix_key(text) to anon,authenticated;

create or replace function public.get_platform_settings()
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.platform_settings%rowtype; admin boolean:=public.is_admin();
begin
  select * into strict s from public.platform_settings where id=true;
  return jsonb_build_object(
    'platformName',s.platform_name,'tagline',s.tagline,'planMonthlyPrice',s.plan_monthly_price,
    'planMaxSongs',s.plan_max_songs,'platformFeePercentage',s.platform_fee_percentage,
    'supportWhatsapp',s.support_whatsapp,'supportEmail',s.support_email,
    'pixKeyMasked',case when admin then public.mask_pix_key(s.pix_key) else '' end,
    'pixKeyConfigured',case when admin then coalesce(btrim(s.pix_key),'')<>'' else false end,
    'maintenanceMode',s.maintenance_mode,'systemAnnouncement',s.system_announcement,
    'requireApprovalForNewSongs',s.require_approval_for_new_songs,
    'termsVersion',s.terms_version,'updatedAt',s.updated_at);
end; $$;
revoke execute on function public.get_platform_settings() from public;
grant execute on function public.get_platform_settings() to anon,authenticated;

-- Exibição em texto claro é uma operação explícita, exige sessão reautenticada
-- há menos de 5 minutos e fica registrada na trilha de auditoria.
create or replace function public.admin_reveal_pix_key()
returns jsonb language plpgsql security definer set search_path='' as $$
declare k text; jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
  if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
    raise exception using errcode='42501',message='Reautenticação recente necessária para exibir a chave Pix master.';
  end if;
  select pix_key into strict k from public.platform_settings where id=true;
  perform public.write_system_audit_log(gen_random_uuid()::text,'financial','Chave Pix master exibida',
    'Um administrador solicitou a exibição em texto claro da chave Pix master de recebimento.','warning');
  return jsonb_build_object('pixKey',coalesce(k,''));
end; $$;
revoke execute on function public.admin_reveal_pix_key() from public,anon;
grant execute on function public.admin_reveal_pix_key() to authenticated;

create or replace function public.admin_update_platform_settings(p_settings jsonb,p_expected_updated_at timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare cur public.platform_settings%rowtype; changed timestamptz:=clock_timestamp(); fee numeric; max_songs integer;
  critical boolean; jwt_iat bigint; has_pix boolean; next_pix text;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  select * into cur from public.platform_settings where id=true for update;
  if not found then raise exception using errcode='P0002',message='Configuração da plataforma não encontrada.'; end if;
  if p_expected_updated_at is null or cur.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode='40001',message='As configurações foram alteradas em outra sessão. Recarregue antes de salvar.';
  end if;
  begin
    fee:=(p_settings->>'platformFeePercentage')::numeric; max_songs:=(p_settings->>'planMaxSongs')::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception using errcode='23514',message='Valores numéricos das configurações são inválidos.';
  end;
  -- A chave só muda quando enviada explicitamente; ausente significa "manter".
  -- Assim um salvamento comum (ou um reset) nunca apaga a chave em vigor.
  has_pix:=(p_settings ? 'pixKey') and jsonb_typeof(p_settings->'pixKey')='string';
  next_pix:=case when has_pix then btrim(p_settings->>'pixKey') else cur.pix_key end;
  if nullif(btrim(p_settings->>'platformName'),'') is null or fee not between 0 and 100 or max_songs<1
    or (p_settings->>'planMonthlyPrice')::numeric<0 or length(coalesce(p_settings->>'tagline',''))>300
    or length(coalesce(p_settings->>'systemAnnouncement',''))>1000 or length(coalesce(p_settings->>'supportEmail',''))>320
    or length(coalesce(p_settings->>'supportWhatsapp',''))>40 or length(coalesce(next_pix,''))>200
    or length(coalesce(p_settings->>'termsVersion',''))>40 then
    raise exception using errcode='23514',message='Configurações da plataforma inválidas.';
  end if;
  critical:=cur.pix_key is distinct from next_pix or cur.platform_fee_percentage is distinct from fee;
  if critical then
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then
      raise exception using errcode='42501',message='Reautenticação recente necessária para alterar Pix ou taxa.';
    end if;
  end if;
  update public.platform_settings set platform_name=btrim(p_settings->>'platformName'),tagline=coalesce(p_settings->>'tagline',''),
    plan_monthly_price=(p_settings->>'planMonthlyPrice')::numeric,plan_max_songs=max_songs,platform_fee_percentage=fee,
    support_whatsapp=coalesce(p_settings->>'supportWhatsapp',''),support_email=lower(btrim(coalesce(p_settings->>'supportEmail',''))),
    pix_key=coalesce(next_pix,''),maintenance_mode=coalesce((p_settings->>'maintenanceMode')::boolean,false),
    system_announcement=coalesce(p_settings->>'systemAnnouncement',''),
    require_approval_for_new_songs=coalesce((p_settings->>'requireApprovalForNewSongs')::boolean,true),
    terms_version=coalesce(nullif(btrim(p_settings->>'termsVersion'),''),cur.terms_version),updated_at=changed where id=true;
  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Configurações da plataforma atualizadas',
    concat('Alteração administrativa; campos financeiros críticos: ',critical::text),case when critical then 'warning' else 'info' end);
  return public.get_platform_settings();
end; $$;
revoke execute on function public.admin_update_platform_settings(jsonb,timestamptz) from public,anon;
grant execute on function public.admin_update_platform_settings(jsonb,timestamptz) to authenticated;

create or replace function public.admin_revoke_user_role(p_user_id uuid,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare n bigint; r text:=lower(btrim(p_role)); jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if r not in ('admin','moderator','financial') then raise exception using errcode='23514',message='Papel inválido.'; end if;
  perform pg_advisory_xact_lock(hashtext('admin-role-governance'));
  if r='admin' then
    if p_user_id=auth.uid() then raise exception using errcode='23514',message='Você não pode revogar seu próprio acesso administrativo.'; end if;
    select count(*) into n from public.user_roles where role='admin';
    if n<=1 then raise exception using errcode='23514',message='A plataforma deve manter pelo menos um administrador.'; end if;
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then raise exception using errcode='42501',message='Reautenticação recente necessária.'; end if;
  end if;
  delete from public.user_roles where user_id=p_user_id and role=r;
  if not found then raise exception using errcode='P0002',message='Papel não encontrado para este usuário.'; end if;
  perform public.write_system_audit_log(gen_random_uuid()::text,'auth','Papel administrativo revogado',concat('Papel ',r,' revogado do usuário ',p_user_id),'warning');
  return jsonb_build_object('success',true);
end; $$;
revoke execute on function public.admin_revoke_user_role(uuid,text) from public,anon;
grant execute on function public.admin_revoke_user_role(uuid,text) to authenticated;

create or replace function public.admin_assign_user_role(p_email text,p_role text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; r text:=lower(btrim(p_role)); jwt_iat bigint;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if r not in ('admin','moderator','financial') then raise exception using errcode='23514',message='Papel inválido.'; end if;
  if r='admin' then
    jwt_iat:=coalesce((auth.jwt()->>'iat')::bigint,0);
    if jwt_iat<extract(epoch from now()-interval '5 minutes')::bigint then raise exception using errcode='42501',message='Reautenticação recente necessária.'; end if;
  end if;
  select id into uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if uid is null then select user_id into uid from public.private_profiles where lower(email)=lower(btrim(p_email)) limit 1; end if;
  if uid is null then raise exception using errcode='P0002',message='Usuário não encontrado.'; end if;
  insert into public.user_roles(user_id,role) values(uid,r) on conflict do nothing;
  perform public.write_system_audit_log(gen_random_uuid()::text,'auth','Papel administrativo concedido',concat('Papel ',r,' concedido ao usuário ',uid),'warning');
  return jsonb_build_object('success',true,'userId',uid,'role',r);
end; $$;
revoke execute on function public.admin_assign_user_role(text,text) from public,anon;
grant execute on function public.admin_assign_user_role(text,text) to authenticated;

create or replace function public.admin_update_deletion_request(p_request_id uuid,p_status text,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  if not public.is_admin() then raise exception using errcode='42501',message='Acesso restrito a administradores.'; end if;
  if p_status not in ('em_analise','rejeitada') then
    raise exception using errcode='23514',message='A conclusão exige a rotina segura de eliminação e não pode ser apenas marcada manualmente.';
  end if;
  if length(coalesce(p_admin_notes,''))>2000 then raise exception using errcode='23514',message='Parecer administrativo muito longo.'; end if;
  update public.account_deletion_requests set status=p_status,admin_notes=nullif(btrim(p_admin_notes),''),
    resolved_at=case when p_status='rejeitada' then clock_timestamp() else null end,updated_at=clock_timestamp()
  where id=p_request_id and status in ('pendente','em_analise','rejeitada') returning to_jsonb(account_deletion_requests.*) into result;
  if result is null then raise exception using errcode='P0002',message='Solicitação não encontrada ou já concluída.'; end if;
  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Solicitação LGPD atualizada',concat('Solicitação ',p_request_id,' movida para ',p_status),'warning');
  return result;
end; $$;
revoke execute on function public.admin_update_deletion_request(uuid,text,text) from public,anon;
grant execute on function public.admin_update_deletion_request(uuid,text,text) to authenticated;
revoke update on table public.account_deletion_requests from authenticated;
-- Sem política de update: "concluida" não pode ser marcada por PATCH direto,
-- só pela rotina abaixo, que de fato elimina os dados.
drop policy if exists "deletion requests admin update" on public.account_deletion_requests;

-- Rotina que efetivamente cumpre a solicitação de exclusão (LGPD art. 18, VI).
-- Anonimiza em vez de dar DELETE no usuário porque todas as tabelas descem em
-- cascata de auth.users: apagar a linha destruiria junto o histórico financeiro
-- e os termos de liberação já assinados, que a plataforma e o contratante têm
-- obrigação/direito de reter (LGPD art. 16, I e art. 7º, VI). O que é dado
-- pessoal sem base de retenção é apagado; o que tem base é pseudonimizado.
create or replace function public.admin_finalize_account_deletion(p_request_id uuid,p_admin_notes text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare req public.account_deletion_requests%rowtype; uid uuid; tag text; result jsonb; jwt_iat bigint;
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
  uid:=req.user_id;

  -- Uma conta administrativa não é eliminada sem antes perder o papel: evita
  -- ficar sem administrador e força a decisão a passar pela trava de RBAC.
  if exists(select 1 from public.user_roles where user_id=uid and role='admin') then
    raise exception using errcode='23514',message='Revogue o papel de administrador desta conta antes de concluir a exclusão.';
  end if;

  tag:=substr(md5(uid::text),1,10);

  -- 1. Dados pessoais sem base de retenção: eliminação.
  delete from public.private_profiles where user_id=uid;   -- e-mail, whatsapp, CPF, chave Pix
  delete from public.song_drafts       where user_id=uid;
  delete from public.user_preferences  where user_id=uid;
  delete from public.user_notifications where user_id=uid;
  delete from public.user_roles        where user_id=uid;

  -- 2. Perfil público: pseudonimizado (a linha sustenta as FKs do histórico).
  update public.profiles set
    username=concat('usuario-removido-',tag), name='', stage_name='Usuário removido',
    city='', state='', bio='', experience_years='', genres='{}',
    instagram='', youtube='', website='', photo_url='', cover_photo_url='',
    society='', spotify='', is_verified=false, updated_at=clock_timestamp()
  where user_id=uid;

  -- 3. Obras saem do ar. Não são apagadas porque releases/interest_requests
  --    descem em cascata de songs e levariam os contratos junto.
  update public.songs set status='rejected', is_available_for_release=false,
    is_featured=false, updated_at=clock_timestamp()
  where composer_id=uid;

  -- 4. Credenciais invalidadas: sem e-mail utilizável, sem senha, banido.
  update auth.users set
    email=concat('removido-',tag,'@invalido.local'), phone=null,
    encrypted_password=concat('removido-',gen_random_uuid()::text),
    email_change='', phone_change='', raw_user_meta_data='{}'::jsonb,
    banned_until=now()+interval '100 years', updated_at=clock_timestamp()
  where id=uid;

  update public.account_deletion_requests set status='concluida',
    admin_notes=nullif(btrim(p_admin_notes),''), user_email=concat('removido-',tag,'@invalido.local'),
    user_name='Usuário removido', reason=null,
    resolved_at=clock_timestamp(), updated_at=clock_timestamp()
  where id=p_request_id returning to_jsonb(account_deletion_requests.*) into result;

  perform public.write_system_audit_log(gen_random_uuid()::text,'system','Exclusão de conta concluída (LGPD)',
    concat('Solicitação ',p_request_id,': dados pessoais eliminados e perfil pseudonimizado sob a marca ',tag,
           '. Termos de liberação e histórico financeiro retidos por obrigação legal.'),'warning');
  return result;
end; $$;
revoke execute on function public.admin_finalize_account_deletion(uuid,text) from public,anon;
grant execute on function public.admin_finalize_account_deletion(uuid,text) to authenticated;

notify pgrst,'reload schema';
