-- ==============================================================================
-- MERCADO DO COMPOSITOR — PRIVACIDADE E INTEGRIDADE DO PERFIL (LGPD) (2026-09-22)
-- ==============================================================================
-- 1. get_public_composer deixa de enviar o nome civil (profiles.name) a qualquer
--    visitante. A vitrine usa só o nome artístico; o nome civil vazava no JSON.
--    Também expõe 'isVerified' (substitui public_profile_verified_badge_2026_09_22.sql).
-- 2. Nome civil e CPF ficam travados para o próprio compositor depois que existe
--    ao menos um termo de liberação emitido.
-- 3. Chave PIX validada conforme o tipo (CPF, e-mail, celular, aleatória). Cria as
--    colunas pix_key/pix_key_type se faltarem e migra as chaves de user_preferences.
-- É idempotente: pode ser executada novamente sem efeitos colaterais.

create or replace function public.get_public_composer(p_username text) returns jsonb language sql stable security definer set search_path='' as $$
select jsonb_build_object(
 'profile',jsonb_build_object('username',p.username,'stageName',p.stage_name,'city',p.city,'state',p.state,'bio',p.bio,'experienceYears',p.experience_years,'genres',p.genres,'society',p.society,'spotify',p.spotify,'instagram',p.instagram,'youtube',p.youtube,'website',p.website,'photo',p.photo_url,'coverPhoto',p.cover_photo_url,'viewsCount',p.views_count,'isVerified',p.is_verified),
 'subscriptionStatus',sub.status,
 'songs',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'title',s.title,'genre',s.genre,'subgenre',s.subgenre,'authors',s.authors,'dateComposed',s.date_composed,'dateRegistered',s.date_registered,'lyrics',s.lyrics,'coverUrl',s.cover_url,'registryCode',s.registry_code,'status',s.status,'isAvailableForRelease',s.is_available_for_release,'valueType',s.value_type,'suggestedValue',s.suggested_value,'playCount',s.play_count,'interestedCount',s.interested_count,'summary',s.summary,'previewAudioUrl',s.preview_audio_url)) from public.songs s where s.composer_id=p.user_id and s.status='published' and sub.status='active'),'[]'::jsonb)
) from public.profiles p join public.subscriptions sub on sub.user_id=p.user_id where p.username=p_username and sub.status='active' limit 1
$$;

revoke execute on function public.get_public_composer(text) from public;
grant execute on function public.get_public_composer(text) to anon, authenticated;

-- Bancos criados antes da chave PIX existir em private_profiles guardavam a chave em
-- user_preferences (fallback do app). Cria as colunas e migra esses valores ANTES de
-- ligar a validação, para que chaves antigas não interrompam a migração.
alter table public.private_profiles add column if not exists pix_key text not null default '';
alter table public.private_profiles add column if not exists pix_key_type text not null default 'cpf';

update public.private_profiles pp
set pix_key = btrim(up.preferences->>'pixKey'),
    pix_key_type = case when up.preferences->>'pixKeyType' in ('cpf','email','phone','random')
                        then up.preferences->>'pixKeyType' else 'cpf' end
from public.user_preferences up
where up.user_id = pp.user_id
  and coalesce(btrim(pp.pix_key),'') = ''
  and coalesce(btrim(up.preferences->>'pixKey'),'') <> '';

-- Com a chave nas colunas, o fallback em preferences sairia desatualizado (e
-- reapareceria se o compositor apagasse a chave): remove a cópia antiga.
update public.user_preferences up
set preferences = up.preferences - 'pixKey' - 'pixKeyType'
where (up.preferences ? 'pixKey' or up.preferences ? 'pixKeyType')
  and exists(select 1 from public.private_profiles pp where pp.user_id = up.user_id);

-- Identidade civil congelada após o primeiro termo de liberação: o compositor não
-- altera sozinho o nome civil nem o CPF que já qualificaram documentos emitidos.
-- A equipe (is_admin) e rotinas de serviço (sem auth.uid()) continuam podendo corrigir.
create or replace function public.guard_composer_identity() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  -- A exclusão da conta (delete_my_account) anonimiza o nome com o login do
  -- próprio titular; ela sinaliza isso só dentro da transação.
  if auth.uid() is distinct from new.user_id or public.is_admin()
     or current_setting('app.account_deletion', true) = 'on' then
    return new;
  end if;
  if not exists(select 1 from public.releases r where r.composer_id = new.user_id) then
    return new;
  end if;
  if tg_table_name = 'profiles' then
    if btrim(coalesce(new.name,'')) is distinct from btrim(coalesce(old.name,'')) then
      raise exception using errcode='23514',
        message='O nome civil não pode ser alterado porque já existem termos de liberação emitidos com ele. Fale com o suporte para corrigir.';
    end if;
  elsif regexp_replace(coalesce(new.cpf,''),'[^0-9]','','g') is distinct from regexp_replace(coalesce(old.cpf,''),'[^0-9]','','g') then
    raise exception using errcode='23514',
      message='O CPF não pode ser alterado porque já existem termos de liberação emitidos com ele. Fale com o suporte para corrigir.';
  end if;
  return new;
end $$;
revoke execute on function public.guard_composer_identity() from public, anon, authenticated;

drop trigger if exists guard_profile_identity on public.profiles;
create trigger guard_profile_identity before update of name on public.profiles
  for each row execute function public.guard_composer_identity();
drop trigger if exists guard_private_profile_identity on public.private_profiles;
create trigger guard_private_profile_identity before update of cpf on public.private_profiles
  for each row execute function public.guard_composer_identity();

-- Chave PIX coerente com o tipo informado. Valida apenas quando a chave ou o tipo
-- mudam, para não travar o salvamento de cadastros antigos que ninguém editou.
create or replace function public.validate_private_profile_pix() returns trigger
language plpgsql set search_path='' as $$
declare
  k text := btrim(coalesce(new.pix_key,''));
  digits text := regexp_replace(k,'[^0-9]','','g');
  valid boolean;
begin
  if tg_op = 'UPDATE' and new.pix_key is not distinct from old.pix_key
     and new.pix_key_type is not distinct from old.pix_key_type then
    return new;
  end if;
  if coalesce(new.pix_key_type,'') not in ('cpf','email','phone','random') then
    raise exception using errcode='23514', message='Tipo de chave PIX inválido. Use CPF, e-mail, celular ou chave aleatória.';
  end if;
  if k = '' then
    return new;
  end if;
  if new.pix_key_type = 'phone' and length(digits) in (12,13) and left(digits,2) = '55' then
    digits := substr(digits,3);
  end if;
  valid := case new.pix_key_type
    when 'cpf' then length(digits) = 11 and k ~ '^[0-9.\-\s]+$'
    when 'email' then k ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    when 'phone' then length(digits) in (10,11) and k ~ '^[0-9+()\-\s]+$'
    else k ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  end;
  if not valid then
    raise exception using errcode='23514', message='Chave PIX inválida para o tipo selecionado. Confira os dados e tente novamente.';
  end if;
  return new;
end $$;

drop trigger if exists validate_private_profile_pix on public.private_profiles;
create trigger validate_private_profile_pix before insert or update of pix_key, pix_key_type on public.private_profiles
  for each row execute function public.validate_private_profile_pix();

notify pgrst, 'reload schema';

-- Conferência:
-- select public.get_public_composer('<username>') -> 'profile' ? 'name';   -- deve ser false
-- select tgname from pg_trigger where tgname in ('guard_profile_identity','guard_private_profile_identity','validate_private_profile_pix');
