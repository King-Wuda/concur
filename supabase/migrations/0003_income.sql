-- ============================================================================
-- Money coming in during the month.
--
-- Salary already lives on the month's summary block. This is for everything
-- else that arrives: someone sending money, a refund landing back in the
-- account, a side job, a gift.
--
-- Income deliberately has no category. The six categories are budgets for
-- spending, so filing money received under one of them would make that
-- category's actual go down, its meter read wrong, and its slice of the pie
-- chart misleading. Income instead raises what there is to spend, which is
-- where it belongs in the arithmetic.
--
-- Same protections as every other table: scoped to the owner, row level
-- security on, and only the authenticated role granted access to it.
-- ============================================================================

create table if not exists public.income (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  month_id    uuid not null references public.months (id) on delete cascade,
  -- Who it came from or what it was for, e.g. "Mum", "Refund - Takealot".
  source      text not null,
  date        date not null,
  amount      numeric(12, 2) not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists income_month_idx on public.income (month_id);
create index if not exists income_user_date_idx on public.income (user_id, date desc);

drop trigger if exists income_touch_updated_at on public.income;
create trigger income_touch_updated_at
  before update on public.income
  for each row execute function public.touch_updated_at();

grant select, insert, update, delete on public.income to authenticated;

alter table public.income enable row level security;

drop policy if exists income_owner_select on public.income;
drop policy if exists income_owner_insert on public.income;
drop policy if exists income_owner_update on public.income;
drop policy if exists income_owner_delete on public.income;

create policy income_owner_select on public.income
  for select using (auth.uid() = user_id);

create policy income_owner_insert on public.income
  for insert with check (auth.uid() = user_id);

create policy income_owner_update on public.income
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy income_owner_delete on public.income
  for delete using (auth.uid() = user_id);
