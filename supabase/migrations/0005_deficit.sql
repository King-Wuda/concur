-- ============================================================================
-- A deficit carried in from overspending the month before.
--
-- When a month ends overspent, the shortfall still has to be paid for, and it
-- comes out of the next month's money. Recording it on the month it is paid
-- back in lowers what that month has left, so the plan accounts for it.
--
-- Unlike salary, rent and the budgets, it does not carry forward into a new
-- month: a deficit is paid back once. Zero for every existing month, so nothing
-- already recorded changes.
--
-- Adds one column and nothing else. Safe to run more than once.
-- ============================================================================

alter table public.months
  add column if not exists deficit numeric(12, 2) not null default 0;

alter table public.months drop constraint if exists months_deficit_not_negative;
alter table public.months add constraint months_deficit_not_negative check (deficit >= 0);

comment on column public.months.deficit is
  'Overspend from the previous month being paid back out of this one.';
