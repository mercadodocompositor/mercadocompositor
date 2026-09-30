-- =============================================================================
-- MERCADO DO COMPOSITOR — PERFIL: SALVAMENTO ATÔMICO E E-MAIL VERIFICADO (2026-09-28)
-- =============================================================================
-- 1. save_my_profile: grava perfil público e dados privados numa única
--    transação. Antes eram dois updates paralelos pelo cliente; se um falhava
--    (ex.: CPF bloqueado, endereço já em uso) o outro ficava gravado.
-- 2. O e-mail de notificações passa a ser sempre o e-mail da conta (login),
--    que é verificado no cadastro. O compositor não o altera mais pelo perfil:
--    um erro de digitação cortava os avisos de pedidos sem ele perceber.
-- 3. admin_assign_user_role deixa de procurar o usuário pelo e-mail do perfil,
--    que era editável e não verificado.
-- É idempotente.

-- -----------------------------------------------------------------------------
-- 1. Salvamento atômico
-- -----------------------------------------------------------------------------
-- SECURITY INVOKER (padrão): RLS, permissões por coluna e os gatilhos
-- guard_composer_identity / validate_private_profile_pix continuam valendo.
create or replace function public.save_my_profile(p_profile jsonb, p_private jsonb)
returns void language plpgsql set search_path='' as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception using errcode='42501', message='Sua sessão expirou. Entre novamente.';
  end if;

  update public.profiles set
    username = btrim(coalesce(p_profile->>'username','')),
    name = btrim(coalesce(p_profile->>'name','')),
    stage_name = btrim(coalesce(p_profile->>'stageName','')),
    city = btrim(coalesce(p_profile->>'city','')),
    state = btrim(coalesce(p_profile->>'state','')),
    bio = btrim(coalesce(p_profile->>'bio','')),
    experience_years = btrim(coalesce(p_profile->>'experienceYears','')),
    genres = coalesce(array(select jsonb_array_elements_text(coalesce(p_profile->'genres','[]'::jsonb))), '{}'),
    instagram = coalesce(p_profile->>'instagram',''),
    youtube = coalesce(p_profile->>'youtube',''),
    website = coalesce(p_profile->>'website',''),
    photo_url = coalesce(p_profile->>'photo',''),
    cover_photo_url = coalesce(p_profile->>'coverPhoto',''),
    society = coalesce(p_profile->>'society',''),
    spotify = coalesce(p_profile->>'spotify',''),
    updated_at = now()
  where user_id = uid;
  if not found then
    raise exception using errcode='P0001', message='Não foi possível localizar sua conta para salvar o perfil. Saia e entre novamente; se persistir, fale com o suporte.';
  end if;

  update public.private_profiles set
    whatsapp = btrim(coalesce(p_private->>'whatsapp','')),
    cpf = btrim(coalesce(p_private->>'cpf','')),
    pix_key = coalesce(p_private->>'pixKey',''),
    pix_key_type = coalesce(nullif(p_private->>'pixKeyType',''),'cpf')
  where user_id = uid;
  if not found then
    raise exception using errcode='P0001', message='Não foi possível localizar sua conta para salvar os dados privados. Saia e entre novamente; se persistir, fale com o suporte.';
  end if;
end $$;
revoke execute on function public.save_my_profile(jsonb, jsonb) from public, anon;
grant execute on function public.save_my_profile(jsonb, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. E-mail de notificações = e-mail da conta
-- -----------------------------------------------------------------------------
-- O próprio titular não altera o e-mail privado; administradores e processos
-- internos (sincronização abaixo, exclusão de conta) continuam podendo.
create or replace function public.guard_private_profile_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is not distinct from new.user_id and not public.is_admin() then
    new.email := old.email;
  end if;
  return new;
end $$;
revoke execute on function public.guard_private_profile_email() from public, anon, authenticated;
drop trigger if exists guard_private_profile_email on public.private_profiles;
create trigger guard_private_profile_email before update of email on public.private_profiles
  for each row execute function public.guard_private_profile_email();

-- Quando o e-mail da conta muda (confirmação feita pelo Supabase Auth), o e-mail
-- de notificações acompanha.
create or replace function public.sync_private_profile_email() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.email is distinct from old.email and new.email is not null then
    update public.private_profiles set email = new.email where user_id = new.id;
  end if;
  return new;
end $$;
revoke execute on function public.sync_private_profile_email() from public, anon, authenticated;
drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function public.sync_private_profile_email();

-- -----------------------------------------------------------------------------
-- 3. Papel administrativo só pelo e-mail verificado da conta
-- -----------------------------------------------------------------------------
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
  -- Só o e-mail da conta (verificado). O e-mail do perfil é editável e não
  -- serve para identificar quem recebe um papel administrativo.
  select id into uid from auth.users where lower(email)=lower(btrim(p_email)) limit 1;
  if uid is null then raise exception using errcode='P0002',message='Usuário não encontrado.'; end if;
  insert into public.user_roles(user_id,role) values(uid,r) on conflict do nothing;
  perform public.write_system_audit_log(gen_random_uuid()::text,'auth','Papel administrativo concedido',concat('Papel ',r,' concedido ao usuário ',uid),'warning');
  return jsonb_build_object('success',true,'userId',uid,'role',r);
end; $$;
revoke execute on function public.admin_assign_user_role(text,text) from public,anon;
grant execute on function public.admin_assign_user_role(text,text) to authenticated;

notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- Conferência: contas cujo e-mail de notificações difere do e-mail de login.
-- Elas continuam recebendo avisos no e-mail do perfil até alguém sincronizar.
-- select u.id, u.email as login, pp.email as notificacoes
-- from auth.users u join public.private_profiles pp on pp.user_id = u.id
-- where lower(u.email) is distinct from lower(pp.email);
--
-- Sincronização opcional (revise a lista acima antes):
-- update public.private_profiles pp set email = u.email
-- from auth.users u where u.id = pp.user_id and lower(u.email) is distinct from lower(pp.email);
