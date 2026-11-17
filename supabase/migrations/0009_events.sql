-- ============================================================================
-- Trips and events: an expense report per occasion - plus your own budget
-- categories, and money sent between the people on a trip.
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
-- Your own categories: alongside the six built-in ones you can add your own.
-- Each trip gets one too, named after it, where everything on the trip that
-- involves your money is counted in your monthly budget. The fixed category
-- checks become a trigger that accepts a built-in category or one of your
-- own, so a mistyped category is still refused.
--
-- Transfers: money one participant sends another for the trip. They count in
-- the trip's settle-up, and the ones you send or receive count in your monthly
-- budget under the trip's category.
--
-- Adds five tables and three optional columns on receipts; every existing
-- receipt keeps its month and category. Safe to run more than once.
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

-- ----------------------------------------------------------------------------
-- Your own budget categories.
-- ----------------------------------------------------------------------------

create table if not exists public.budget_categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 40),
  -- Set for a trip's own category.
  event_id    uuid references public.events (id) on delete cascade,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  -- Your own names cannot shadow a built-in one.
  check (not public.is_category(name))
);

create unique index if not exists budget_categories_user_name
  on public.budget_categories (user_id, lower(name));

-- A category is valid if it is built in, or is one of the row owner's own.
create or replace function public.check_category()
returns trigger
language plpgsql
as $fn$
begin
  if public.is_category(new.category) then
    return new;
  end if;
  if exists (
    select 1 from public.budget_categories c
    where c.user_id = new.user_id and c.name = new.category
  ) then
    return new;
  end if;
  raise exception 'Unknown category: %', new.category using errcode = 'check_violation';
end;
$fn$;

do $$
declare
  t text;
begin
  foreach t in array array['receipts', 'line_items', 'budgets', 'fixed_expenses']
  loop
    execute format('alter table public.%1$s drop constraint if exists %1$s_category_valid', t);
    execute format('drop trigger if exists %1$s_check_category on public.%1$s', t);
    execute format(
      'create trigger %1$s_check_category before insert or update of category on public.%1$s
         for each row execute function public.check_category()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Money sent between people on a trip.
-- ----------------------------------------------------------------------------

create table if not exists public.event_transfers (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  from_participant  uuid not null references public.event_participants (id) on delete cascade,
  to_participant    uuid not null references public.event_participants (id) on delete cascade,
  amount            numeric(12, 2) not null check (amount > 0),
  date              date not null,
  note              text,
  -- The budget month, when you sent or received it; null between two others.
  month_id          uuid references public.months (id) on delete set null,
  created_at        timestamptz not null default now(),
  check (from_participant <> to_participant)
);

create index if not exists event_transfers_event_idx on public.event_transfers (event_id);
create index if not exists event_transfers_month_idx on public.event_transfers (month_id) where month_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['budget_categories', 'event_transfers']
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
