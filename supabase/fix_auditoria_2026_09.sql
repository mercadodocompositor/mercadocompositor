-- ==============================================================================
-- MERCADO DO COMPOSITOR — CORREÇÕES DA AUDITORIA PONTA A PONTA (2026-09)
-- ==============================================================================
-- Execute este script INTEIRO no SQL Editor do Supabase, DEPOIS de
-- update_all_migrations.sql. É idempotente: pode rodar várias vezes.
--
-- Ele é o último script da pilha e resolve, em ordem:
--   1. process_mercadopago_payment gravava notificação em colunas inexistentes
--      e abortava toda a transação do pagamento aprovado;
--   2. fix_song_insert_permissions.sql tinha devolvido `grant all` em songs e
--      profiles, permitindo ao compositor editar is_verified, is_featured e os
--      contadores de reprodução pela API REST;
--   3. handle_new_user não existia em update_all_migrations.sql (cadastro sem
--      perfil/assinatura) e tinha três versões divergentes nos patches;
--   4. desativar um plano no painel travava até o salvamento de rascunho dos
--      assinantes daquele plano;
--   5. voltar uma obra para rascunho apagava capa, prévia e áudio original;
--   6. a vitrine de músicas em destaque da home era sempre vazia para
--      visitantes (songs não tem policy de leitura pública);
--   7. admin_moderate_song desligava todos os triggers da tabela songs via
--      session_replication_role (que costuma exigir superusuário);
--   8. o rate limit dos RPCs públicos usava o JSON inteiro de headers como
--      identidade, então variar o User-Agent zerava o limite;
--   9. a central de notificações nunca recebia nada de verdade.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0. PRÉ-REQUISITOS
-- ------------------------------------------------------------------------------
create extension if not exists citext;
create extension if not exists pgcrypto;

-- Identidade estável para rate limit: só o primeiro salto de x-forwarded-for.
-- Antes a identidade incluía `current_setting('request.headers')` inteiro — o
-- JSON com todos os headers —, então qualquer variação de User-Agent abria um
-- novo bucket e o limite deixava de existir.
create or replace function public.rpc_client_identity()
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  headers json;
  forwarded text;
begin
  if auth.uid() is not null then
    return 'uid:' || auth.uid()::text;
  end if;
  begin
    headers := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    headers := null;
  end;
  forwarded := btrim(split_part(coalesce(headers->>'x-forwarded-for', ''), ',', 1));
  if forwarded = '' then
    forwarded := coalesce(headers->>'cf-connecting-ip', headers->>'x-real-ip', '');
  end if;
  return 'ip:' || coalesce(nullif(forwarded, ''), 'unknown');
end $$;

revoke execute on function public.rpc_client_identity() from public, anon, authenticated;

-- ------------------------------------------------------------------------------
-- 1. SEGURANÇA DE COLUNAS EM songs E profiles
-- ------------------------------------------------------------------------------
-- `fix_song_insert_permissions.sql` fazia `grant select, insert, update, delete
-- on public.songs` e `grant select, update on public.profiles`, anulando os
-- grants por coluna. Com a RLS liberando a própria linha, o compositor podia
-- dar PATCH em profiles.is_verified (selo de verificado), profiles.views_count,
-- songs.play_count, songs.interested_count e songs.is_featured (destaque
-- editorial na home). O privilégio volta a ser por coluna.
revoke insert, update on table public.profiles from anon, authenticated;
grant select on table public.profiles to anon, authenticated;
grant update (
  username, name, stage_name, city, state, bio, experience_years, genres,
  instagram, youtube, website, photo_url, cover_photo_url, society, spotify,
  updated_at
) on table public.profiles to authenticated;

revoke insert, update on table public.songs from anon, authenticated;
grant select, delete on table public.songs to authenticated;
grant insert (
  id, composer_id, title, genre, subgenre, authors, date_composed,
  date_registered, lyrics, cover_url, registry_code, notes, status,
  is_available_for_release, value_type, suggested_value, summary,
  original_audio_path, preview_audio_url, original_media_id, preview_media_id,
  created_at, updated_at
) on table public.songs to authenticated;
grant update (
  title, genre, subgenre, authors, date_composed, date_registered, lyrics,
  cover_url, registry_code, notes, status, is_available_for_release,
  value_type, suggested_value, summary, original_audio_path,
  preview_audio_url, original_media_id, preview_media_id, updated_at
) on table public.songs to authenticated;

