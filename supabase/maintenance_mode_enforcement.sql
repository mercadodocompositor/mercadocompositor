-- ==============================================================================
-- MODO MANUTENÇÃO: BLOQUEIO EFETIVO DE ESCRITAS
-- ==============================================================================
-- Hoje `maintenance_mode` só troca a tela no cliente (App.tsx). Uma aba já
-- aberta, um cliente desatualizado ou uma chamada direta à API REST continuam
-- gravando normalmente — o modo manutenção não protege nada de fato.
--
-- Este script move a regra para o banco: durante a manutenção, escritas de
-- usuários comuns são recusadas; administradores seguem operando (é o que
-- permite corrigir dados justamente durante a janela).
--
-- ATENÇÃO: revisar a lista de tabelas antes de executar. Enquanto
-- `maintenance_mode` estiver ligado, TODA escrita de não-admin nessas tabelas
-- é recusada, inclusive cadastros e pedidos de interesse.

create or replace function public.assert_platform_available()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (select 1 from public.platform_settings where id = true and maintenance_mode)
     and not public.is_admin() then
    raise exception using errcode='42501',
      message='A plataforma está em manutenção. Tente novamente em alguns minutos.';
  end if;
  return coalesce(new, old);
end; $$;

do $$
declare t text;
begin
  foreach t in array array[
    'songs',
    'song_drafts',
    'interest_requests',
    'releases'
  ] loop
    execute format('drop trigger if exists trg_maintenance_guard on public.%I', t);
    execute format(
      'create trigger trg_maintenance_guard before insert or update or delete on public.%I
         for each row execute function public.assert_platform_available()', t);
  end loop;
end $$;

-- Para reverter:
--   drop trigger if exists trg_maintenance_guard on public.songs;  (idem demais tabelas)
--   drop function if exists public.assert_platform_available();
