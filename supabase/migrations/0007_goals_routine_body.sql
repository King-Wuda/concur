-- ============================================================================
-- Life goals, the daily/weekly routine, and the body log.
--
-- Goals are one list in priority order (position), each with an optional
-- deadline - null means open-ended - and a checklist of milestones. Achieving
-- a goal stamps achieved_at rather than deleting it.
--
-- Habits are the routine: each is done on a set of weekdays, 0 = Sunday to
-- 6 = Saturday (all seven for a daily habit). A tick for a day is one row in
-- habit_checks; unticking deletes it. A habit can optionally point at the goal
-- it serves.
--
-- body_logs holds one row per day: the morning weight and the day's steps,
-- either of which can be left empty.
--
-- Same protections as every other table: scoped to the owner, row level
-- security on, and only the authenticated role granted access.
--
-- Adds five new tables and touches nothing that exists. Safe to run more than
-- once.
-- ============================================================================

create table if not exists public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  title        text not null,
  notes        text,
  -- Null: open-ended, no deadline.
  deadline     date,
  -- Priority: 0 is the top of the list.
  position     integer not null default 0,
  achieved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.goal_milestones (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  goal_id     uuid not null references public.goals (id) on delete cascade,
  title       text not null,
  done_at     timestamptz,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.habits (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text not null,
  -- Days it is done on: 0 = Sunday ... 6 = Saturday.
  weekdays     smallint[] not null
                 check (cardinality(weekdays) between 1 and 7
                        and weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]),
  -- The goal this habit works toward, if any.
  goal_id      uuid references public.goals (id) on delete set null,
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.habit_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  habit_id    uuid not null references public.habits (id) on delete cascade,
  date        date not null,
  created_at  timestamptz not null default now(),
  unique (habit_id, date)
);

create table if not exists public.body_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  date        date not null,
  weight_kg   numeric(5, 2) check (weight_kg > 0 and weight_kg < 500),
  steps       integer check (steps between 0 and 200000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists goals_user_position_idx on public.goals (user_id, position);
create index if not exists goal_milestones_goal_idx on public.goal_milestones (goal_id, position);
create index if not exists habits_user_position_idx on public.habits (user_id, position);
create index if not exists habit_checks_user_date_idx on public.habit_checks (user_id, date desc);
create index if not exists body_logs_user_date_idx on public.body_logs (user_id, date desc);

do $$
declare
  t text;
begin
  foreach t in array array['goals', 'goal_milestones', 'habits', 'body_logs']
  loop
    execute format('drop trigger if exists %1$s_touch_updated_at on public.%1$s', t);
    execute format(
      'create trigger %1$s_touch_updated_at before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;

  foreach t in array array['goals', 'goal_milestones', 'habits', 'habit_checks', 'body_logs']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %1$s_owner_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_delete on public.%1$s', t);

    execute format(
      'create policy %1$s_owner_select on public.%1$s for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_insert on public.%1$s for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_update on public.%1$s for update
         using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_delete on public.%1$s for delete using (auth.uid() = user_id)', t);
  end loop;
end $$;
