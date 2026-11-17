-- ============================================================================
-- Trips and events: an expense report per occasion.
--
-- An event has dates, a total budget and optional budgets per trip category
-- (Accommodation, Transport, Food, Activities, Other), and a list of
-- participants - always including you. Receipts can belong to an event, with a
-- trip category and who paid.
--
-- Receipts you paid still count in that month's budget, as always. Receipts
-- someone else paid count only on the event: they belong to no budget month,
-- so receipts.month_id becomes optional - but a receipt must belong to a month
-- or an event, never neither.
--
-- Adds three tables and three optional columns on receipts; every existing
-- receipt keeps its month and gains nothing. Safe to run more than once.
-- ============================================================================

create table if not exists public.events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  start_date  date,
  end_date    date,
  budget      numeric(12, 2) not null default 0 check (budget >= 0),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (start_date is null or end_date is null or start_date <= end_date)
);

create table if not exists public.event_budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  category    text not null check (category in ('Accommodation', 'Transport', 'Food', 'Activities', 'Other')),
  amount      numeric(12, 2) not null default 0 check (amount >= 0),
  unique (event_id, category)
);

create table if not exists public.event_participants (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  event_id    uuid not null references public.events (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  -- The participant who is you. Exactly one per event, added with the event.
  is_me       boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists event_participants_one_me
  on public.event_participants (event_id) where is_me;

alter table public.receipts add column if not exists event_id uuid
  references public.events (id) on delete set null;
alter table public.receipts add column if not exists paid_by uuid
  references public.event_participants (id) on delete set null;
alter table public.receipts add column if not exists event_category text;

alter table public.receipts drop constraint if exists receipts_event_category_valid;
alter table public.receipts add constraint receipts_event_category_valid check (
  event_category is null
  or event_category in ('Accommodation', 'Transport', 'Food', 'Activities', 'Other')
);

-- Someone else's receipt is on the event only, with no budget month.
alter table public.receipts alter column month_id drop not null;
alter table public.receipts drop constraint if exists receipts_month_or_event;
alter table public.receipts add constraint receipts_month_or_event check (
  month_id is not null or event_id is not null
);

create index if not exists receipts_event_idx on public.receipts (event_id) where event_id is not null;
create index if not exists events_user_idx on public.events (user_id, start_date desc);
create index if not exists event_budgets_event_idx on public.event_budgets (event_id);
create index if not exists event_participants_event_idx on public.event_participants (event_id, position);

do $$
declare
  t text;
begin
  drop trigger if exists events_touch_updated_at on public.events;
  create trigger events_touch_updated_at before update on public.events
    for each row execute function public.touch_updated_at();

  foreach t in array array['events', 'event_budgets', 'event_participants']
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
