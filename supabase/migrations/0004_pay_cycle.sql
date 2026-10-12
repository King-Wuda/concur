-- ============================================================================
-- Budget months run payday to payday, not 1st to 31st.
--
-- Salary lands around the 24th, and that is when the next month's budget
-- starts: "October" runs from the day salary arrives in September to the day
-- before it arrives in October. period_start records that payday for each
-- month. Each month ends the day before the next month's period_start.
--
-- It is nullable on purpose. Null means "the usual payday": the 24th of the
-- previous month. A month only stores a date when payday moved that month - the
-- 24th fell on a weekend, say - and that does not carry forward, because a
-- one-off early payday says nothing about next month's. Leaving existing rows
-- null therefore keeps every current month exactly as it is.
--
-- Adds one column and nothing else. Safe to run more than once.
-- ============================================================================

alter table public.months add column if not exists period_start date;

-- A payday belongs to the calendar month before the budget month it starts, or
-- (if paid late) the first days of the month itself - never further away.
alter table public.months drop constraint if exists months_period_start_near_month;
alter table public.months add constraint months_period_start_near_month check (
  period_start is null
  or (
    period_start >= (month - interval '1 month')::date
    and period_start < (month + interval '1 month')::date
  )
);

comment on column public.months.period_start is
  'Payday that starts this budget month. Null = the usual payday, the 24th of the previous month.';
