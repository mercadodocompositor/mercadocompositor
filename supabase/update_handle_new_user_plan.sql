-- Atualização da função handle_new_user para vincular o plano selecionado no cadastro
--
-- ⚠️  SUPERADO por supabase/fix_auditoria_2026_09.sql. Aquele script traz a
--     versão canônica desta função: valida o plano contra o catálogo ativo
--     (evitando falha de FK quando o plano é renomeado), barra usernames
--     reservados e cria também o trigger on_auth_user_created, que faltava no
--     update_all_migrations.sql. Não execute os dois — use o fix_auditoria.

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
begin
  base_username := coalesce(
    nullif(p->>'username', ''),
    nullif(new.raw_user_meta_data->>'preferred_username', ''),
    'compositor-' || substr(new.id::text, 1, 8)
  );

  -- Normaliza caracteres
  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_-]', '-', 'g'));
  base_username := regexp_replace(base_username, '-+', '-', 'g');
  base_username := trim(both '-' from base_username);
  if length(base_username) < 3 then
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
  );

  insert into public.private_profiles(user_id, email, whatsapp, cpf)
  values (new.id, coalesce(new.email, ''), coalesce(p->>'whatsapp', ''), coalesce(p->>'cpf', ''));

  chosen_plan := coalesce(nullif(new.raw_user_meta_data->>'selected_plan', ''), 'Plano Bronze');
  chosen_price := coalesce(nullif(new.raw_user_meta_data->>'monthly_price', ''),
    case
      when chosen_plan = 'Plano Ouro' then '54,90'
      when chosen_plan = 'Plano Prata' then '34,90'
      else '24,90'
    end
  );

  insert into public.subscriptions(user_id, status, plan_name, monthly_price)
  values (new.id, 'pending', chosen_plan, chosen_price);

  insert into public.user_roles(user_id, role)
  values (new.id, 'composer');

  insert into public.user_preferences(user_id)
  values (new.id);

  return new;
end;
$$;
