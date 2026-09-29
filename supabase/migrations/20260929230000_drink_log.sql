-- Owner-only drink log: one row per logged round of drinks.

create table if not exists public.drink_log (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  drank_at timestamptz not null default now(),
  drinks numeric(4,1) not null check (drinks > 0 and drinks <= 30),
  kind text not null default 'Other' check (char_length(kind) <= 40),
  created_at timestamptz not null default now()
);

create index if not exists drink_log_user_time on public.drink_log (user_id, drank_at desc);

alter table public.drink_log enable row level security;
revoke all on table public.drink_log from anon, authenticated;
grant select, insert, delete on table public.drink_log to authenticated;

drop policy if exists "Read own drinks" on public.drink_log;
create policy "Read own drinks" on public.drink_log
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Log own drinks" on public.drink_log;
create policy "Log own drinks" on public.drink_log
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Delete own drinks" on public.drink_log;
create policy "Delete own drinks" on public.drink_log
  for delete to authenticated
  using (user_id = (select auth.uid()));