-- ------------------------------------------------------------------------------
-- 1.1 CATÁLOGO MÍNIMO DE PLANOS
-- ------------------------------------------------------------------------------
-- `subscriptions.plan_name` é FK de `subscription_plans(name)`: com o catálogo
-- vazio, o próprio cadastro falha. Preços e limites existentes são preservados.
insert into public.subscription_plans(name, monthly_price, max_songs, is_active, sort_order, description, features)
values
  ('Plano Bronze', 24.90, 100, true, 1, 'Plano inicial ideal para compositores',
   array['Até 100 músicas publicadas', 'Liberação direta com termo PDF', 'Estatísticas de reprodução']),
  ('Plano Prata', 34.90, 200, true, 2, 'Catálogo ampliado para compositores ativos',
   array['Até 200 músicas publicadas', 'Prioridade nas buscas', 'Liberação direta com termo PDF']),
  ('Plano Ouro', 54.90, null, true, 3, 'Acesso total e ilimitado para profissionais da música',
   array['Catálogo ilimitado de músicas', 'Selo de compositor verificado', 'Destaque editorial', 'Suporte prioritário'])
on conflict (name) do nothing;

-- ------------------------------------------------------------------------------
-- 2. PROVISIONAMENTO DE CONTA (handle_new_user)
-- ------------------------------------------------------------------------------
-- Versão canônica única. Três scripts definiam esta função de formas
-- diferentes e o script consolidado não a definia — num projeto novo o signup
-- criava a linha em auth.users sem perfil, sem assinatura e sem papel, e o
-- painel ficava inacessível.
--
-- A conta nasce com o plano escolhido, mas com assinatura 'pending'. Somente o
-- webhook do Mercado Pago ativa o teste grátis ou um pagamento confirmado.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  p jsonb := coalesce(new.raw_user_meta_data->'profile', '{}'::jsonb);
  base_username text;
  candidate_username text;
  counter integer := 1;
  chosen_plan text;
  chosen_price text;
  reserved text[] := array[
    'admin','administrador','dashboard','login','cadastro','termos',
    'privacidade','autenticacao','validar-documento','validar','suporte','api',
    'app','root','sistema','oficial','mercadodocompositor','compositores',
    'compositor','recuperar-senha'
  ];
