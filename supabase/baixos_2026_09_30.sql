-- ==============================================================================
-- Correção dos achados baixos do diagnóstico de produção (2026-09-30)
-- Execute depois de medios_2026_09_30.sql e ANTES de
-- verify_workflow_guarantees_2026_09_24.sql. É idempotente.
--
--   L6  check_plan_capacity só responde sobre a própria conta (ou para a
--       equipe): antes revelava plano e quantidade de músicas de qualquer id.
--   L9  O usuário não insere mais notificações para si mesmo. Cada notificação
--       vira e-mail, e o insert direto permitia disparar mensagens de conteúdo
--       livre pela plataforma. As notificações legítimas nascem em gatilhos e
--       funções do banco (security definer), que não passam por esta policy.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- L6. CAPACIDADE DO PLANO
-- ------------------------------------------------------------------------------
create or replace function public.check_plan_capacity(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
  current_plan_name text;
  plan_limit integer;
  song_count bigint;
begin
  target_user_id := coalesce(p_user_id, auth.uid());
  if target_user_id is null then
    return jsonb_build_object('canAddSong', false, 'error', 'unauthorized');
  end if;
  if target_user_id is distinct from auth.uid() and not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Consulta permitida apenas para a própria conta.';
  end if;

  select sub.plan_name into current_plan_name
  from public.subscriptions sub
  where sub.user_id = target_user_id;

  select sp.max_songs into plan_limit
  from public.subscription_plans sp
  where sp.name = current_plan_name;

  if not found then
    select plan_max_songs into plan_limit
    from public.platform_settings
    where id = true;
  end if;

  select count(*) into song_count
  from public.songs
  where composer_id = target_user_id;

  return jsonb_build_object(
    'canAddSong', (plan_limit is null or song_count < plan_limit),
    'currentSongCount', song_count,
    'maxSongs', plan_limit,
    'remainingSongs', case when plan_limit is null then null else greatest(0, plan_limit - song_count) end,
    'planName', coalesce(current_plan_name, 'Plano Padrão'),
    'isUnlimited', (plan_limit is null)
  );
end;
$$;

revoke execute on function public.check_plan_capacity(uuid) from public, anon;
grant execute on function public.check_plan_capacity(uuid) to authenticated;

-- ------------------------------------------------------------------------------
-- L9. NOTIFICAÇÕES: LEITURA E "MARCAR COMO LIDA", SEM INSERT DIRETO
-- ------------------------------------------------------------------------------
drop policy if exists "notifications owner all" on public.user_notifications;
drop policy if exists "notifications owner read" on public.user_notifications;
drop policy if exists "notifications owner update" on public.user_notifications;
drop policy if exists "notifications owner delete" on public.user_notifications;
create policy "notifications owner read" on public.user_notifications
  for select using (auth.uid() = user_id);
create policy "notifications owner update" on public.user_notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "notifications owner delete" on public.user_notifications
  for delete using (auth.uid() = user_id);
revoke insert on table public.user_notifications from anon, authenticated;
-- Só a coluna is_read é alterável pelo dono.
revoke update on table public.user_notifications from anon, authenticated;
grant update (is_read) on table public.user_notifications to authenticated;

notify pgrst, 'reload schema';
