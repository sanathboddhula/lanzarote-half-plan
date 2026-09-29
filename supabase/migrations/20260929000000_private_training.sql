-- Apply to the dedicated Supabase project before signing in to the GitHub Pages site.
-- The public GitHub repository never contains the personalized plan HTML or progress.

create table if not exists public.private_plan_html (
  user_id uuid primary key references auth.users(id) on delete cascade,
  html text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.training_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  profile jsonb not null default '{}'::jsonb,
  checks jsonb not null default '{}'::jsonb,
  return_date date,
  strong_summary text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.private_plan_html enable row level security;
alter table public.training_state enable row level security;

revoke all on table public.private_plan_html from anon, authenticated;
revoke all on table public.training_state from anon, authenticated;
grant select, insert, update on table public.private_plan_html to authenticated;
grant select, insert, update on table public.training_state to authenticated;

drop policy if exists "Read own private plan" on public.private_plan_html;
create policy "Read own private plan" on public.private_plan_html
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Create own private plan" on public.private_plan_html;
create policy "Create own private plan" on public.private_plan_html
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Update own private plan" on public.private_plan_html;
create policy "Update own private plan" on public.private_plan_html
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "Read own training state" on public.training_state;
create policy "Read own training state" on public.training_state
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Create own training state" on public.training_state;
create policy "Create own training state" on public.training_state
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "Update own training state" on public.training_state;
create policy "Update own training state" on public.training_state
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit)
values ('training-exports', 'training-exports', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "Read own training exports" on storage.objects;
create policy "Read own training exports" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'training-exports'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );

drop policy if exists "Upload own training exports" on storage.objects;
create policy "Upload own training exports" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'training-exports'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
  );
