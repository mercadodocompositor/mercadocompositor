-- ==============================================================================
-- Correção dos bloqueadores do diagnóstico de produção (2026-09-30)
-- Execute DEPOIS de request_consent_evidence_2026_09_24.sql,
-- release_delivery_snapshot_2026_09_28.sql e featured_composers_2026_09_28.sql,
-- e ANTES de verify_workflow_guarantees_2026_09_24.sql. É idempotente.
--
-- O banco recebeu schema.sql e update_all_migrations.sql depois de migrações
-- mais novas. Este arquivo repõe o que nenhum outro repõe sozinho sem regredir
-- outra coisa:
--   1. songs e profiles voltam a ter escrita só nas colunas do formulário. O
--      consolidado concedia INSERT/UPDATE de tabela, e o compositor podia gravar
--      is_verified, is_featured e os contadores pela API.
--   2. O compositor não apaga mais a própria linha de profiles/private_profiles
--      pela API (a exclusão de conta passa por delete_my_account).
--   3. admin_moderate_song volta à versão que não desliga os gatilhos.
--   4. Contadores de reprodução e visita voltam a usar identidade estável no
--      limite de requisições.
--   5. expire_overdue_subscriptions deixa de usar a coluna auto_renew, removida
--      com o gateway antigo (o job falhava toda noite), e não mexe em
--      assinaturas do Stripe: o webhook é a fonte da verdade delas.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. ESCRITA POR COLUNA EM songs E profiles
-- ------------------------------------------------------------------------------
revoke insert, update on table public.songs from anon, authenticated;
grant select, delete on table public.songs to authenticated;
grant insert (
  id, composer_id, title, genre, subgenre, authors, date_composed,
  date_registered, lyrics, cover_url, registry_code, iswc, notes, status,
  is_available_for_release, value_type, suggested_value, summary,
  original_audio_path, preview_audio_url, original_media_id, preview_media_id,
  created_at, updated_at
) on table public.songs to authenticated;
grant update (
  title, genre, subgenre, authors, date_composed, date_registered, lyrics,
  cover_url, registry_code, iswc, notes, status, is_available_for_release,
  value_type, suggested_value, summary, original_audio_path,
  preview_audio_url, original_media_id, preview_media_id, updated_at
) on table public.songs to authenticated;

revoke insert, update on table public.profiles from anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, society, spotify,
  updated_at
) on table public.profiles to authenticated;

