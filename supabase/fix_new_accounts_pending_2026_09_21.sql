-- Novas contas apenas selecionam um plano; não nascem com assinatura ativa.
-- Execute depois de fix_auditoria_2026_09.sql. Idempotente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := coalesce(new.raw_user_meta_data->'profile', '{}'::jsonb);
  base_username text;
  candidate_username text;
  counter integer := 1;
  chosen_plan text;
  chosen_price text;
  reserved text[] := array[
    'admin','administrador','dashboard','login','cadastro','termos',
    'privacidade','autenticacao','validar-documento','validar','suporte','api',
    'app','root','sistema','oficial','mercadodocompositor','compositores',
    'compositor','recuperar-senha'
  ];
begin
  base_username := coalesce(
    nullif(p->>'username', ''),
    nullif(new.raw_user_meta_data->>'preferred_username', ''),
    'compositor-' || substr(new.id::text, 1, 8)
  );
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_-]', '-', 'g'));
  base_username := regexp_replace(base_username, '-+', '-', 'g');
  base_username := btrim(base_username, '-');
  if length(base_username) < 3 or base_username = any(reserved) then
    base_username := 'compositor-' || substr(new.id::text, 1, 8);
  end if;
  candidate_username := base_username;
  while exists (select 1 from public.profiles where username = candidate_username) loop
    candidate_username := base_username || '-' || substr(new.id::text, 1, 4) || counter::text;
    counter := counter + 1;
  end loop;

  insert into public.profiles(
    user_id, username, name, stage_name, city, state, bio, experience_years,
    genres, instagram, youtube, website, photo_url, cover_photo_url
  ) values (
    new.id, candidate_username,
    coalesce(nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(nullif(p->>'stageName', ''), nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(p->>'city', ''), coalesce(p->>'state', ''), coalesce(p->>'bio', ''), coalesce(p->>'experienceYears', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb))), '{}'),
    coalesce(p->>'instagram', ''), coalesce(p->>'youtube', ''), coalesce(p->>'website', ''),
    coalesce(nullif(p->>'photo', ''), new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    coalesce(p->>'coverPhoto', '')
  ) on conflict (user_id) do nothing;

  insert into public.private_profiles(user_id, email, whatsapp, cpf)
  values (new.id, coalesce(new.email, ''), coalesce(p->>'whatsapp', ''), coalesce(p->>'cpf', ''))
  on conflict (user_id) do nothing;

  chosen_plan := nullif(new.raw_user_meta_data->>'selected_plan', '');
  if chosen_plan is null or not exists (
    select 1 from public.subscription_plans where name = chosen_plan and is_active
  ) then
    select name into chosen_plan from public.subscription_plans
    where is_active order by sort_order, monthly_price limit 1;
  end if;
  chosen_plan := coalesce(chosen_plan, 'Plano Bronze');
  select replace(to_char(monthly_price, 'FM999990.00'), '.', ',') into chosen_price
  from public.subscription_plans where name = chosen_plan;
  chosen_price := coalesce(nullif(new.raw_user_meta_data->>'monthly_price', ''), chosen_price, '0,00');

  insert into public.subscriptions(user_id, status, plan_name, monthly_price)
  values (new.id, 'pending', chosen_plan, chosen_price)
  on conflict (user_id) do nothing;

  insert into public.user_roles(user_id, role) values (new.id, 'composer') on conflict do nothing;
  insert into public.user_preferences(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_data on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Corrige somente contas criadas durante a janela do defeito, sem tocar em
-- assinaturas pagas, testes iniciados ou possíveis cortesias mais antigas.
update public.subscriptions s
set status = 'pending', updated_at = now()
from public.profiles p
where p.user_id = s.user_id
  and p.created_at >= timestamptz '2026-09-21 00:00:00+00'
  and p.created_at < timestamptz '2026-09-22 00:00:00+00'
  and s.status = 'active'
  and s.next_billing_date is null
  and coalesce(s.auto_renew, false) = false
  and s.trial_started_at is null
  and not exists (
    select 1 from public.subscription_payments sp
    where sp.user_id = s.user_id and sp.status = 'approved'
  );

notify pgrst, 'reload schema';
