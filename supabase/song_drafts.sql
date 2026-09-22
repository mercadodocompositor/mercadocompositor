-- Rascunhos privados e sincronizados da tela dashboard/musicas/nova.
-- Execute no SQL Editor do Supabase antes de publicar o frontend correspondente.
create table if not exists public.song_drafts (
  user_id uuid not null references auth.users(id) on delete cascade,
  draft_key text not null check(length(draft_key) between 1 and 100),
  payload jsonb not null check(octet_length(payload::text) <= 100000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id,draft_key)
);

alter table public.song_drafts enable row level security;
drop policy if exists "song drafts owner" on public.song_drafts;
create policy "song drafts owner"
on public.song_drafts for all
to authenticated
using(auth.uid()=user_id)
with check(auth.uid()=user_id);

revoke all on table public.song_drafts from anon;
grant select, insert, update, delete on table public.song_drafts to authenticated;