begin
  base_username := coalesce(
    nullif(p->>'username', ''),
    nullif(new.raw_user_meta_data->>'preferred_username', ''),
    'compositor-' || substr(new.id::text, 1, 8)
  );

  base_username := lower(regexp_replace(base_username, '[^a-zA-Z0-9_-]', '-', 'g'));
  base_username := regexp_replace(base_username, '-+', '-', 'g');
  base_username := btrim(base_username, '-');

  -- Um nome como "Admin" gerava o slug `admin` e sequestrava /compositor/admin.
  -- A lista de reservados existia só no cliente (RESERVED_USERNAMES) e nunca
  -- era aplicada no cadastro.
  if length(base_username) < 3 or base_username = any(reserved) then
    base_username := 'compositor-' || substr(new.id::text, 1, 8);
  end if;

  candidate_username := base_username;
  while exists (select 1 from public.profiles where username = candidate_username) loop
    candidate_username := base_username || '-' || substr(new.id::text, 1, 4) || counter::text;
    counter := counter + 1;
  end loop;

  insert into public.profiles(
    user_id, username, name, stage_name, city, state, bio, experience_years,
    genres, instagram, youtube, website, photo_url, cover_photo_url
  ) values (
    new.id, candidate_username,
    coalesce(nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(nullif(p->>'stageName', ''), nullif(p->>'name', ''), new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    coalesce(p->>'city', ''), coalesce(p->>'state', ''), coalesce(p->>'bio', ''), coalesce(p->>'experienceYears', ''),
    coalesce(array(select jsonb_array_elements_text(coalesce(p->'genres', '[]'::jsonb))), '{}'),
    coalesce(p->>'instagram', ''), coalesce(p->>'youtube', ''), coalesce(p->>'website', ''),
    coalesce(nullif(p->>'photo', ''), new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture', ''),
    coalesce(p->>'coverPhoto', '')
  ) on conflict (user_id) do nothing;

  insert into public.private_profiles(user_id, email, whatsapp, cpf)
  values (new.id, coalesce(new.email, ''), coalesce(p->>'whatsapp', ''), coalesce(p->>'cpf', ''))
  on conflict (user_id) do nothing;

  -- O plano escolhido no cadastro chega como metadado do signUp. Só é aceito se
  -- existir e estiver ativo no catálogo: o nome é FK de subscriptions.plan_name
  -- e um valor inválido faria o cadastro inteiro falhar.
  chosen_plan := nullif(new.raw_user_meta_data->>'selected_plan', '');
  if chosen_plan is null or not exists (
    select 1 from public.subscription_plans where name = chosen_plan and is_active
  ) then
    select name into chosen_plan
    from public.subscription_plans
    where is_active
    order by sort_order, monthly_price
    limit 1;
  end if;
  chosen_plan := coalesce(chosen_plan, 'Plano Bronze');

  select replace(to_char(monthly_price, 'FM999990.00'), '.', ',')
    into chosen_price
    from public.subscription_plans
   where name = chosen_plan;
  chosen_price := coalesce(nullif(new.raw_user_meta_data->>'monthly_price', ''), chosen_price, '0,00');

  insert into public.subscriptions(user_id, status, plan_name, monthly_price)
  values (new.id, 'pending', chosen_plan, chosen_price)
  on conflict (user_id) do nothing;

  insert into public.user_roles(user_id, role)
  values (new.id, 'composer')
  on conflict do nothing;

  insert into public.user_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_data on auth.users;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Aceite dos termos marcado no cadastro (o signUp acontece sem sessão).
create table if not exists public.terms_acceptances (
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, terms_version)
);
alter table public.terms_acceptances enable row level security;
drop policy if exists "terms own read" on public.terms_acceptances;
create policy "terms own read" on public.terms_acceptances
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "terms own insert" on public.terms_acceptances;
create policy "terms own insert" on public.terms_acceptances
  for insert with check (auth.uid() = user_id);
grant select, insert on table public.terms_acceptances to authenticated;

create or replace function public.handle_new_user_terms() returns trigger
language plpgsql security definer set search_path='' as $$
declare v text := nullif(btrim(coalesce(new.raw_user_meta_data->>'terms_version','')),'');
begin
  if v is not null then
    insert into public.terms_acceptances(user_id, terms_version)
    values (new.id, v)
    on conflict do nothing;
  end if;
  return new;
end $$;

drop trigger if exists on_auth_user_created_terms on auth.users;
create trigger on_auth_user_created_terms after insert on auth.users
  for each row execute procedure public.handle_new_user_terms();

-- Backfill para contas que ficaram sem provisionamento.
insert into public.profiles(user_id, username, name, stage_name)
select u.id, 'compositor-' || substr(u.id::text, 1, 8),
  coalesce(u.raw_user_meta_data->'profile'->>'name', ''),
  coalesce(u.raw_user_meta_data->'profile'->>'stageName', u.raw_user_meta_data->'profile'->>'name', '')
from auth.users u on conflict (user_id) do nothing;
insert into public.private_profiles(user_id, email)
select u.id, coalesce(u.email, '') from auth.users u on conflict (user_id) do nothing;
insert into public.subscriptions(user_id) select id from auth.users on conflict (user_id) do nothing;
insert into public.user_roles(user_id, role) select id, 'composer' from auth.users on conflict do nothing;
insert into public.user_preferences(user_id) select id from auth.users on conflict (user_id) do nothing;

-- ------------------------------------------------------------------------------
-- 3. REGRAS DE ESCRITA DE OBRAS
-- ------------------------------------------------------------------------------
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
  admin_actor := public.is_admin();

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

-- ------------------------------------------------------------------------------
-- 5. VITRINE PÚBLICA DE MÚSICAS EM DESTAQUE
-- ------------------------------------------------------------------------------
-- A home consultava a tabela `songs` direto. Como a única policy de SELECT é
-- "songs owner or admin", o visitante recebia lista vazia (sem erro): a seção
-- de destaques só aparecia para um admin logado e o botão "destacar música" do
-- painel não tinha efeito público nenhum.
create or replace function public.get_featured_songs(p_limit integer default 6)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(featured) - 'rank' order by featured.rank), '[]'::jsonb)
  from (
    select s.id, s.composer_id, s.title, s.genre, s.subgenre, s.authors,
           s.date_composed, s.date_registered, s.cover_url, s.status,
           s.is_available_for_release, s.value_type, s.suggested_value,
           s.play_count, s.interested_count, s.summary, s.preview_audio_url,
           s.is_featured,
           -- Letra e caminho do áudio original ficam fora: a vitrine é pública.
           '' as lyrics,
           row_number() over (order by s.play_count desc, s.created_at desc) as rank
    from public.songs s
    join public.subscriptions sub on sub.user_id = s.composer_id and sub.status = 'active'
    where s.is_featured
      and s.status = 'published'
      and s.is_available_for_release
      and nullif(btrim(coalesce(s.preview_audio_url, '')), '') is not null
    order by s.play_count desc, s.created_at desc
    limit greatest(1, least(coalesce(p_limit, 6), 24))
  ) featured;
