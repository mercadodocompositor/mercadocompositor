-- =============================================================================
-- MERCADO DO COMPOSITOR — HISTÓRICO DE ENDEREÇOS PÚBLICOS (2026-09-28)
-- =============================================================================
-- Ao trocar o endereço público, os links já divulgados (/compositor/antigo e
-- os links das músicas) passavam a dar "não encontrado". Agora:
--   * o endereço anterior fica guardado por 180 dias;
--   * get_public_composer resolve o endereço antigo para o perfil atual, e o
--     site redireciona para o endereço novo;
--   * nesse período o endereço antigo fica reservado: outro compositor não pode
--     usá-lo e herdar os links divulgados de outra pessoa.
-- Exclusão de conta apaga o histórico do titular (nada de redirecionar para uma
-- conta removida). É idempotente.
-- Depende de is_username_available (username_availability_2026_09_28.sql).

create table if not exists public.username_history (
  old_username citext primary key,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  changed_at timestamptz not null default now()
);
create index if not exists username_history_user_idx on public.username_history(user_id);
alter table public.username_history enable row level security;
-- Sem políticas: só as funções security definer abaixo leem ou escrevem.
revoke all on table public.username_history from anon, authenticated;

create or replace function public.track_username_change() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if new.username is not distinct from old.username then
    return new;
  end if;

  -- Exclusão de conta (pelo titular ou finalizada pelo admin): os endereços
  -- antigos deixam de apontar para a pessoa e ficam livres.
  if current_setting('app.account_deletion', true) = 'on'
     or new.username::text like 'usuario-removido-%' then
    delete from public.username_history where user_id = new.user_id;
    return new;
  end if;

  if exists(
    select 1 from public.username_history h
    where lower(h.old_username::text) = lower(new.username::text)
      and h.user_id <> new.user_id
      and h.changed_at > now() - interval '180 days'
  ) then
    raise exception using errcode='23505',
      message='O endereço público (username) foi usado recentemente por outro compositor e ainda está reservado. Escolha outro.';
  end if;

  -- Voltar a um endereço próprio antigo: ele deixa de ser histórico.
  delete from public.username_history
  where lower(old_username::text) = lower(new.username::text) and user_id = new.user_id;

  insert into public.username_history(old_username, user_id, changed_at)
  values (old.username, new.user_id, now())
  on conflict (old_username) do update set user_id = excluded.user_id, changed_at = excluded.changed_at;

  return new;
end $$;
revoke execute on function public.track_username_change() from public, anon, authenticated;
drop trigger if exists track_username_change on public.profiles;
create trigger track_username_change before update of username on public.profiles
  for each row execute function public.track_username_change();

-- Disponibilidade: também recusa endereços reservados por outro compositor.
create or replace function public.is_username_available(p_username text)
returns boolean language sql stable security definer set search_path='' as $$
  select case
    when p_username is null or length(btrim(p_username)) not between 3 and 60 then false
    else not exists(
      select 1 from public.profiles p
      where lower(p.username::text) = lower(btrim(p_username))
        and p.user_id is distinct from auth.uid()
    ) and not exists(
      select 1 from public.username_history h
      where lower(h.old_username::text) = lower(btrim(p_username))
        and h.user_id is distinct from auth.uid()
        and h.changed_at > now() - interval '180 days'
    )
  end
$$;
revoke execute on function public.is_username_available(text) from public, anon;
grant execute on function public.is_username_available(text) to authenticated;

-- Perfil público: endereço atual ou, se não houver, o antigo dos últimos 180
-- dias. O objeto devolvido traz sempre o endereço atual em profile.username;
-- o site compara com o endereço pedido e redireciona.
create or replace function public.get_public_composer(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
with target as (
  select coalesce(
    (select p.user_id from public.profiles p where p.username = p_username),
    (select h.user_id from public.username_history h
      where h.old_username = p_username and h.changed_at > now() - interval '180 days')
  ) as user_id
)
select jsonb_build_object(
 'profile',jsonb_build_object('username',p.username,'stageName',p.stage_name,'city',p.city,'state',p.state,'bio',p.bio,'experienceYears',p.experience_years,'genres',p.genres,'society',p.society,'spotify',p.spotify,'instagram',p.instagram,'youtube',p.youtube,'website',p.website,'photo',p.photo_url,'coverPhoto',p.cover_photo_url,'viewsCount',p.views_count,'isVerified',p.is_verified),
 'subscriptionStatus',sub.status,
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'genre',s.genre,'subgenre',s.subgenre,'authors',s.authors,'dateComposed',s.date_composed,'dateRegistered',s.date_registered,'lyrics',s.lyrics,'coverUrl',s.cover_url,'registryCode',s.registry_code,'status',s.status,'isAvailableForRelease',s.is_available_for_release,'valueType',s.value_type,'suggestedValue',s.suggested_value,'playCount',s.play_count,'interestedCount',s.interested_count,'summary',s.summary,'previewAudioUrl',s.preview_audio_url)) from public.songs s where s.composer_id=p.user_id and s.status='published' and sub.status='active'),'[]'::jsonb)
) from target t
  join public.profiles p on p.user_id=t.user_id
  join public.subscriptions sub on sub.user_id=p.user_id
where sub.status='active' limit 1
$$;
grant execute on function public.get_public_composer(text) to anon,authenticated;

notify pgrst, 'reload schema';

-- Conferência:
-- select * from public.username_history order by changed_at desc limit 20;
