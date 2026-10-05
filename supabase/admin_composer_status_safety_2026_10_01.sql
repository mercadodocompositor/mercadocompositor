-- Execute após featured_composers_2026_09_28.sql e admin_suspension_2026_09_30.sql.
-- Uma atualização administrativa altera todas as contas ou nenhuma e registra
-- os estados anterior e novo na mesma transação.

create or replace function public.admin_set_composer_subscription_status(
  p_user_ids uuid[], p_status text
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  target public.subscriptions%rowtype;
  expected_count integer;
  found_count integer := 0;
  changed_count integer := 0;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão de assinaturas.';
  end if;
  if p_status is null or p_status not in ('active', 'pending', 'suspended', 'cancelled') then
    raise exception using errcode = '23514', message = 'Status inválido.';
  end if;
  expected_count := cardinality(p_user_ids);
  if expected_count is null or expected_count < 1 or expected_count > 50
     or exists (select 1 from unnest(p_user_ids) as selected(id) where id is null)
     or expected_count <> (select count(distinct id) from unnest(p_user_ids) as selected(id)) then
    raise exception using errcode = '23514', message = 'Selecione entre 1 e 50 contas distintas.';
  end if;

  for target in
    select * from public.subscriptions
    where user_id = any(p_user_ids)
    order by user_id for update
  loop
    found_count := found_count + 1;
    if not exists (select 1 from auth.users where id = target.user_id)
       or exists (
      select 1 from public.profiles p
      where p.user_id = target.user_id
        and p.username::text like 'usuario-removido-%'
    ) or exists (
      select 1 from auth.users u
      where u.id = target.user_id
        and u.email like 'removido-%@invalido.local'
    ) then
      raise exception using errcode = '23514', message = 'Uma conta removida não pode ter a assinatura alterada.';
    end if;
    if p_status = 'active' and (
      target.stripe_subscription_id is null
      or coalesce(target.stripe_subscription_status, '') not in ('active', 'trialing')
    ) then
      raise exception using errcode = '23514', message = 'Ativação exige assinatura ativa ou em teste no Stripe.';
    end if;
    if p_status = 'pending'
       and target.stripe_subscription_status in ('active', 'trialing') then
      raise exception using errcode = '23514', message = 'Suspenda a assinatura ativa em vez de marcá-la como pendente.';
    end if;
    if p_status = 'cancelled' and (
      target.stripe_subscription_id is not null
      or coalesce(target.stripe_subscription_status, '') <> ''
    ) and coalesce(target.stripe_subscription_status, '') not in ('canceled', 'incomplete_expired') then
      raise exception using errcode = '23514', message = 'Cancele a cobrança no Stripe antes de cancelar o status local.';
    end if;
    if target.status is distinct from p_status then
      update public.subscriptions
      set status = p_status, updated_at = clock_timestamp()
      where user_id = target.user_id;
      perform public.write_system_audit_log(
        gen_random_uuid()::text, 'financial', 'Status de assinatura alterado',
        format('Compositor %s: %s → %s.', target.user_id, target.status, p_status),
        'warning'
      );
      changed_count := changed_count + 1;
    end if;
  end loop;
  if found_count <> expected_count then
    raise exception using errcode = 'P0002', message = 'Uma ou mais assinaturas não foram encontradas.';
  end if;
  return changed_count;
end $$;

revoke execute on function public.admin_set_composer_subscription_status(uuid[], text) from public, anon;
grant execute on function public.admin_set_composer_subscription_status(uuid[], text) to authenticated;

create or replace function public.admin_set_profile_verified(p_user_id uuid, p_is_verified boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare old_value boolean;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão de compositores.';
  end if;
  if p_is_verified is null then
    raise exception using errcode = '23514', message = 'Valor de verificação inválido.';
  end if;
  select is_verified into old_value from public.profiles
  where user_id = p_user_id and username::text not like 'usuario-removido-%'
    and exists (
      select 1 from auth.users u where u.id = p_user_id
        and u.email not like 'removido-%@invalido.local'
    )
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Compositor não encontrado.';
  end if;
  if old_value is distinct from p_is_verified then
    update public.profiles set is_verified = p_is_verified, updated_at = clock_timestamp()
    where user_id = p_user_id;
    perform public.write_system_audit_log(
      gen_random_uuid()::text, 'moderation', 'Selo de verificação alterado',
      format('Compositor %s: verificado %s → %s.', p_user_id, old_value, p_is_verified),
      'warning'
    );
  end if;
end $$;

revoke execute on function public.admin_set_profile_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_profile_verified(uuid, boolean) to authenticated;

create or replace function public.admin_verify_composers(p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = '' as $$
declare target_id uuid; changed_count integer := 0; expected_count integer;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão de compositores.';
  end if;
  expected_count := cardinality(p_user_ids);
  if expected_count is null or expected_count < 1 or expected_count > 50
     or exists (select 1 from unnest(p_user_ids) as selected(id) where id is null)
     or expected_count <> (select count(distinct id) from unnest(p_user_ids) as selected(id)) then
    raise exception using errcode = '23514', message = 'Selecione entre 1 e 50 contas distintas.';
  end if;
  for target_id in select id from unnest(p_user_ids) as selected(id) order by id loop
    perform public.admin_set_profile_verified(target_id, true);
    changed_count := changed_count + 1;
  end loop;
  return changed_count;
end $$;

revoke execute on function public.admin_verify_composers(uuid[]) from public, anon;
grant execute on function public.admin_verify_composers(uuid[]) to authenticated;

-- Impede que o cliente contorne a validação e a auditoria da função acima.
revoke update on public.subscriptions from public, anon, authenticated;

create or replace function public.get_admin_composers()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.user_id,
    'username', p.username,
    'name', p.name,
    'stageName', p.stage_name,
    'email', coalesce(pp.email, u.email, ''),
    'whatsapp', coalesce(pp.whatsapp, ''),
    'cpf', coalesce(pp.cpf, ''),
    'cityState', concat_ws(' - ', nullif(p.city, ''), nullif(p.state, '')),
    'subscriptionStatus', coalesce(sub.status, 'pending'),
    'stripeSubscriptionId', sub.stripe_subscription_id,
    'stripeSubscriptionStatus', sub.stripe_subscription_status,
    'isOrphan', u.id is null,
    'planName', coalesce(sub.plan_name, ''),
    'monthlyValue', coalesce(nullif(replace(sub.monthly_price, ',', '.'), '')::numeric, 0),
    'registeredAt', p.created_at,
    'songCount', coalesce(song_stats.song_count, 0),
    'totalPlays', coalesce(song_stats.total_plays, 0),
    'totalReleases', coalesce(release_stats.release_count, 0),
    'revenueGenerated', coalesce(release_stats.total_value, 0),
    'photo', p.photo_url,
    'isVerified', p.is_verified,
    'isFeatured', p.is_featured,
    'planIncludesFeatured', coalesce(plan.includes_featured, false)
  ) order by p.created_at desc, p.user_id), '[]'::jsonb)
  into result
  from public.profiles p
  left join auth.users u on u.id = p.user_id
  left join public.private_profiles pp on pp.user_id = p.user_id
  left join public.subscriptions sub on sub.user_id = p.user_id
  left join public.subscription_plans plan on plan.name = sub.plan_name
  left join (
    select composer_id, count(*) as song_count, coalesce(sum(play_count), 0) as total_plays
    from public.songs group by composer_id
  ) song_stats on song_stats.composer_id = p.user_id
  left join (
    select composer_id, count(*) as release_count, coalesce(sum(agreed_value), 0) as total_value
    from public.releases group by composer_id
  ) release_stats on release_stats.composer_id = p.user_id;
  return result;
end $$;

revoke execute on function public.get_admin_composers() from public, anon;
grant execute on function public.get_admin_composers() to authenticated;
notify pgrst, 'reload schema';
