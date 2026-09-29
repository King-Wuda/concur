-- ============================================================================
-- Personal budgeting app - initial schema
--
-- Currency is always ZAR, so no currency column anywhere. Every table is
-- scoped to a user via user_id and locked down with row level security, so a
-- single hosted deployment can safely be reached from the open internet.
-- ============================================================================

create extension if not exists "pgcrypto";

-- Categories are a fixed set. A domain-style check constraint keeps them in
-- sync between the database and src/lib/categories.ts.
create or replace function public.is_category(value text)
returns boolean
language sql
immutable
as $$
  select value in (
    'Groceries', 'Transport', 'Chill', 'Subscriptions', 'Lily', 'Miscellaneous'
  );
$$;

-- ---------------------------------------------------------------------------
-- months: one row per calendar month, holding the summary block
-- ---------------------------------------------------------------------------
create table if not exists public.months (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- First day of the month, e.g. 2026-09-01. Postgres dates sort correctly,
  -- which keeps "previous month" queries trivial.
  month             date not null,
  salary            numeric(12, 2) not null default 0,
  salary_after_tax  numeric(12, 2) not null default 0,
  tithe             numeric(12, 2) not null default 0,
  rent              numeric(12, 2) not null default 0,
  investec          numeric(12, 2) not null default 0,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint months_month_is_first_of_month check (date_trunc('month', month) = month),
  constraint months_user_month_unique unique (user_id, month)
);

-- ---------------------------------------------------------------------------
-- budgets: planned spend per category per month
-- ---------------------------------------------------------------------------
create table if not exists public.budgets (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  month_id         uuid not null references public.months (id) on delete cascade,
  category         text not null,
  budgeted_amount  numeric(12, 2) not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint budgets_category_valid check (public.is_category(category)),
  constraint budgets_month_category_unique unique (month_id, category)
);

-- ---------------------------------------------------------------------------
-- receipts: one scanned receipt / purchase
-- ---------------------------------------------------------------------------
create table if not exists public.receipts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  month_id     uuid not null references public.months (id) on delete cascade,
  store_name   text not null,
  -- Purchase date as printed on the receipt.
  date         date not null,
  total        numeric(12, 2) not null default 0,
  category     text not null,
  -- Storage object path inside the private `receipts` bucket, not a public URL.
  image_path   text,
  note         text,
  -- What the vision model returned, kept for auditing and re-runs.
  raw_extraction jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint receipts_category_valid check (public.is_category(category))
);

create index if not exists receipts_month_idx on public.receipts (month_id);
create index if not exists receipts_user_date_idx on public.receipts (user_id, date desc);

-- ---------------------------------------------------------------------------
-- line_items: every individual item on a receipt
-- ---------------------------------------------------------------------------
create table if not exists public.line_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  receipt_id  uuid not null references public.receipts (id) on delete cascade,
  item_name   text not null,
  amount      numeric(12, 2) not null default 0,
  quantity    numeric(10, 3),
  -- Defaults to the receipt's category at insert time; can be overridden per item.
  category    text not null,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint line_items_category_valid check (public.is_category(category))
);

create index if not exists line_items_receipt_idx on public.line_items (receipt_id, position);

-- ---------------------------------------------------------------------------
-- fixed_expenses: recurring monthly commitments (gym, Spotify, VPS, ...)
-- ---------------------------------------------------------------------------
create table if not exists public.fixed_expenses (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  month_id           uuid not null references public.months (id) on delete cascade,
  name               text not null,
  amount             numeric(12, 2) not null default 0,
  category           text not null default 'Subscriptions',
  -- When false the amount is tracked but excluded from category actuals,
  -- which is useful for things already counted in the summary block.
  include_in_budget  boolean not null default true,
  position           integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint fixed_expenses_category_valid check (public.is_category(category)),
  constraint fixed_expenses_month_name_unique unique (month_id, name)
);

create index if not exists fixed_expenses_month_idx on public.fixed_expenses (month_id, position);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['months', 'budgets', 'receipts', 'fixed_expenses']
  loop
    execute format('drop trigger if exists %1$s_touch_updated_at on public.%1$s', t);
    execute format(
      'create trigger %1$s_touch_updated_at before update on public.%1$s
         for each row execute function public.touch_updated_at()', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security: a user only ever sees their own rows
-- ---------------------------------------------------------------------------
alter table public.months          enable row level security;
alter table public.budgets         enable row level security;
alter table public.receipts        enable row level security;
alter table public.line_items      enable row level security;
alter table public.fixed_expenses  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['months', 'budgets', 'receipts', 'line_items', 'fixed_expenses']
  loop
    execute format('drop policy if exists %1$s_owner_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_owner_delete on public.%1$s', t);

    execute format(
      'create policy %1$s_owner_select on public.%1$s
         for select using (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_insert on public.%1$s
         for insert with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_update on public.%1$s
         for update using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format(
      'create policy %1$s_owner_delete on public.%1$s
         for delete using (auth.uid() = user_id)', t);
  end loop;
end;
$$;
