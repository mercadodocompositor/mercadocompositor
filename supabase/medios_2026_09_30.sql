-- ==============================================================================
-- Correção dos achados médios do diagnóstico de produção (2026-09-30)
-- Execute depois de fix_bloqueadores_2026_09_30.sql,
-- admin_suspension_2026_09_30.sql e public_abuse_and_telemetry_2026_09_30.sql,
-- e ANTES de verify_workflow_guarantees_2026_09_24.sql. É idempotente.
--
--   M1  Moderadores passam a enxergar as obras que moderam.
--   M3  O compositor recebe aviso (e e-mail) quando o cartão é recusado, quando
--       a assinatura é cancelada ou suspensa e quando a equipe suspende a conta.
--   M7  Quem não é da equipe só grava eventos de obras na trilha de auditoria:
--       um compositor não consegue mais registrar um "pagamento aprovado" falso.
--   M12 A lista pública de compositores aceita até 1.000 perfis por consulta.
--   M13 A versão dos termos passa a 1.3: o texto da Política mudou em 30/09 e
--       todos precisam aceitar de novo (a janela de aceite do painel pede).
--   M19 save_my_profile valida o endereço público (formato e nomes reservados)
--       e o tamanho dos campos no servidor, não só na tela.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- M1. LEITURA DE OBRAS PARA MODERADORES
-- ------------------------------------------------------------------------------
drop policy if exists "songs moderator read" on public.songs;
create policy "songs moderator read" on public.songs
  for select to authenticated
  using (exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'moderator'));

-- ------------------------------------------------------------------------------
-- M3. AVISOS DE COBRANÇA
-- ------------------------------------------------------------------------------
-- O texto de "Pagamento recusado" segue o padrão do template publicado no
-- Resend (supabase/functions/_shared/notification-templates.ts).
create or replace function public.notify_subscription_billing_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_price text := coalesce(nullif(new.monthly_price, ''), '0,00');
begin
  if new.stripe_subscription_status = 'past_due'
     and coalesce(old.stripe_subscription_status, '') in ('active', 'trialing') then
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (new.user_id, 'Pagamento recusado',
      format('Não conseguimos cobrar R$ %s da renovação do seu %s no cartão. O Stripe vai tentar de novo nos próximos dias; atualize o cartão em "Gerenciar cobrança" na aba Assinatura para não perder o acesso.',
        v_price, new.plan_name),
      'system', false, '/dashboard/assinatura');
  elsif new.stripe_subscription_status = 'unpaid'
     and coalesce(old.stripe_subscription_status, '') <> 'unpaid' then
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (new.user_id, 'Assinatura suspensa',
      format('As tentativas de cobrança do seu %s falharam e a assinatura foi suspensa. Seu perfil e suas obras saíram do catálogo público; atualize o cartão na aba Assinatura para voltar.', new.plan_name),
      'system', false, '/dashboard/assinatura');
  elsif new.stripe_subscription_status = 'canceled'
     and coalesce(old.stripe_subscription_status, '') in ('active', 'trialing', 'past_due', 'unpaid') then
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (new.user_id, 'Assinatura cancelada',
      format('Sua assinatura do %s foi encerrada. Seu perfil e suas obras saíram do catálogo público, mas continuam guardados no painel. Assine de novo na aba Assinatura quando quiser voltar.', new.plan_name),
      'system', false, '/dashboard/assinatura');
  end if;

  if new.admin_suspended_at is not null and old.admin_suspended_at is null then
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (new.user_id, 'Conta suspensa pela equipe',
      'Seu perfil e suas obras foram retirados do catálogo público pela equipe do Mercado do Compositor. Fale com o suporte para entender o motivo e regularizar.',
      'system', false, '/dashboard/assinatura');
  end if;
  return new;
end $$;
revoke execute on function public.notify_subscription_billing_change() from public, anon, authenticated;

drop trigger if exists notify_subscription_billing_change on public.subscriptions;
create trigger notify_subscription_billing_change
after update of stripe_subscription_status, admin_suspended_at on public.subscriptions
for each row execute function public.notify_subscription_billing_change();

