-- Corrige os fluxos administrativos de compositores e assinaturas.
-- Execute após schema.sql. É idempotente.

create or replace function public.can_manage_composer_subscriptions()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid()
      and role in ('admin', 'financial')
  )
$$;

revoke execute on function public.can_manage_composer_subscriptions() from public, anon;
grant execute on function public.can_manage_composer_subscriptions() to authenticated;

drop policy if exists "subscription owner or admin read" on public.subscriptions;
drop policy if exists "subscription owner or finance read" on public.subscriptions;
create policy "subscription owner or finance read"
on public.subscriptions
for select
to authenticated
using (auth.uid() = user_id or public.can_manage_composer_subscriptions());

drop policy if exists "subscription admin update" on public.subscriptions;
drop policy if exists "subscription admin or financial update" on public.subscriptions;
create policy "subscription admin or financial update"
on public.subscriptions
for update
to authenticated
using (public.can_manage_composer_subscriptions())
with check (public.can_manage_composer_subscriptions());

create or replace function public.get_admin_composers()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.user_id,
        'username', p.username,
        'name', p.name,
        'stageName', p.stage_name,
        'email', coalesce(pp.email, ''),
        'whatsapp', coalesce(pp.whatsapp, ''),
        'cpf', coalesce(pp.cpf, ''),
        'cityState', concat_ws(' - ', nullif(p.city, ''), nullif(p.state, '')),
        'subscriptionStatus', coalesce(sub.status, 'pending'),
        'planName', coalesce(sub.plan_name, ''),
        'monthlyValue', coalesce(nullif(replace(sub.monthly_price, ',', '.'), '')::numeric, 0),
        'registeredAt', p.created_at,
        'songCount', coalesce(song_stats.song_count, 0),
        'totalPlays', coalesce(song_stats.total_plays, 0),
        'totalReleases', coalesce(release_stats.release_count, 0),
        'revenueGenerated', coalesce(release_stats.total_revenue, 0),
        'photo', p.photo_url,
        'isVerified', p.is_verified
      )
      order by p.created_at desc, p.user_id
    ),
    '[]'::jsonb
  )
  into result
  from public.profiles p
  left join public.private_profiles pp on pp.user_id = p.user_id
  left join public.subscriptions sub on sub.user_id = p.user_id
  left join (
    select composer_id, count(*) as song_count, coalesce(sum(play_count), 0) as total_plays
    from public.songs
    group by composer_id
  ) song_stats on song_stats.composer_id = p.user_id
  left join (
    select composer_id, count(*) as release_count, coalesce(sum(agreed_value), 0) as total_revenue
    from public.releases
    group by composer_id
  ) release_stats on release_stats.composer_id = p.user_id;

  return result;
end;
$$;

revoke execute on function public.get_admin_composers() from public, anon;
grant execute on function public.get_admin_composers() to authenticated;

create or replace function public.admin_set_profile_verified(
  p_user_id uuid,
  p_is_verified boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_manage_composer_subscriptions() then
    raise exception using errcode = '42501', message = 'Acesso restrito à gestão financeira.';
  end if;

  update public.profiles
  set is_verified = p_is_verified, updated_at = now()
  where user_id = p_user_id;

  if not found then
    raise exception using errcode = 'P0002', message = 'Compositor não encontrado.';
  end if;
end;
$$;

revoke execute on function public.admin_set_profile_verified(uuid, boolean) from public, anon;
grant execute on function public.admin_set_profile_verified(uuid, boolean) to authenticated;

drop policy if exists "logs admin" on public.system_logs;
drop policy if exists "logs admin read" on public.system_logs;
drop policy if exists "logs finance read" on public.system_logs;
create policy "logs finance read"
on public.system_logs
for select
to authenticated
using (public.can_manage_composer_subscriptions());

-- Impede que o cliente forje o campo actor; toda escrita passa pela RPC abaixo.
revoke insert on public.system_logs from anon, authenticated;

create or replace function public.write_system_audit_log(
  p_id text,
  p_category text,
  p_title text,
  p_description text,
  p_status text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
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
     or length(p_description) > 2000 then
    raise exception using errcode = '23514', message = 'Evento de auditoria inválido.';
  end if;

  select email into actor_email from auth.users where id = auth.uid();
  insert into public.system_logs(id, category, title, description, actor, status)
  values (p_id, p_category, btrim(p_title), p_description, coalesce(actor_email, auth.uid()::text), p_status);
end;
$$;

revoke execute on function public.write_system_audit_log(text, text, text, text, text) from public, anon;
grant execute on function public.write_system_audit_log(text, text, text, text, text) to authenticated;

notify pgrst, 'reload schema';
