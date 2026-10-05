-- Corrige os acessos de administrador e moderador existentes.
-- A verificação evita revogar papéis se a conta proprietária não existir
-- ou se houver mais de uma conta com esse e-mail.
do $$
declare
  owner_id uuid;
  owner_count integer;
begin
  select count(*) into owner_count
  from auth.users
  where lower(btrim(email)) = 'contato@mercadodocompositor.com.br';

  if owner_count <> 1 then
    raise exception 'Esperada exatamente uma conta proprietária; encontradas %', owner_count;
  end if;

  select id into strict owner_id
  from auth.users
  where lower(btrim(email)) = 'contato@mercadodocompositor.com.br';

  delete from public.user_roles
  where role in ('admin', 'moderator')
    and user_id <> owner_id;

  insert into public.user_roles (user_id, role)
  values (owner_id, 'admin'), (owner_id, 'moderator')
  on conflict (user_id, role) do nothing;
end $$;
