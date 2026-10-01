-- ============================================================================
-- Does running the migrations over an existing database lose anything?
--
-- Run after the migrations have been applied a second time, on top of the data
-- 10_seed_existing_data put there. Every check compares a stored value against
-- what was written, so a migration that dropped a table, truncated one, reset a
-- column or rewrote a row would fail here rather than in production.
--
-- An exception is raised on any mismatch, so a clean run means nothing moved.
-- ============================================================================

do $$
declare
  r record;
begin
  -- The month, with every figure in the summary block intact.
  select * into r from public.months
   where id = 'aaaaaaaa-0000-0000-0000-00000000000a';
  if not found then
    raise exception 'the month row is gone';
  end if;
  if r.salary <> 52000 or r.salary_after_tax <> 39500
     or r.tithe <> 5200 or r.rent <> 12500 or r.investec <> 4000 then
    raise exception 'the month summary changed: %', row_to_json(r);
  end if;
  if r.notes is distinct from 'before the migration' then
    raise exception 'the month note changed: %', r.notes;
  end if;
  if r.month <> date '2026-08-01' then
    raise exception 'the month moved: %', r.month;
  end if;
  raise notice 'PASS  the month and its summary survived';

  -- The budget.
  select * into r from public.budgets
   where id = 'bbbbbbbb-0000-0000-0000-00000000000b';
  if not found or r.budgeted_amount <> 5000 or r.category <> 'Groceries' then
    raise exception 'the budget changed or is gone';
  end if;
  raise notice 'PASS  the budget survived';

  -- The receipt, to the cent.
  select * into r from public.receipts
   where id = 'cccccccc-0000-0000-0000-00000000000c';
  if not found then
    raise exception 'the receipt is gone';
  end if;
  if r.total <> 537.26 or r.store_name <> 'Checkers Hyper'
     or r.date <> date '2026-08-14' or r.category <> 'Groceries' then
    raise exception 'the receipt changed: %', row_to_json(r);
  end if;
  if r.note is distinct from 'paid partly by gift card' then
    raise exception 'the receipt note changed: %', r.note;
  end if;
  raise notice 'PASS  the receipt survived, to the cent';

  -- Both line items, including the per-item category override.
  if (select count(*) from public.line_items
       where receipt_id = 'cccccccc-0000-0000-0000-00000000000c') <> 2 then
    raise exception 'line items were lost';
  end if;
  select * into r from public.line_items
   where id = 'dddddddd-0000-0000-0000-00000000000d';
  if not found or r.amount <> 329.99 or r.category <> 'Lily' then
    raise exception 'a line item changed: %', row_to_json(r);
  end if;
  raise notice 'PASS  line items survived, categories included';

  -- The fixed expense.
  select * into r from public.fixed_expenses
   where id = 'ffffffff-0000-0000-0000-00000000000f';
  if not found or r.amount <> 69 or r.name <> 'Spotify'
     or r.include_in_budget is not true then
    raise exception 'the fixed expense changed or is gone';
  end if;
  raise notice 'PASS  the fixed expense survived';

  -- Nothing stray appeared under this user either.
  if (select count(*) from public.months
       where user_id = '99999999-9999-9999-9999-999999999999') <> 1 then
    raise exception 'months were added or removed under the existing user';
  end if;
  raise notice 'PASS  no rows were added or removed';
end $$;

-- The new table arrives empty rather than guessing at anything.
do $$
begin
  if (select count(*) from public.income) <> 0 then
    raise exception 'the income table was not empty after the migration';
  end if;
  raise notice 'PASS  the new income table arrived empty';
end $$;
