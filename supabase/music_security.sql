-- ⚠️  A função enforce_song_media_separation deste arquivo foi SUPERADA por
--     supabase/fix_auditoria_2026_09.sql (seção 4), que preserva as validações
--     de caminho daqui e deixa de apagar a mídia do rascunho. As demais partes
--     deste script (buckets privados) continuam valendo.
--
-- Defesa em profundidade: o catálogo usa somente prévias públicas.
-- Caminhos originais legados continuam privados, mas não são exigidos em novos cadastros.
-- Esta cópia deve permanecer equivalente à função canônica de
-- update_all_migrations.sql. Em bancos existentes, aplique por último
-- fix_publish_draft_media_validation.sql.

update storage.buckets
set public = false
where id in ('song-originals', 'release-documents', 'media-quarantine');

create or replace function public.enforce_song_media_separation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  media_row public.validated_media%rowtype;
begin
  if new.status = 'draft' then
    new.preview_audio_url := null;
    new.preview_media_id := null;
    new.original_audio_path := null;
    new.original_media_id := null;
    new.cover_url := '';
    return new;
  end if;

  if new.original_audio_path is not null and (
    new.original_audio_path not like new.composer_id::text || '/%'
    or new.original_audio_path like '%..%'
    or new.original_audio_path like '%://%'
  ) then
    raise exception using
      errcode = '23514',
      message = 'O áudio original deve permanecer no diretório privado do próprio compositor.';
  end if;

  if nullif(btrim(coalesce(new.preview_audio_url, '')), '') is not null and (
    position('/storage/v1/object/public/song-previews/' || new.composer_id::text || '/' in new.preview_audio_url) = 0
    or position('/song-originals/' in new.preview_audio_url) > 0
  ) then
    raise exception using
      errcode = '23514',
      message = 'A prévia pública deve apontar exclusivamente para o bucket song-previews do compositor.';
  end if;

  if new.status in ('published', 'pending_approval')
     and nullif(btrim(coalesce(new.preview_audio_url, '')), '') is null then
    raise exception using
      errcode = '23514',
      message = 'Uma prévia pública de até 60 segundos é obrigatória para publicação.';
  end if;

  -- Uma mídia informada enquanto a música era rascunho ainda precisa ser
  -- validada quando a música entra no catálogo ou na fila de aprovação.
  if new.status in ('published', 'pending_approval')
     and (
       tg_op = 'INSERT'
       or old.status not in ('published', 'pending_approval')
       or old.preview_audio_url is distinct from new.preview_audio_url
       or old.preview_media_id is distinct from new.preview_media_id
     ) then
    if new.preview_media_id is null then
      raise exception using
        errcode = '23514',
        message = 'A prévia precisa de um registro de mídia validada.';
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
      raise exception using
        errcode = '23514',
        message = 'A prévia não possui validação válida ou já foi vinculada a outra música.';
    end if;

    update public.validated_media
    set consumed_by_song_id = new.id,
        consumed_at = coalesce(consumed_at, now())
    where id = media_row.id;
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

drop policy if exists "private media owner read" on storage.objects;
drop policy if exists "song originals owner read" on storage.objects;
drop policy if exists "release documents owner or admin read" on storage.objects;

-- Nem administradores recebem acesso ao original completo. A moderação usa somente a prévia.
create policy "song originals owner read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'song-originals'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "release documents owner or admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'release-documents'
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);

-- Remove o EXECUTE implícito concedido a PUBLIC e libera somente os RPCs públicos necessários.
revoke execute on function public.get_public_composer(text) from public;
revoke execute on function public.get_featured_composers(integer) from public;
revoke execute on function public.create_interest_request(uuid, jsonb) from public;
revoke execute on function public.increment_song_play(uuid) from public;
revoke execute on function public.increment_song_play(uuid, text) from public;
revoke execute on function public.increment_profile_view(text, text) from public;

grant execute on function public.get_public_composer(text) to anon, authenticated;
grant execute on function public.get_featured_composers(integer) to anon, authenticated;
grant execute on function public.create_interest_request(uuid, jsonb) to anon, authenticated;
revoke execute on function public.increment_song_play(uuid) from anon, authenticated;
grant execute on function public.increment_song_play(uuid, text) to anon, authenticated;
grant execute on function public.increment_profile_view(text, text) to anon, authenticated;

-- Workflow de solicitações: dados estruturados e mutações exclusivamente por RPC.
alter table public.interest_requests add column if not exists archive_reason text;
alter table public.interest_requests add column if not exists archived_at timestamptz;
alter table public.releases add column if not exists document_hash text;
alter table public.releases add column if not exists template_version text;
alter table public.releases add column if not exists document_archived_at timestamptz;

