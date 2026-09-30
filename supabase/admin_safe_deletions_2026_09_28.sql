-- =============================================================================
-- Exclusões administrativas seguras: cadastros residuais e planos em uso.
-- Execute depois de admin_composers_management.sql e stripe_plans_and_invoices.
-- É idempotente.
-- =============================================================================

alter table public.subscription_plans
  add column if not exists archived_at timestamptz;

-- Um plano sem assinaturas é apagado. Se houver histórico, ele é arquivado e
-- retirado do catálogo, preservando a FK e os dados financeiros existentes.
create or replace function public.admin_remove_subscription_plan(p_plan_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_references bigint;
  v_actor text;
  v_action text;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Acesso restrito ao administrador master.';
  end if;

  if not exists (select 1 from public.subscription_plans where name = p_plan_name and archived_at is null) then
    raise exception using errcode = 'P0002', message = 'Plano não encontrado ou já arquivado.';
  end if;

  select count(*) into v_references
  from public.subscriptions
  where plan_name = p_plan_name;

  if v_references > 0 then
    update public.subscription_plans
    set is_active = false, archived_at = now(), updated_at = now()
    where name = p_plan_name;
    v_action := 'arquivado';
  else
    delete from public.subscription_plans where name = p_plan_name;
    v_action := 'excluído';
  end if;

  select email into v_actor from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (
    'plan-remove-' || gen_random_uuid()::text,
    'financial',
    'Plano removido do catálogo',
    format('O plano %s foi %s. Assinaturas vinculadas: %s.', p_plan_name, v_action, v_references),
    coalesce(v_actor, auth.uid()::text),
    'warning'
  );

  return v_action;
end;
$$;

revoke execute on function public.admin_remove_subscription_plan(text) from public, anon;
grant execute on function public.admin_remove_subscription_plan(text) to authenticated;

-- Limpa apenas perfis órfãos. Se auth.users ainda existir, o administrador deve
-- usar o fluxo formal de exclusão de conta/LGPD, evitando uma conta quebrada.
create or replace function public.admin_delete_orphan_composer(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_actor text;
begin
  if not exists (
    select 1 from public.user_roles
    where user_id = auth.uid() and role = 'admin'
  ) then
    raise exception using errcode = '42501', message = 'Acesso restrito ao administrador master.';
  end if;

  if exists (select 1 from auth.users where id = p_user_id) then
    raise exception using errcode = '23503', message = 'A conta de autenticação ainda existe. Use o fluxo formal de exclusão de conta.';
  end if;

  select coalesce(nullif(stage_name, ''), nullif(name, ''), username::text, 'Usuário removido')
  into v_name
  from public.profiles
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Cadastro residual não encontrado.';
  end if;

  -- As tabelas do domínio referenciam profiles com ON DELETE CASCADE.
  delete from public.profiles where user_id = p_user_id;

  select email into v_actor from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (
    'orphan-delete-' || gen_random_uuid()::text,
    'moderation',
    'Cadastro residual excluído',
    format('%s (%s) foi removido após a exclusão da conta de autenticação.', v_name, p_user_id),
    coalesce(v_actor, auth.uid()::text),
    'warning'
  );
end;
$$;

revoke execute on function public.admin_delete_orphan_composer(uuid) from public, anon;
grant execute on function public.admin_delete_orphan_composer(uuid) to authenticated;

notify pgrst, 'reload schema';
