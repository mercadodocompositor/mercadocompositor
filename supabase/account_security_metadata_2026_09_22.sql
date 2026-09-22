-- Metadados mínimos para a central de segurança da própria conta.
create table if not exists public.user_security_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('password_changed')),
  created_at timestamptz not null default now()
);
create index if not exists user_security_events_user_idx
  on public.user_security_events(user_id, event_type, created_at desc);

alter table public.user_security_events enable row level security;
revoke all on table public.user_security_events from anon, authenticated;

create or replace function public.record_my_password_change() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception using errcode='42501', message='Sessão expirada.'; end if;
  insert into public.user_security_events(user_id,event_type) values(auth.uid(),'password_changed');
end $$;

create or replace function public.get_my_security_metadata() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'preferencesUpdatedAt', (select up.updated_at from public.user_preferences up where up.user_id=auth.uid()),
    'passwordChangedAt', (select max(e.created_at) from public.user_security_events e where e.user_id=auth.uid() and e.event_type='password_changed')
  ) where auth.uid() is not null
$$;

revoke execute on function public.record_my_password_change() from public, anon;
revoke execute on function public.get_my_security_metadata() from public, anon;
grant execute on function public.record_my_password_change() to authenticated;
grant execute on function public.get_my_security_metadata() to authenticated;
notify pgrst, 'reload schema';
