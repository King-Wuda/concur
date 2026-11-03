-- ============================================================================
-- Times and categories for the routine, start dates for goals, and a daily
-- step goal.
--
-- Habits gain an optional start and end time (Today is sorted by them), a
-- category such as Fitness or Faith, and a note - Gym's backup days, say.
-- Goals gain a category and an optional start date, for focus blocks that run
-- from one date to another. user_settings holds the daily step goal; one row
-- per person.
--
-- Only adds columns and one table; every existing row keeps its values, with
-- the new columns empty. Safe to run more than once.
-- ============================================================================

alter table public.habits add column if not exists start_time time;
alter table public.habits add column if not exists end_time time;
alter table public.habits add column if not exists category text;
alter table public.habits add column if not exists notes text;

alter table public.habits drop constraint if exists habits_end_after_start;
alter table public.habits add constraint habits_end_after_start check (
  end_time is null or (start_time is not null and end_time > start_time)
);

alter table public.goals add column if not exists category text;
alter table public.goals add column if not exists start_date date;

alter table public.goals drop constraint if exists goals_start_before_deadline;
alter table public.goals add constraint goals_start_before_deadline check (
  start_date is null or deadline is null or start_date <= deadline
);

create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  step_goal   integer check (step_goal between 1 and 200000),
  updated_at  timestamptz not null default now()
);

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at
  before update on public.user_settings
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.user_settings to authenticated;
alter table public.user_settings enable row level security;

drop policy if exists user_settings_owner_select on public.user_settings;
drop policy if exists user_settings_owner_insert on public.user_settings;
drop policy if exists user_settings_owner_update on public.user_settings;
drop policy if exists user_settings_owner_delete on public.user_settings;

create policy user_settings_owner_select on public.user_settings
  for select using (auth.uid() = user_id);
create policy user_settings_owner_insert on public.user_settings
  for insert with check (auth.uid() = user_id);
create policy user_settings_owner_update on public.user_settings
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy user_settings_owner_delete on public.user_settings
  for delete using (auth.uid() = user_id);
