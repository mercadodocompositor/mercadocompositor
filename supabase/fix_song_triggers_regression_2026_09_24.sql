-- ==============================================================================
-- Correção: gatilhos de músicas voltavam para versões antigas
-- Pode ser executado a qualquer momento; é idempotente.
--
-- update_all_migrations.sql reinstalava as versões antigas de
-- enforce_song_media_separation e enforce_song_write_rules, desfazendo
-- fix_auditoria_2026_09.sql sempre que era rodado. Efeitos observados:
--   * toda obra que voltava para rascunho perdia capa, prévia e áudio original
--     (arquivos órfãos no Storage e reenvio obrigatório para republicar);
--   * desativar um plano bloqueava até o rascunho de quem já o assinava;
--   * sumiam as travas de caminho da prévia e do áudio original.
-- check_plan_capacity passa a ler o limite do plano assinado mesmo que ele
-- esteja desativado para novas vendas, igual ao gatilho.
--
-- Obras que já perderam a mídia não são recuperadas por este script: a URL
-- foi apagada da linha. O compositor precisa reenviar capa e prévia.
-- ==============================================================================

-- Versões definitivas (as mesmas de fix_auditoria_2026_09.sql). Não reintroduza
-- as antigas: elas apagavam a mídia de toda obra que voltava para rascunho e
-- bloqueavam até o rascunho de quem assina um plano desativado.
-- Correção: o join com subscription_plans exigia `sp.is_active`. Desativar um
-- plano no painel administrativo derrubava os assinantes daquele plano para
-- "A conta não possui um plano de assinatura válido" — eles não conseguiam nem
-- salvar rascunho. O plano de quem já assinou continua valendo mesmo desativado
-- para novas vendas; só o limite de obras é lido daqui.
create or replace function public.enforce_song_write_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_songs integer;
  plan_found boolean := false;
  current_song_count bigint;
  approval_required boolean;
  admin_actor boolean;
