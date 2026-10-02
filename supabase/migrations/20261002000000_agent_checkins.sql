-- Untrusted, append-only check-ins from an external agent. The agent uses only
-- the site's public publishable key; it never receives an owner or secret key.
create table public.agent_checkins (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  checkin_date date not null,
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index agent_checkins_owner_date on public.agent_checkins
  (user_id, checkin_date desc, created_at desc);

-- Assign the sole plan owner on the server. An anonymous writer cannot choose
-- a user_id, and writes fail closed if the project has zero or multiple owners.
create schema if not exists app_private;
revoke all on schema app_private from public;

create function app_private.assign_checkin_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  plan_owners uuid[];
begin
  select array_agg(user_id) into plan_owners from public.private_plan_html;
  if plan_owners is null or cardinality(plan_owners) <> 1 then
    raise exception 'Check-in owner is not configured';
  end if;
  new.user_id := plan_owners[1];
  return new;
end;
$$;

revoke all on function app_private.assign_checkin_owner() from public;
create trigger assign_checkin_owner_before_insert
  before insert on public.agent_checkins
  for each row execute function app_private.assign_checkin_owner();

alter table public.agent_checkins enable row level security;
revoke all on table public.agent_checkins from anon, authenticated;
grant insert (checkin_date, body) on public.agent_checkins to anon;
grant select, delete on public.agent_checkins to authenticated;

create policy "Submit agent check-in" on public.agent_checkins
  for insert to anon with check (true);

create policy "Read own agent check-ins" on public.agent_checkins
  for select to authenticated using (user_id = (select auth.uid()));

create policy "Remove own agent check-ins" on public.agent_checkins
  for delete to authenticated using (user_id = (select auth.uid()));