create or replace function public.is_exclusive_release(p_release_type text)
returns boolean
language sql
immutable
as $$
  select case
    when p_release_type is null or btrim(p_release_type) = '' then false
    when lower(p_release_type) ~* 'n[aã]o[\s\-_]*exclusiv' then false
    when lower(p_release_type) ~* '(autoriza[cç][aã]o\s+exclusiva|cess[aã]o\s+exclusiva|cess[aã]o\s+definitiva|exclusiva\s+por|^exclusiva$)' then true
    else false
  end;
$$;
revoke execute on function public.is_exclusive_release(text) from public, anon;
grant execute on function public.is_exclusive_release(text) to authenticated;

create or replace function public.calculate_release_expiration(
  p_release_type text,
  p_issue_date date
) returns date
language plpgsql
immutable
as $$
declare
  months_match text[];
  months_count int;
begin
  if p_release_type is null or p_issue_date is null then
    return null;
  end if;
  if not public.is_exclusive_release(p_release_type) then
    return null;
  end if;

  months_match := regexp_match(p_release_type, '(\d+)\s*meses', 'i');
  if months_match is not null then
    months_count := months_match[1]::int;
    return (p_issue_date + (months_count * interval '1 month'))::date;
  end if;

  return null;
end;
$$;
revoke execute on function public.calculate_release_expiration(text, date) from public, anon;
grant execute on function public.calculate_release_expiration(text, date) to authenticated;

create or replace function public.is_active_exclusive_release(
  p_release_type text,
  p_issue_date date,
  p_expires_at date default null,
  p_check_date date default current_date
) returns boolean
language plpgsql
stable
as $$
declare
  exp_date date;
begin
  if not public.is_exclusive_release(p_release_type) then
    return false;
  end if;

  exp_date := coalesce(p_expires_at, public.calculate_release_expiration(p_release_type, p_issue_date));
  if exp_date is null then
    return true;
  end if;

  return coalesce(p_check_date, current_date) <= exp_date;
end;
$$;
revoke execute on function public.is_active_exclusive_release(text, date, date, date) from public, anon;
grant execute on function public.is_active_exclusive_release(text, date, date, date) to authenticated;

