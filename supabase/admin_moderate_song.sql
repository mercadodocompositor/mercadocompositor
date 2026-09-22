-- ==============================================================================
-- ⚠️  SUPERADO por supabase/fix_auditoria_2026_09.sql (seção 6): a versão deste
--     arquivo usa `set local session_replication_role = 'replica'`, que exige
--     privilégio de superusuário no Supabase (a moderação falharia por
--     completo) e, quando funciona, desliga também a validação de mídia e de
--     assinatura ativa — permitindo publicar obra sem prévia.
--
-- MIGRAÇÃO ANTERIOR: MODERAÇÃO DE OBRAS (admin_moderate_song)
-- Data: 17/09/2026
-- Objetivo: Permitir que administradores e moderadores aprovem, rejeitem ou movam
--           para rascunho qualquer obra do catálogo, contornando travas de RLS
--           e triggers de validação de mídia de rascunho (SECURITY DEFINER).
-- ==============================================================================

create or replace function public.admin_moderate_song(
  p_song_id uuid,
  p_status text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  updated_song public.songs%rowtype;
  caller_user_id uuid;
  is_staff boolean;
begin
  caller_user_id := auth.uid();

  -- 1. Verifica permissão de moderador/admin
  select exists(
    select 1 from public.user_roles
    where user_id = caller_user_id and role in ('admin', 'moderator')
  ) into is_staff;

  if not (is_staff or public.is_admin()) then
    raise exception using errcode = '42501',
      message = 'Acesso restrito: seu usuário não possui a função de administrador ou moderador no Supabase.';
  end if;

  -- 2. Valida o status alvo
  if p_status not in ('published', 'rejected', 'draft', 'pending_approval') then
    raise exception using errcode = '23514', message = 'Status de moderação inválido.';
  end if;

  -- 3. Desativa temporariamente triggers de envio de compositor para permitir
  --    moderação direta sem conflito de validação de mídia ou assinatura
  set local session_replication_role = 'replica';

  -- 4. Atualiza a obra de forma atômica
  update public.songs
  set
    status = p_status,
    notes = case
      when p_status = 'published' and p_notes is null then null
      else coalesce(p_notes, notes)
    end,
    -- Se deixar de ser publicada, remove automaticamente o destaque da Home
    is_featured = case when p_status = 'published' then is_featured else false end,
    updated_at = now()
  where id = p_song_id
  returning * into updated_song;

  if not found then
    raise exception using errcode = 'P0002', message = 'Música não encontrada no catálogo.';
  end if;

  return json_build_object(
    'success', true,
    'id', updated_song.id,
    'status', updated_song.status,
    'notes', updated_song.notes
  );
end;
$$;

-- Permissões de execução
revoke execute on function public.admin_moderate_song(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_song(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

-- ==============================================================================
-- INSTRUÇÕES PARA EXECUTAR NO SUPABASE SQL EDITOR:
-- 1. Copie e cole todo o conteúdo deste arquivo no SQL Editor do Supabase e clique em RUN.
-- 2. Se o seu usuário administrador ainda não estiver com a role 'admin' registrada:
--    INSERT INTO public.user_roles (user_id, role)
--    SELECT id, 'admin' FROM auth.users WHERE email = 'SEU_EMAIL_ADMIN@AQUI.COM'
--    ON CONFLICT (user_id, role) DO NOTHING;
-- ==============================================================================
