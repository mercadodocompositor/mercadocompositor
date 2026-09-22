-- Ativa a moderação administrativa de músicas em um banco existente.
-- Execute depois de production_hardening.sql.

alter table public.songs
  drop constraint if exists songs_status_check;

alter table public.songs
  add constraint songs_status_check
  check (status in ('draft', 'pending_approval', 'published', 'rejected'));

create or replace function public.enforce_song_write_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  max_songs integer;
  current_song_count bigint;
  approval_required boolean;
  admin_actor boolean;
begin
  admin_actor := public.is_admin();

  select sp.max_songs
    into max_songs
    from public.subscriptions sub
    join public.subscription_plans sp on sp.name = sub.plan_name and sp.is_active
    where sub.user_id = new.composer_id;

  if not found then
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

  -- 1. Título obrigatório com trim para todos os status (inclusive rascunho)
  if nullif(btrim(new.title), '') is null then
    raise exception using errcode = '23514', message = 'Informe ao menos um título provisório para salvar o rascunho.';
  end if;

  -- 2. Data da composição não pode estar no futuro
  if new.date_composed > current_date then
    raise exception using errcode = '23514', message = 'A data da composição não pode estar no futuro.';
  end if;

  -- 3. Sanitização graciosa para campos de rascunho (evita falha em NOT NULL)
  new.authors := coalesce(new.authors, '');
  new.lyrics := coalesce(new.lyrics, '');
  new.cover_url := coalesce(new.cover_url, '');

  -- 4. Validação unificada de valor sugerido
  if new.value_type = 'suggested' then
    -- Se estiver sendo publicada ou enviada para aprovação, valor é obrigatório
    if new.status in ('published', 'pending_approval') and (new.suggested_value is null or new.suggested_value <= 0) then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    -- Se o valor foi informado (inclusive em rascunho), deve ser > 0 e <= 10.000.000
    if new.suggested_value is not null and new.suggested_value <= 0 then
      raise exception using errcode = '23514', message = 'O valor sugerido deve ser maior que zero.';
    end if;
    if new.suggested_value > 10000000 then
      raise exception using errcode = '23514', message = 'O valor sugerido não pode ultrapassar R$ 10.000.000,00.';
    end if;
  end if;

  if not admin_actor then
    if new.status = 'rejected' then
      raise exception using
        errcode = '42501',
        message = 'Somente administradores podem rejeitar músicas.';
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
        message = 'Para publicar ou enviar para aprovação, informe título, autores, letra e uma prévia pública de até 60 segundos.';
    end if;

    if not exists (
      select 1
      from public.subscriptions
      where user_id = new.composer_id
        and status = 'active'
    ) then
      raise exception using
        errcode = 'P0001',
        message = 'Somente contas com assinatura ativa podem publicar ou enviar músicas para aprovação.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_song_write_rules on public.songs;
create trigger enforce_song_write_rules
before insert or update on public.songs
for each row execute function public.enforce_song_write_rules();

revoke execute on function public.enforce_song_write_rules()
from public, anon, authenticated;
