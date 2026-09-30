-- =============================================================================
-- MERCADO DO COMPOSITOR — DISPONIBILIDADE DO ENDEREÇO PÚBLICO (2026-09-28)
-- =============================================================================
-- Corrige a verificação "Endereço disponível" do Meu Perfil, que sempre
-- respondia disponível. É idempotente.

-- Disponibilidade do endereço público. A tabela profiles só expõe a própria
-- linha ao compositor (RLS), então uma consulta direta nunca enxerga o
-- endereço de outra pessoa e sempre respondia "disponível". Esta função
-- responde apenas sim/não, sem revelar dados de quem usa o endereço.
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when p_username is null or length(btrim(p_username)) not between 3 and 60 then false
    else not exists(
      select 1 from public.profiles p
      where lower(p.username::text) = lower(btrim(p_username))
        and p.user_id is distinct from auth.uid()
    )
  end
$$;
revoke execute on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

notify pgrst, 'reload schema';
