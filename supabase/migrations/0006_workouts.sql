-- ============================================================================
-- Workouts: the training plan and the sessions logged against it.
--
-- The plan is a rotation of days (Workout A, B, C), each a list of exercises
-- done either as RPT - reverse pyramid, 3 sets aiming 4-6, 6-8, 8-10 reps - or
-- RP - rest-pause, a set of 10-15 then sets of 4-6. The app seeds the plan
-- from the original spreadsheet the first time Workouts is opened.
--
-- A logged session keeps a copy of each exercise's name and target with its
-- sets rather than only pointing at the plan, so renaming or dropping an
-- exercise later never rewrites what was actually lifted.
--
-- Same protections as every other table: scoped to the owner, row level
-- security on, and only the authenticated role granted access.
--
-- Adds four new tables and touches nothing that exists. Safe to run more than
-- once.
-- ============================================================================

create table if not exists public.workout_days (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Short label the rotation goes by: "A", "B", "C".
  code        text not null,
  name        text not null,
  -- What the day is about, e.g. "Chest heavy -> medium arms/shoulders".
  focus       text,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, code)
);

create table if not exists public.workout_exercises (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  day_id      uuid not null references public.workout_days (id) on delete cascade,
  name        text not null,
  scheme      text not null check (scheme in ('RPT', 'RP')),
  sets        integer not null check (sets between 1 and 10),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- Kept if the day is later deleted from the plan; the copy below still says
  -- which workout it was.
  day_id      uuid references public.workout_days (id) on delete set null,
  day_code    text not null,
  day_name    text not null,
  date        date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  session_id     uuid not null references public.workout_sessions (id) on delete cascade,
  exercise_name  text not null,
  scheme         text not null check (scheme in ('RPT', 'RP')),
  set_number     integer not null check (set_number between 1 and 10),
  -- The rep range aimed for, e.g. "4-6", as it was on the day.
  target         text not null,
  weight_kg      numeric(6, 2) check (weight_kg >= 0),
  reps           integer not null check (reps between 0 and 200),
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists workout_exercises_day_idx on public.workout_exercises (day_id, position);
create index if not exists workout_sessions_user_date_idx on public.workout_sessions (user_id, date desc, created_at desc);
create index if not exists workout_sets_session_idx on public.workout_sets (session_id, position);
create index if not exists workout_sets_exercise_idx on public.workout_sets (user_id, lower(exercise_name));

do $$
declare
  t text;
begin
  foreach t in array array['workout_days', 'workout_exercises', 'workout_sessions']
  loop
    execute format('drop trigger if exists %1$s_touch_updated_at on public.%1$s', t);
    execute format(
      'create trigger %1$s_touch_updated_at before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;

  foreach t in array array['workout_days', 'workout_exercises', 'workout_sessions', 'workout_sets']
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
