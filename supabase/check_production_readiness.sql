-- ==============================================================================
-- MERCADO DO COMPOSITOR — VERIFICAÇÃO DO BANCO ANTES DO LANÇAMENTO
-- ==============================================================================
-- Somente leitura: não altera nenhum dado (cria apenas uma função temporária
-- da sessão, descartada ao fechar a conexão). Rode no SQL Editor do Supabase.
-- Cada linha devolvida é um problema. Resultado vazio = banco pronto.
--
-- As checagens que leem tabelas usam SQL dinâmico: assim uma tabela ausente
-- vira uma linha de problema em vez de abortar a verificação inteira.
-- ==============================================================================

create or replace function pg_temp.check_production_readiness()
returns table(problema text)
language plpgsql
as $$
declare
  fn text;
  tbl text;
  ok boolean;
  required_functions text[] := array[
    -- RPCs chamadas pelo app, Edge Functions e smoke test
    'admin_assign_user_role', 'admin_finalize_account_deletion', 'admin_moderate_song',
    'admin_reveal_pix_key', 'admin_revoke_user_role', 'admin_set_profile_verified',
    'admin_set_song_featured', 'admin_update_deletion_request', 'admin_update_platform_settings',
    'check_plan_capacity', 'create_interest_request', 'get_admin_composers',
    'get_admin_global_releases', 'get_admin_global_requests', 'get_featured_composers',
    'get_featured_songs', 'get_my_dashboard_metrics', 'get_my_release_metrics',
    'get_my_song_stats', 'get_platform_settings', 'get_public_composer',
    'get_public_composers', 'increment_profile_view', 'increment_song_play',
    'issue_release', 'list_interest_requests', 'list_my_releases', 'mark_release_sent',
    'process_mercadopago_payment', 'record_terms_acceptance', 'register_release_document',
    'update_interest_request', 'validate_release_document', 'write_system_audit_log',
    -- Rotinas internas
    'handle_new_user', 'expire_overdue_subscriptions'
  ];
  required_tables text[] := array[
    'profiles', 'private_profiles', 'subscriptions', 'subscription_plans',
    'subscription_payments', 'songs', 'song_drafts', 'interest_requests', 'releases',
    'user_roles', 'platform_settings', 'system_logs', 'user_notifications',
    'validated_media', 'account_deletion_requests', 'composer_daily_metrics'
  ];
begin
  foreach tbl in array required_tables loop
    if to_regclass('public.' || tbl) is null then
      problema := 'Tabela ausente: public.' || tbl;
      return next;
    end if;
  end loop;

  foreach fn in array required_functions loop
    if not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = fn
    ) then
      problema := 'Função ausente: public.' || fn;
      return next;
    end if;
  end loop;

  for tbl in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    problema := 'RLS desligado em public.' || tbl;
    return next;
  end loop;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'system_logs' and column_name = 'id'
      and column_default is null
  ) then
    problema := 'system_logs.id sem default (o webhook de pagamento falha): rode production_readiness_2026_09_18.sql';
    return next;
  end if;

  if to_regclass('public.subscription_plans') is not null then
    execute 'select exists (select 1 from public.subscription_plans where is_active)' into ok;
    if not ok then
      problema := 'Catálogo de planos vazio ou sem plano ativo';
      return next;
    end if;
  end if;

  if to_regclass('public.user_roles') is not null then
    execute 'select exists (select 1 from public.user_roles where role = ''admin'')' into ok;
    if not ok then
      problema := 'Nenhum administrador cadastrado em user_roles';
      return next;
    end if;
  end if;

  for tbl in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname in ('media owner update', 'media owner delete')
      and coalesce(qual, '') not like '%bucket_id%'
  loop
    problema := 'Policy de storage "' || tbl || '" sem filtro de bucket: rode production_readiness_2026_09_18.sql';
    return next;
  end loop;

  if to_regnamespace('cron') is null then
    problema := 'pg_cron não ativado: ative em Integrations > Cron e rode production_readiness_2026_09_18.sql';
    return next;
  else
    execute 'select exists (select 1 from cron.job where jobname = ''expire-overdue-subscriptions'')' into ok;
    if not ok then
      problema := 'Job expire-overdue-subscriptions não agendado: rode production_readiness_2026_09_18.sql';
      return next;
    end if;
  end if;
end;
$$;

select problema from pg_temp.check_production_readiness() order by problema;