begin
  -- A exclusão da conta tira as obras do ar (status 'rejected') com o login do titular.
  admin_actor := public.is_admin() or current_setting('app.account_deletion', true) = 'on';

  select sp.max_songs, true
    into max_songs, plan_found
    from public.subscriptions sub
    join public.subscription_plans sp on sp.name = sub.plan_name
    where sub.user_id = new.composer_id;

  if not coalesce(plan_found, false) then
    raise exception using errcode = '23514', message = 'A conta não possui um plano de assinatura válido.';
  end if;

  select require_approval_for_new_songs
    into approval_required
    from public.platform_settings
    where id = true;

  approval_required := coalesce(approval_required, true);

  if tg_op = 'INSERT' then
    perform 1
      from public.profiles
      where user_id = new.composer_id
      for update;

    select count(*)
      into current_song_count
      from public.songs
      where composer_id = new.composer_id;

    if max_songs is not null and current_song_count >= max_songs then
      raise exception using
        errcode = 'P0001',
        message = format('Limite de %s músicas atingido para esta conta.', max_songs),
        hint = 'Remova uma música sem histórico ou solicite a ampliação do plano.';
    end if;
  end if;

  if nullif(btrim(new.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe ao menos um título provisório para salvar o rascunho.';
  end if;

  if new.date_composed > current_date then
    raise exception using errcode = '23514', message = 'A data da composição não pode estar no futuro.';
  end if;

  new.authors := coalesce(new.authors, '');
  new.lyrics := coalesce(new.lyrics, '');
  new.cover_url := coalesce(new.cover_url, '');

  if new.value_type = 'suggested' then
    if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0) then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value is not null and new.suggested_value <= 0 then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value > 10000000 then
      raise exception using errcode = '23514', message = 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.';
    end if;
  end if;

  if not admin_actor then
    if new.status = 'rejected' then
      raise exception using errcode = '42501', message = 'Somente administradores podem rejeitar músicas.';
    end if;

    if approval_required
       and new.status = 'published'
       and (tg_op = 'INSERT' or old.status is distinct from 'published') then
      raise exception using
        errcode = '42501',
        message = 'Esta música precisa ser enviada para aprovação antes da publicação.',
        hint = 'Use o status pending_approval.';
    end if;

    if approval_required
       and tg_op = 'UPDATE'
       and old.status = 'published'
       and new.status = 'published'
       and (
         new.title, new.genre, new.subgenre, new.authors, new.date_composed,
         new.lyrics, new.cover_url, new.registry_code, new.value_type,
         new.suggested_value, new.summary, new.original_audio_path,
         new.preview_audio_url
       ) is distinct from (
         old.title, old.genre, old.subgenre, old.authors, old.date_composed,
         old.lyrics, old.cover_url, old.registry_code, old.value_type,
         old.suggested_value, old.summary, old.original_audio_path,
         old.preview_audio_url
       ) then
      raise exception using
        errcode = '42501',
        message = 'Alterações em uma música publicada exigem nova aprovação.',
        hint = 'Salve a alteração com o status pending_approval.';
    end if;

    if not approval_required and new.status = 'pending_approval' then
      raise exception using
        errcode = '23514',
        message = 'A moderação prévia está desativada; publique a música diretamente.';
    end if;
  end if;

  if new.status in ('published', 'pending_approval') then
    if nullif(btrim(new.title), '') is null
       or nullif(btrim(new.authors), '') is null
       or nullif(btrim(new.lyrics), '') is null
       or nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
      raise exception using
        errcode = '23514',
        message = 'Para publicar, informe título, autores, letra e uma prévia pública de até 60 segundos.';
    end if;

    if not exists (
      select 1
      from public.subscriptions
      where user_id = new.composer_id
        and status = 'active'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Somente contas com assinatura ativa podem publicar músicas. Ative sua assinatura na página Assinatura.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_write_rules on public.songs;
create trigger enforce_song_write_rules
before insert or update on public.songs
for each row execute function public.enforce_song_write_rules();

revoke execute on function public.enforce_song_write_rules() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. SEPARAÇÃO DE MÍDIA (versão definitiva)
-- ------------------------------------------------------------------------------
-- Duas correções sobre as três versões divergentes que existiam:
--
-- (a) O rascunho NÃO apaga mais as referências de mídia. As versões anteriores
--     zeravam preview_audio_url, preview_media_id, original_audio_path,
--     original_media_id e cover_url sempre que o status virava 'draft'. Como o
--     cliente só mesclava {status:'draft'} no estado local, a tela continuava
--     mostrando capa e prévia que não existiam mais, os arquivos ficavam órfãos
--     no Storage (o navegador nunca soube os caminhos para limpar) e republicar
--     exigia reenviar tudo. Despublicar volta a ser reversível.
--
-- (b) As validações de confinamento de caminho de music_security.sql são
--     preservadas: os patches posteriores as tinham removido silenciosamente.
create or replace function public.enforce_song_media_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_row public.validated_media%rowtype;
begin
  -- O áudio original nunca sai do diretório privado do próprio compositor.
  if nullif(btrim(coalesce(new.original_audio_path, '')), '') is not null and (
    new.original_audio_path not like new.composer_id::text || '/%'
    or new.original_audio_path like '%..%'
    or new.original_audio_path like '%://%'
  ) then
    raise exception using
      errcode = '23514',
      message = 'O áudio original deve permanecer no diretório privado do próprio compositor.';
  end if;

  -- A prévia pública aponta exclusivamente para song-previews do compositor, e
  -- nunca para o bucket privado do original.
  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is not null and (
    position('/storage/v1/object/public/song-previews/' || new.composer_id::text || '/' in new.preview_audio_url) = 0
    or position('/song-originals/' in new.preview_audio_url) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'A prévia pública deve apontar exclusivamente para o bucket song-previews do compositor.';
  end if;

  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null and new.preview_media_id is not null then
    raise exception using errcode = '23514', message = 'Não informe validação de prévia sem uma URL de prévia.';
  end if;

  if nullif(btrim(coalesce(new.original_audio_path, '')), '') is null and new.original_media_id is not null then
    raise exception using errcode = '23514', message = 'Não informe validação de áudio original sem o caminho do arquivo.';
  end if;

  -- Rascunho guarda a mídia, mas ela só é validada/consumida quando a obra
  -- entra no catálogo ou na fila de aprovação — é lá que passa a ser exibida.
  if new.status in ('published', 'pending_approval') then
    if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
      raise exception using
        errcode = '23514',
        message = 'Uma prévia pública de até 60 segundos é obrigatória para publicação.';
    end if;

    if tg_op = 'INSERT'
       or old.status not in ('published', 'pending_approval')
       or old.preview_audio_url is distinct from new.preview_audio_url
       or old.preview_media_id is distinct from new.preview_media_id then
      if new.preview_media_id is null then
        raise exception using errcode = '23514', message = 'A prévia precisa de um registro de mídia validada.';
      end if;

      select * into media_row
      from public.validated_media
      where id = new.preview_media_id
        and user_id = new.composer_id
        and bucket_id = 'song-previews'
        and public_url = new.preview_audio_url
        and duration_seconds > 0
        and duration_seconds <= 60
        and (consumed_by_song_id is null or consumed_by_song_id = new.id)
      for update;

      if not found then
        raise exception using errcode = '23514', message = 'A prévia não possui validação válida ou já foi vinculada a outra música.';
      end if;

      update public.validated_media
      set consumed_by_song_id = new.id,
          consumed_at = coalesce(consumed_at, now())
      where id = media_row.id;
    end if;

    if nullif(btrim(coalesce(new.original_audio_path, '')), '') is not null
       and (
         tg_op = 'INSERT'
         or old.status not in ('published', 'pending_approval')
         or old.original_audio_path is distinct from new.original_audio_path
         or old.original_media_id is distinct from new.original_media_id
       ) then
      if new.original_media_id is null then
        raise exception using errcode = '23514', message = 'O áudio original precisa de um registro de mídia validada.';
      end if;

      select * into media_row
      from public.validated_media
      where id = new.original_media_id
        and user_id = new.composer_id
        and bucket_id = 'song-originals'
        and object_path = new.original_audio_path
        and (consumed_by_song_id is null or consumed_by_song_id = new.id)
      for update;

      if not found then
        raise exception using errcode = '23514', message = 'O áudio original não possui validação válida ou já foi vinculado a outra música.';
      end if;

      update public.validated_media
      set consumed_by_song_id = new.id,
          consumed_at = coalesce(consumed_at, now())
      where id = media_row.id;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_media_separation on public.songs;
create trigger enforce_song_media_separation
before insert or update on public.songs
for each row execute function public.enforce_song_media_separation();

revoke execute on function public.enforce_song_media_separation()
from public, anon, authenticated;

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

notify pgrst, 'reload schema';