$$;

revoke execute on function public.get_featured_songs(integer) from public;
grant execute on function public.get_featured_songs(integer) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. MODERAÇÃO ADMINISTRATIVA DE OBRAS
-- ------------------------------------------------------------------------------
-- `set local session_replication_role = 'replica'` costuma exigir superusuário
-- no Supabase (a função falharia com "permission denied to set parameter",
-- deixando a moderação inteira inoperante) e, quando funciona, desliga também
-- as validações de mídia e de assinatura ativa — podendo publicar obra sem
-- prévia. Aqui a moderação é um UPDATE normal: os triggers rodam e reconhecem
-- o admin via is_admin().
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
-- 7. RPCs PÚBLICOS: RATE LIMIT COM IDENTIDADE ESTÁVEL + NOTIFICAÇÃO REAL
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

-- Solicitação de interesse: mesma validação, identidade de rate limit estável e
-- notificação para o compositor (que antes só descobria o pedido ao logar).
-- LEGADO: esta definição não registra consentimento. Em deploys atuais, execute
-- request_consent_evidence_2026_09_24.sql depois deste arquivo.
create or replace function public.create_interest_request(p_song_id uuid, p_data jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  owner_id uuid;
  new_id uuid;
  email_value text;
  document_digits text;
  phone_digits text;
  origin_value text;
  song_title text;
begin
  email_value := lower(btrim(coalesce(p_data->>'buyerEmail','')));
  document_digits := regexp_replace(coalesce(p_data->>'cpfCnpj',''),'[^0-9]','','g');
  phone_digits := regexp_replace(coalesce(p_data->>'buyerWhatsapp',''),'[^0-9]','','g');
  origin_value := public.rpc_client_identity();

  if length(btrim(coalesce(p_data->>'buyerName',''))) not between 2 and 160
     or email_value !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     or length(document_digits) not in (11,14)
     or length(phone_digits) not between 10 and 13
     or length(btrim(coalesce(p_data->>'buyerCityState',''))) not between 3 and 160
     or length(btrim(coalesce(p_data->>'purpose',''))) not between 3 and 300
     or length(btrim(coalesce(p_data->>'message',''))) not between 20 and 3000 then
    raise exception using errcode='23514', message='Dados da solicitação inválidos.';
  end if;

  if not public.consume_rpc_rate_limit('interest-person-'||p_song_id, email_value||':'||document_digits, 3, 3600)
     or not public.consume_rpc_rate_limit('interest-origin', origin_value, 30, 3600) then
    raise exception using errcode='P0001', message='Limite de solicitações atingido. Tente novamente mais tarde.';
  end if;

  select s.composer_id, s.title into owner_id, song_title
  from public.songs s
  join public.subscriptions sub on sub.user_id = s.composer_id and sub.status = 'active'
  where s.id = p_song_id and s.status = 'published' and s.is_available_for_release;

  if owner_id is null then
    raise exception using errcode='P0002', message='Esta música não está disponível para solicitações.';
  end if;

  insert into public.interest_requests(
    song_id, composer_id, buyer_name, buyer_stage_name, cpf_cnpj, buyer_email,
    buyer_whatsapp, buyer_city_state, purpose, message
  ) values (
    p_song_id, owner_id, p_data->>'buyerName', p_data->>'buyerStageName',
    p_data->>'cpfCnpj', p_data->>'buyerEmail', p_data->>'buyerWhatsapp',
    p_data->>'buyerCityState', p_data->>'purpose', p_data->>'message'
  ) returning id into new_id;

  update public.songs set interested_count = interested_count + 1 where id = p_song_id;

  insert into public.user_notifications(user_id, title, message, type, is_read, link)
  values (
    owner_id,
    'Nova solicitação de interesse',
    format('%s demonstrou interesse na obra "%s".', btrim(p_data->>'buyerName'), coalesce(song_title, '')),
    'request',
    false,
    '/dashboard/solicitacoes'
  );

  return new_id;
end $$;
revoke execute on function public.create_interest_request(uuid,jsonb) from public;
grant execute on function public.create_interest_request(uuid,jsonb) to anon, authenticated;

-- ------------------------------------------------------------------------------
-- 8. PAGAMENTOS MERCADO PAGO
-- ------------------------------------------------------------------------------
-- Correções sobre a versão de mercadopago_integration.sql:
--   * a notificação usava as colunas `read` e `created_at` (a coluna é
--     `is_read`) e o tipo 'success' (o check aceita apenas request/release/
--     moderation/system). O insert lançava exceção e, por ser transacional,
--     derrubava TODO o processamento: o pagamento aprovado não era registrado
--     em subscription_payments, sem idempotência, sem fatura e sem auditoria;
--   * a auditoria em system_logs usava as colunas `user` e `ip`, que não
--     existem (são `actor` e nenhuma), e vinha do webhook com o erro engolido;
--   * renovação antecipada jogava next_billing_date para hoje+30, descartando
--     os dias restantes do ciclo pago;
--   * estorno, contestação e cancelamento não mexiam na assinatura, que ficava
--     ativa para sempre depois do primeiro pagamento aprovado;
--   * monthly_price era gravado com ponto ('24.90') enquanto o default do
--     schema usa vírgula ('24,90'), e a tela imprimia o valor cru.
create or replace function public.process_mercadopago_payment(
  p_user_id uuid,
  p_mp_payment_id text,
  p_status text,
  p_status_detail text,
  p_payment_method text,
  p_payment_type text,
  p_card_last4 text,
  p_card_brand text,
  p_transaction_amount numeric,
  p_plan_name text,
  p_paid_at timestamptz,
  p_raw_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_next_billing_date date;
  v_current_next_billing date;
  v_invoice jsonb;
  v_current_invoices jsonb;
  v_updated_invoices jsonb;
  v_plan_name text;
  v_already_approved boolean;
begin
  if not exists (select 1 from public.profiles where user_id = p_user_id) then
    raise exception using errcode = 'P0002',
      message = format('Usuário %s não encontrado para vincular o pagamento.', p_user_id);
  end if;

  -- O nome do plano é FK de subscriptions.plan_name: um valor desconhecido
  -- (plano renomeado entre o checkout e a notificação) abortaria a transação.
  select name into v_plan_name from public.subscription_plans where name = p_plan_name;
  if v_plan_name is null then
    select plan_name into v_plan_name from public.subscriptions where user_id = p_user_id;
  end if;
  v_plan_name := coalesce(v_plan_name, 'Plano Bronze');

  -- Idempotência: reentrega do mesmo evento não deve gerar fatura duplicada
  -- nem estender a validade outra vez.
  select status = 'approved' into v_already_approved
  from public.subscription_payments
  where mp_payment_id = p_mp_payment_id;

  insert into public.subscription_payments (
    user_id, mp_payment_id, status, status_detail, payment_method, payment_type,
    card_last4, card_brand, transaction_amount, plan_name, paid_at, raw_payload, updated_at
  ) values (
    p_user_id, p_mp_payment_id, p_status, p_status_detail, p_payment_method, p_payment_type,
    p_card_last4, p_card_brand, coalesce(p_transaction_amount, 0), v_plan_name, p_paid_at,
    coalesce(p_raw_payload, '{}'::jsonb), now()
  )
  on conflict (mp_payment_id) do update set
    status = excluded.status,
    status_detail = excluded.status_detail,
    paid_at = coalesce(excluded.paid_at, public.subscription_payments.paid_at),
    raw_payload = excluded.raw_payload,
    updated_at = now();

  if p_status = 'approved' then
    if coalesce(v_already_approved, false) then
      return jsonb_build_object('success', true, 'status', 'active', 'idempotent', true,
        'message', 'Pagamento já processado anteriormente.');
    end if;

    -- Renovação antecipada preserva os dias restantes do ciclo já pago.
    select next_billing_date into v_current_next_billing
    from public.subscriptions where user_id = p_user_id;
    v_next_billing_date := greatest(coalesce(v_current_next_billing, current_date), current_date) + interval '30 days';

    v_invoice := jsonb_build_object(
      'id', p_mp_payment_id,
      'date', to_char(coalesce(p_paid_at, now()), 'YYYY-MM-DD'),
      'value', coalesce(p_transaction_amount, 0),
      'status', 'pago'
    );

    select coalesce(invoices, '[]'::jsonb) into v_current_invoices
    from public.subscriptions where user_id = p_user_id;

    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_current_invoices, '[]'::jsonb)) elem
      where elem->>'id' = p_mp_payment_id
    ) then
      v_updated_invoices := coalesce(v_current_invoices, '[]'::jsonb) || jsonb_build_array(v_invoice);
    else
      v_updated_invoices := v_current_invoices;
    end if;

    update public.subscriptions set
      status = 'active',
      plan_name = v_plan_name,
      -- Mesmo formato do default do schema ('24,90').
      monthly_price = replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
      payment_method = case
        when p_payment_method ilike '%pix%' or p_payment_type = 'bank_transfer' then 'Pix'
        else 'Cartão de Crédito'
      end,
      card_last4 = p_card_last4,
      card_brand = p_card_brand,
      next_billing_date = v_next_billing_date,
      invoices = v_updated_invoices,
      updated_at = now()
    where user_id = p_user_id;

    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (
      p_user_id,
      'Assinatura ativada',
      format('Seu pagamento do %s foi aprovado. O catálogo e os recursos do plano já estão liberados.', v_plan_name),
      'system',
      false,
      '/dashboard/assinatura'
    );

    insert into public.system_logs(category, title, description, actor, status)
    values (
      'financial',
      format('Pagamento Mercado Pago aprovado (%s)', v_plan_name),
      format('Pagamento #%s de R$ %s confirmado. Assinatura ativa até %s.',
        p_mp_payment_id,
        replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
        to_char(v_next_billing_date, 'DD/MM/YYYY')),
      p_user_id::text,
      'success'
    );

    return jsonb_build_object(
      'success', true,
      'status', 'active',
      'plan_name', v_plan_name,
      'next_billing_date', v_next_billing_date
    );
  end if;

  -- Estorno e contestação suspendem a assinatura: antes ela permanecia ativa
  -- para sempre depois do primeiro pagamento aprovado.
  if p_status in ('refunded', 'charged_back') then
    update public.subscriptions
    set status = 'suspended', updated_at = now()
    where user_id = p_user_id and status = 'active';

    insert into public.user_notifications(user_id, title, message, type, is_read, link)
    values (
      p_user_id,
      'Assinatura suspensa',
      format('O pagamento #%s foi %s. Seu perfil público e suas obras ficaram ocultos até a regularização.',
        p_mp_payment_id,
        case p_status when 'refunded' then 'estornado' else 'contestado' end),
      'system',
      false,
      '/dashboard/assinatura'
    );

    insert into public.system_logs(category, title, description, actor, status)
    values ('financial', 'Assinatura suspensa por estorno/contestação',
      format('Pagamento #%s com status %s. Assinatura do usuário %s suspensa.', p_mp_payment_id, p_status, p_user_id),
      p_user_id::text, 'warning');

    return jsonb_build_object('success', true, 'status', 'suspended', 'mp_status', p_status);
  end if;

  insert into public.system_logs(category, title, description, actor, status)
  values ('financial', format('Pagamento Mercado Pago: %s', p_status),
    format('Pagamento #%s de R$ %s (%s) registrado com status %s.',
      p_mp_payment_id,
      replace(to_char(coalesce(p_transaction_amount, 0), 'FM999990.00'), '.', ','),
      v_plan_name, p_status),
    p_user_id::text, 'info');

  return jsonb_build_object(
    'success', true,
    'status', p_status,
    'message', 'Pagamento registrado sem alteração imediata da assinatura.'
  );
end;
$$;

revoke execute on function public.process_mercadopago_payment(
  uuid, text, text, text, text, text, text, text, numeric, text, timestamptz, jsonb
) from public, anon, authenticated;

notify pgrst, 'reload schema';
notify pgrst, 'reload config';

-- ==============================================================================
-- FIM. Depois de executar:
--   * publique de novo as Edge Functions (o webhook mudou):
--       supabase functions deploy mercadopago-webhook
--   * confirme no painel do Supabase que mercadopago-webhook está com
--     "Verify JWT" DESLIGADO — com ele ligado o Mercado Pago recebe 401 e
--     nenhum pagamento é processado;
--   * NÃO execute mais fix_song_insert_permissions.sql: ele reverte o item 1
--     e devolve ao compositor a permissão de editar is_verified/is_featured e
--     os contadores. O arquivo foi neutralizado no repositório.
-- ==============================================================================
