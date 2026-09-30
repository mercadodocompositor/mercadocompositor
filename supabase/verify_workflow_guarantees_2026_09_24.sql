-- ==============================================================================
-- Selo final das migrations de Solicitações e Liberações.
-- EXECUTE POR ÚLTIMO. Este arquivo não altera dados: ele interrompe o deploy se
-- uma migration antiga tiver sobrescrito uma garantia mais nova.
-- ==============================================================================

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_interest_request'
    and pg_get_function_identity_arguments(p.oid) = 'p_song_id uuid, p_data jsonb';

  if v_definition is null
     or position('consentAccepted' in v_definition) = 0
     or position('consentPolicyVersion' in v_definition) = 0
     or position('consent_statement' in v_definition) = 0
     or position('consume_rpc_rate_limit' in v_definition) = 0 then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: create_interest_request foi sobrescrita. Reaplique request_consent_evidence_2026_09_24.sql.';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'preserve_interest_request_identity'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_definition is null
     or position('consent_accepted_at' in v_definition) = 0
     or position('consent_policy_version' in v_definition) = 0
     or not exists (
       select 1 from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'interest_requests'
         and t.tgname = 'preserve_interest_request_identity'
         and not t.tgisinternal and t.tgenabled <> 'D'
     ) then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: a evidência de consentimento não está protegida contra alterações.';
  end if;

  if to_regprocedure('public.is_valid_cpf_cnpj(text)') is null
     or not exists (
       select 1 from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'interest_requests'
         and t.tgname = 'require_valid_interest_request_document'
         and not t.tgisinternal and t.tgenabled <> 'D'
     ) then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: a validação de CPF/CNPJ não está instalada ou está desativada.';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'notify_release_issued'
    and pg_get_function_identity_arguments(p.oid) = '';
  if v_definition is null
     or position('issue_release_delivery_token' in v_definition) = 0
     or position('notification_email_outbox' in v_definition) = 0
     or position('delivery_id' in v_definition) = 0
     or not exists (
       select 1 from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'releases'
         and t.tgname = 'notify_release_issued'
         and not t.tgisinternal and t.tgenabled <> 'D'
     ) then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: notify_release_issued foi sobrescrita. Reaplique release_delivery_2026_09_24.sql.';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'issue_release_delivery_token'
    and pg_get_function_identity_arguments(p.oid) = 'p_release_id uuid, p_lyrics text';
  if v_definition is null
     or position('audio_path' in v_definition) = 0
     or to_regprocedure('public.notify_composer_about_delivery(uuid,text)') is null then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: a entrega não congela o áudio da emissão. Reaplique release_delivery_snapshot_2026_09_28.sql.';
  end if;

  if not exists (
    select 1 from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'notification_email_outbox'
      and t.tgname = 'sync_release_delivery_email_status'
      and not t.tgisinternal and t.tgenabled <> 'D'
  ) then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: o status real de entrega não está sincronizado com o outbox.';
  end if;

  -- Um grant de tabela anula a lista de colunas: o compositor passaria a gravar
  -- is_verified, is_featured e os contadores na própria linha pela API.
  if has_table_privilege('authenticated', 'public.profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.songs', 'UPDATE')
     or has_table_privilege('authenticated', 'public.songs', 'INSERT')
     or has_column_privilege('authenticated', 'public.profiles', 'is_verified', 'UPDATE')
     or has_column_privilege('authenticated', 'public.songs', 'is_featured', 'UPDATE') then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: songs ou profiles com escrita ampla para authenticated. Reaplique fix_bloqueadores_2026_09_30.sql.';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'get_featured_composers'
    and pg_get_function_identity_arguments(p.oid) = 'p_limit integer';
  if v_definition is null or position('includes_featured' in v_definition) = 0 then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: get_featured_composers foi sobrescrita. Reaplique featured_composers_2026_09_28.sql.';
  end if;

  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'admin_moderate_song'
    and pg_get_function_identity_arguments(p.oid) = 'p_song_id uuid, p_status text, p_notes text';
  if v_definition is null or position('session_replication_role' in v_definition) > 0 then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: admin_moderate_song desliga os gatilhos de songs. Reaplique fix_bloqueadores_2026_09_30.sql.';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'media owner delete'
      and qual like '%release_deliveries%'
  ) then
    raise exception using errcode = 'P0001',
      message = 'Garantia inválida: o áudio já entregue pode ser apagado. Reaplique release_delivery_snapshot_2026_09_28.sql.';
  end if;
end $$;

select 'workflow_guarantees_ok' as verification;