create or replace function public.update_interest_request(
  p_request_id uuid, p_status text, p_agreed_value numeric default null,
  p_notes text default null, p_archive_reason text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  current_request public.interest_requests%rowtype;
  target_agreed_value numeric;
begin
  select * into current_request from public.interest_requests
  where id = p_request_id and composer_id = auth.uid() for update;
  if not found then raise exception using errcode='42501', message='Solicitação não encontrada para este compositor.'; end if;
  if p_status not in ('nova','em_negociacao','pagamento_pendente','pagamento_confirmado','liberacao_enviada','arquivada') then
    raise exception using errcode='23514', message='Status de solicitação inválido.';
  end if;
  if p_status <> current_request.status and not (
    (current_request.status='nova' and p_status in ('em_negociacao','arquivada')) or
    (current_request.status='em_negociacao' and p_status in ('pagamento_pendente','arquivada')) or
    (current_request.status='pagamento_pendente' and p_status in ('em_negociacao','pagamento_confirmado','arquivada')) or
    (current_request.status='pagamento_confirmado' and p_status='arquivada') or
    (current_request.status='arquivada' and p_status='nova')
  ) then raise exception using errcode='23514', message='Transição de status não permitida.'; end if;

  if p_status in ('pagamento_pendente','pagamento_confirmado') and exists (
    select 1 from public.releases
    where song_id = current_request.song_id
      and request_id <> current_request.id
      and public.is_active_exclusive_release(release_type, issue_date, expires_at)
  ) then
    raise exception using errcode='23514', message='Esta obra já possui uma liberação exclusiva emitida para outro interessado e não aceita novos pagamentos.';
  end if;

  target_agreed_value := coalesce(p_agreed_value, current_request.agreed_value);
  if p_status in ('pagamento_pendente','pagamento_confirmado') and coalesce(target_agreed_value, 0) <= 0 then
    raise exception using errcode='23514', message='Informe um valor acordado maior que zero.';
  end if;
  if target_agreed_value is not null and target_agreed_value > 10000000 then
    raise exception using errcode='23514', message='O valor acordado não pode ultrapassar R$ 10.000.000,00.';
  end if;
  if length(coalesce(p_notes,''))>500 or length(coalesce(p_archive_reason,''))>160 then
    raise exception using errcode='23514', message='Observações ou motivo excedem o limite permitido.';
  end if;
  update public.interest_requests set status=p_status, agreed_value=target_agreed_value, notes=coalesce(p_notes, current_request.notes),
    payment_received_at=case when p_status='pagamento_confirmado' then coalesce(current_request.payment_received_at,now()) else current_request.payment_received_at end,
    archive_reason=case when p_status='arquivada' then nullif(btrim(p_archive_reason),'') when p_status='nova' then null else current_request.archive_reason end,
    archived_at=case when p_status='arquivada' then coalesce(current_request.archived_at,now()) when p_status='nova' then null else current_request.archived_at end
  where id=p_request_id;
end; $$;

revoke update (status, agreed_value, notes, payment_received_at, archive_reason, archived_at)
on table public.interest_requests from authenticated;
revoke execute on function public.update_interest_request(uuid,text,numeric,text,text) from public, anon;
grant execute on function public.update_interest_request(uuid,text,numeric,text,text) to authenticated;

-- Sobrecarga transacional: a liberação e o fechamento opcional da obra confirmam juntos.
create or replace function public.issue_release(
  p_request_id uuid, p_release_type text, p_additional_conditions text,
  p_digital_signature text, p_close_song boolean, p_agreed_value numeric default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare release_result jsonb;
begin
  release_result := public.issue_release(p_request_id,p_release_type,p_additional_conditions,p_digital_signature,p_agreed_value);
  if p_close_song or public.is_exclusive_release(p_release_type) then
    update public.songs set is_available_for_release=false, updated_at=now()
    where id=(release_result->>'songId')::uuid and composer_id=auth.uid();
  end if;
  return release_result;
end; $$;

revoke execute on function public.issue_release(uuid,text,text,text,boolean,numeric) from public, anon;
grant execute on function public.issue_release(uuid,text,text,text,boolean,numeric) to authenticated;

create or replace function public.issue_release(
  p_request_id uuid, p_release_type text, p_additional_conditions text,
  p_digital_signature text, p_close_song boolean
) returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  return public.issue_release(p_request_id, p_release_type, p_additional_conditions, p_digital_signature, p_close_song, null);
end; $$;

revoke execute on function public.issue_release(uuid,text,text,text,boolean) from public, anon;
grant execute on function public.issue_release(uuid,text,text,text,boolean) to authenticated;

create or replace function public.mark_release_sent(p_release_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_sent_at timestamptz := now();
begin
  update public.releases
  set sent_to_buyer_at = v_sent_at
  where id = p_release_id and composer_id = auth.uid();

  if not found then
    raise exception 'Liberação não encontrada ou você não tem permissão para atualizá-la.';
  end if;

  return v_sent_at;
end;
$$;
revoke execute on function public.mark_release_sent(uuid) from public, anon;
grant execute on function public.mark_release_sent(uuid) to authenticated;

-- Registra uma única versão imutável do PDF emitido.
create or replace function public.register_release_document(
  p_release_id uuid, p_document_path text, p_document_hash text, p_template_version text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null
     or p_document_path not like auth.uid()::text || '/' || p_release_id::text || '/%'
     or p_document_path not like '%.pdf'
     or p_document_hash !~ '^[0-9a-f]{64}$'
     or nullif(btrim(p_template_version),'') is null
     or length(p_template_version)>40 then
    raise exception using errcode='23514', message='Metadados do documento arquivado inválidos.';
  end if;
  if not exists(
    select 1 from storage.objects
    where bucket_id='release-documents'
      and name=p_document_path
      and (owner_id=auth.uid()::text or (storage.foldername(name))[1]=auth.uid()::text)
  ) then
    raise exception using errcode='23514', message='O arquivo informado não foi encontrado no armazenamento privado.';
  end if;
  update public.releases set document_path=p_document_path, document_hash=p_document_hash,
    template_version=btrim(p_template_version), document_archived_at=now()
  where id=p_release_id and composer_id=auth.uid() and document_path is null;
  if not found then raise exception using errcode='23505', message='Documento inexistente ou já arquivado.'; end if;
end; $$;

revoke execute on function public.register_release_document(uuid,text,text,text) from public, anon;
grant execute on function public.register_release_document(uuid,text,text,text) to authenticated;

-- Documentos emitidos podem ser inseridos e lidos pelo dono, mas nunca sobrescritos ou apagados pelo cliente.
drop policy if exists "media owner update" on storage.objects;
create policy "media owner update" on storage.objects for update to authenticated
using(bucket_id in ('profile-media','song-covers','song-previews','song-originals') and (storage.foldername(name))[1]=auth.uid()::text)
with check(bucket_id in ('profile-media','song-covers','song-previews','song-originals') and (storage.foldername(name))[1]=auth.uid()::text);
drop policy if exists "media owner delete" on storage.objects;
create policy "media owner delete" on storage.objects for delete to authenticated
using(bucket_id in ('profile-media','song-covers','song-previews','song-originals') and (storage.foldername(name))[1]=auth.uid()::text);