-- ------------------------------------------------------------------------------
-- M7. TRILHA DE AUDITORIA
-- ------------------------------------------------------------------------------
create or replace function public.write_system_audit_log(
  p_id text, p_category text, p_title text, p_description text, p_status text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  actor_email text;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'Autenticação necessária.';
  end if;
  if p_category not in ('auth', 'financial', 'moderation', 'system')
     or p_status not in ('info', 'success', 'warning', 'error')
     or nullif(btrim(p_id), '') is null
     or nullif(btrim(p_title), '') is null
     or length(p_title) > 200
     or length(coalesce(p_description, '')) > 2000 then
    raise exception using errcode = '23514', message = 'Evento de auditoria inválido.';
  end if;
  -- Fora da equipe, só eventos das próprias obras (cadastro, exclusão, termo).
  if p_category <> 'moderation' and not exists (
    select 1 from public.user_roles where user_id = auth.uid() and role in ('admin', 'moderator', 'financial')
  ) then
    raise exception using errcode = '42501', message = 'Categoria de auditoria restrita à equipe.';
  end if;

  select email into actor_email from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (p_id, p_category, btrim(p_title), coalesce(p_description, ''), coalesce(actor_email, auth.uid()::text), p_status);
end;
$$;
revoke execute on function public.write_system_audit_log(text, text, text, text, text) from public, anon;
grant execute on function public.write_system_audit_log(text, text, text, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- M13. NOVA VERSÃO DOS TERMOS
-- ------------------------------------------------------------------------------
update public.platform_settings set terms_version = '1.3', updated_at = now()
where id = true and terms_version in ('1.0', '1.1', '1.2');

-- ------------------------------------------------------------------------------
-- M19. PERFIL VALIDADO NO SERVIDOR
-- ------------------------------------------------------------------------------
create or replace function public.save_my_profile(p_profile jsonb, p_private jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  uid uuid := auth.uid();
  v_username text := lower(btrim(coalesce(p_profile->>'username', '')));
  v_current text;
  v_reserved text[] := array[
    'admin','administrador','dashboard','login','cadastro','termos','privacidade',
    'autenticacao','validar-documento','validar','suporte','api','app','root','sistema',
    'oficial','mercadodocompositor','mercado-do-compositor','compositores','compositor',
    'recuperar-senha','entrega','equipe','contato'
  ];
begin
  if uid is null then
    raise exception using errcode = '42501', message = 'Sua sessão expirou. Entre novamente.';
  end if;

  select username::text into v_current from public.profiles where user_id = uid;
  -- Endereços antigos continuam valendo; a regra vale para quem troca.
  if v_username is distinct from lower(coalesce(v_current, '')) then
    if v_username !~ '^[a-z0-9]([a-z0-9-]{1,58}[a-z0-9])$' or v_username like '%--%' then
      raise exception using errcode = '23514',
        message = 'O endereço público deve ter de 3 a 60 caracteres, só letras minúsculas, números e hífens, sem hífen no início ou no fim.';
    end if;
    if v_username = any(v_reserved) then
      raise exception using errcode = '23514', message = 'Este endereço é reservado pelo sistema. Escolha outro identificador.';
    end if;
  end if;

  if length(coalesce(p_profile->>'name', '')) > 160
     or length(coalesce(p_profile->>'stageName', '')) > 120
     or length(coalesce(p_profile->>'city', '')) > 120
     or length(coalesce(p_profile->>'state', '')) > 60
     or length(coalesce(p_profile->>'bio', '')) > 600
     or length(coalesce(p_profile->>'experienceYears', '')) > 40
     or jsonb_array_length(coalesce(p_profile->'genres', '[]'::jsonb)) > 5
     or length(coalesce(p_profile->>'instagram', '')) > 200
     or length(coalesce(p_profile->>'youtube', '')) > 300
     or length(coalesce(p_profile->>'website', '')) > 300
     or length(coalesce(p_profile->>'spotify', '')) > 300
     or length(coalesce(p_profile->>'society', '')) > 120
     or length(coalesce(p_profile->>'photo', '')) > 1000
     or length(coalesce(p_profile->>'coverPhoto', '')) > 1000
     or length(coalesce(p_private->>'whatsapp', '')) > 40
     or length(coalesce(p_private->>'cpf', '')) > 20
     or length(coalesce(p_private->>'pixKey', '')) > 200 then
    raise exception using errcode = '23514', message = 'Algum campo do perfil passou do tamanho permitido. Revise os textos e tente de novo.';
  end if;

  update public.profiles set
    username = v_username,
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

-- ------------------------------------------------------------------------------
-- M12. LISTA PÚBLICA DE COMPOSITORES (mesma função de
-- featured_composers_2026_09_28.sql, com teto de 1.000 perfis)
-- ------------------------------------------------------------------------------
create or replace function public.get_public_composers(
  p_limit integer default 50,
  p_search text default null,
  p_genre text default null
) returns jsonb language sql stable security definer set search_path='' as $$
select coalesce(jsonb_agg(item order by featured desc, featured_rank desc, is_verified desc, views_count desc, created_at desc), '[]'::jsonb) from (
  select
    jsonb_build_object(
      'id', p.user_id,
      'username', p.username,
      'name', p.stage_name,
      'cityState', concat_ws(' - ', nullif(btrim(p.city), ''), nullif(btrim(p.state), '')),
      'genres', p.genres,
      'songCount', stats.song_count,
      'photo', p.photo_url,
      'bio', p.bio,
      'isVerified', p.is_verified,
      'featured', (p.is_featured or coalesce(plan.includes_featured, false)) and stats.song_count > 0,
      'featuredReason', case
        when stats.song_count = 0 then null
        when coalesce(plan.includes_featured, false) then 'plan'
        when p.is_featured then 'editorial'
      end
    ) as item,
    (p.is_featured or coalesce(plan.includes_featured, false)) and stats.song_count > 0 as featured,
    coalesce(p.featured_at, sub.updated_at, p.created_at) as featured_rank,
    p.is_verified, p.views_count, p.created_at
  from public.profiles p
  join public.subscriptions sub on sub.user_id = p.user_id
  left join public.subscription_plans plan on plan.name = sub.plan_name
  cross join lateral (
    select count(*)::int as song_count from public.songs s
    where s.composer_id = p.user_id and s.status = 'published'
  ) stats
  where sub.status = 'active'
    and (
      p_search is null or btrim(p_search) = '' or
      p.stage_name ilike '%' || btrim(p_search) || '%' or
      p.username ilike '%' || btrim(p_search) || '%' or
      p.city ilike '%' || btrim(p_search) || '%' or
      p.state ilike '%' || btrim(p_search) || '%' or
      p.bio ilike '%' || btrim(p_search) || '%'
    )
    and (
      p_genre is null or btrim(p_genre) = '' or
      p_genre = any(p.genres)
    )
  order by 2 desc, 3 desc, p.is_verified desc, p.views_count desc, p.created_at desc
  limit greatest(1, least(p_limit, 1000))
) q;
$$;
revoke execute on function public.get_public_composers(integer, text, text) from public;
grant execute on function public.get_public_composers(integer, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