-- ------------------------------------------------------------------------------
-- 2. SEM DELETE DIRETO NO PRÓPRIO PERFIL
-- ------------------------------------------------------------------------------
revoke delete on table public.profiles, public.private_profiles from anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. MODERAÇÃO ADMINISTRATIVA DE OBRAS (versão de fix_auditoria_2026_09.sql)
-- ------------------------------------------------------------------------------
create or replace function public.admin_moderate_song(
  p_song_id uuid,
  p_status text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  updated_song public.songs%rowtype;
  target_song public.songs%rowtype;
  is_staff boolean;
begin
  select exists(
    select 1 from public.user_roles
    where user_id = auth.uid() and role in ('admin', 'moderator')
  ) into is_staff;

  if not coalesce(is_staff, false) then
    raise exception using errcode = '42501',
      message = 'Acesso restrito: seu usuário não possui a função de administrador ou moderador.';
  end if;

  if p_status not in ('published', 'rejected', 'draft', 'pending_approval') then
    raise exception using errcode = '23514', message = 'Status de moderação inválido.';
  end if;

  select * into target_song from public.songs where id = p_song_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Música não encontrada no catálogo.';
  end if;

  -- Aprovar uma obra cuja conta não está ativa deixaria o catálogo público
  -- apontando para um perfil invisível (get_public_composer exige assinatura
  -- ativa). Melhor recusar com uma mensagem clara do que publicar no vazio.
  if p_status = 'published' and not exists (
    select 1 from public.subscriptions where user_id = target_song.composer_id and status = 'active'
  ) then
    raise exception using errcode = 'P0001',
      message = 'A assinatura deste compositor não está ativa: regularize antes de publicar a obra.';
  end if;

  update public.songs
  set
    status = p_status,
    notes = case
      when p_status = 'published' and p_notes is null then null
      else coalesce(p_notes, notes)
    end,
    -- Fora do catálogo, fora do destaque da home.
    is_featured = case when p_status = 'published' then is_featured else false end,
    updated_at = now()
  where id = p_song_id
  returning * into updated_song;

  -- O compositor precisa saber o resultado da moderação.
  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (
    updated_song.composer_id,
    case p_status
      when 'published' then 'Música aprovada'
      when 'rejected' then 'Música rejeitada'
      when 'draft' then 'Música retirada do catálogo'
      else 'Música em análise'
    end,
    case p_status
      when 'published' then format('A obra "%s" foi aprovada e já está no catálogo público.', updated_song.title)
      when 'rejected' then format('A obra "%s" foi rejeitada pela moderação.%s', updated_song.title,
        case when nullif(btrim(coalesce(p_notes, '')), '') is null then '' else ' Motivo: ' || p_notes end)
      when 'draft' then format('A obra "%s" foi retirada do catálogo pela moderação.%s', updated_song.title,
        case when nullif(btrim(coalesce(p_notes, '')), '') is null then '' else ' Motivo: ' || p_notes end)
      else format('A obra "%s" voltou para a fila de análise.', updated_song.title)
    end,
    'moderation',
    false,
    '/dashboard/musicas'
  );

  return jsonb_build_object(
    'success', true,
    'id', updated_song.id,
    'status', updated_song.status,
    'notes', updated_song.notes
  );
end;
$$;

revoke execute on function public.admin_moderate_song(uuid, text, text) from public, anon;
grant execute on function public.admin_moderate_song(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------------------
-- 4. CONTADORES PÚBLICOS COM IDENTIDADE ESTÁVEL (versão de fix_auditoria_2026_09.sql)
-- ------------------------------------------------------------------------------
create or replace function public.increment_song_play(p_song_id uuid, p_visitor_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare identity_value text;
begin
  if auth.uid() is null and coalesce(p_visitor_id,'') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;
  identity_value := coalesce(auth.uid()::text, lower(p_visitor_id)) || '|' || public.rpc_client_identity();
  if not public.consume_rpc_rate_limit('song-play-'||p_song_id, identity_value, 1, 1800) then return false; end if;
  update public.songs s set play_count = s.play_count + 1
  where s.id = p_song_id and s.status = 'published'
    and exists(select 1 from public.subscriptions sub where sub.user_id = s.composer_id and sub.status = 'active')
    -- O próprio autor ouvindo a obra não é reprodução pública.
    and s.composer_id is distinct from auth.uid();
  return found;
end $$;
revoke execute on function public.increment_song_play(uuid,text) from public;
grant execute on function public.increment_song_play(uuid,text) to anon, authenticated;

create or replace function public.increment_profile_view(p_username text, p_visitor_id text)
returns boolean language plpgsql security definer set search_path='' as $$
declare
  profile_id uuid;
  identity_value text;
begin
  if auth.uid() is null and coalesce(p_visitor_id,'') !~ '^[0-9a-fA-F-]{36}$' then return false; end if;

  select p.user_id into profile_id
  from public.profiles p
  join public.subscriptions sub on sub.user_id = p.user_id and sub.status = 'active'
  where p.username = p_username
  limit 1;

  if profile_id is null then return false; end if;
  -- Visita do próprio dono ao seu perfil não conta.
  if profile_id = auth.uid() then return false; end if;

  identity_value := coalesce(auth.uid()::text, lower(p_visitor_id)) || '|' || public.rpc_client_identity();
  if not public.consume_rpc_rate_limit('profile-view-'||profile_id, identity_value, 1, 1800) then return false; end if;

  update public.profiles
  set views_count = views_count + 1
  where user_id = profile_id;
  return found;
end $$;
revoke execute on function public.increment_profile_view(text,text) from public;
grant execute on function public.increment_profile_view(text,text) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. EXPIRAÇÃO DE ASSINATURAS SEM STRIPE
-- ------------------------------------------------------------------------------
-- Só alcança assinaturas ativadas manualmente com data de vencimento. As do
-- Stripe são sincronizadas pelo stripe-webhook; assinaturas sem
-- next_billing_date (cortesia) não expiram.
create or replace function public.expire_overdue_subscriptions(p_grace_days integer default 3)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer := 0;
begin
  with expired as (
    update public.subscriptions
    set status = 'pending', updated_at = now()
    where status = 'active'
      and stripe_subscription_id is null
      and next_billing_date is not null
      and next_billing_date + greatest(0, p_grace_days) < current_date
    returning user_id, plan_name, next_billing_date
  ), notified as (
    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    select
      user_id,
      'Assinatura vencida',
      format('Seu %s venceu em %s. Seu perfil e suas obras saíram do catálogo público até a renovação.',
        plan_name, to_char(next_billing_date, 'DD/MM/YYYY')),
      'system', false, '/dashboard/assinatura'
    from expired
    returning 1
  )
  select count(*) into v_expired from notified;

  if v_expired > 0 then
    insert into public.system_logs(category, title, description, actor, status)
    values ('financial', 'Assinaturas vencidas expiradas',
      format('%s assinatura(s) vencida(s) voltaram para pendente.', v_expired),
      'sistema', 'warning');
  end if;

  return v_expired;
end;
$$;

revoke execute on function public.expire_overdue_subscriptions(integer) from public, anon, authenticated;

notify pgrst, 'reload schema';
