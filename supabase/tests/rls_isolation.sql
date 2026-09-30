-- ============================================================================
-- Row level security check.
--
-- This app is a single hosted deployment reachable from the open internet, and
-- the only thing standing between one person's receipts and another's is the
-- set of policies in 0001_init.sql. This script proves they hold: it creates
-- two users, gives the first one a month's worth of data, and then checks that
-- the second can neither read it, change it, delete it, nor plant rows under
-- the first user's id.
--
-- Run it against a throwaway Postgres that has the migrations applied (see
-- supabase/tests/README.md). Every assertion raises an exception on failure,
-- so a clean run means every check passed.
-- ============================================================================

begin;

-- Two users. `owner` has the data; `intruder` is signed in but is someone else.
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'owner@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'intruder@example.com')
on conflict (id) do nothing;

-- Seed as the table owner, bypassing policies, so the fixture itself is not
-- what is under test.
insert into public.months (id, user_id, month, salary, salary_after_tax)
values (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  '2026-09-01', 50000, 38000
);

insert into public.budgets (user_id, month_id, category, budgeted_amount)
values (
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'Groceries', 4000
);

insert into public.receipts (id, user_id, month_id, store_name, date, total, category)
values (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'Checkers Hyper', '2026-09-08', 4250, 'Groceries'
);

insert into public.line_items (user_id, receipt_id, item_name, amount, category)
values (
  '11111111-1111-1111-1111-111111111111',
  '44444444-4444-4444-4444-444444444444',
  'Milk 2L', 32.99, 'Groceries'
);

insert into public.fixed_expenses (user_id, month_id, name, amount, category)
values (
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'Spotify', 69, 'Subscriptions'
);

insert into public.income (user_id, month_id, source, date, amount)
values (
  '11111111-1111-1111-1111-111111111111',
  '33333333-3333-3333-3333-333333333333',
  'Mum', '2026-09-05', 1500
);

-- --------------------------------------------------------------------------
-- The owner sees their own rows.
-- --------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
begin
  if (select count(*) from public.months) <> 1 then
    raise exception 'owner cannot see their own month';
  end if;
  if (select count(*) from public.receipts) <> 1 then
    raise exception 'owner cannot see their own receipt';
  end if;
  if (select count(*) from public.line_items) <> 1 then
    raise exception 'owner cannot see their own line items';
  end if;
  if (select count(*) from public.budgets) <> 1 then
    raise exception 'owner cannot see their own budgets';
  end if;
  if (select count(*) from public.fixed_expenses) <> 1 then
    raise exception 'owner cannot see their own fixed expenses';
  end if;
  if (select count(*) from public.income) <> 1 then
    raise exception 'owner cannot see their own income';
  end if;
  raise notice 'PASS  owner sees their own rows';
end $$;

-- --------------------------------------------------------------------------
-- A different signed-in user sees none of it.
-- --------------------------------------------------------------------------
set local request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';

do $$
declare
  t text;
  visible integer;
begin
  foreach t in array array['months', 'budgets', 'receipts', 'line_items', 'fixed_expenses', 'income']
  loop
    execute format('select count(*) from public.%I', t) into visible;
    if visible <> 0 then
      raise exception 'another user can read %: % row(s) visible', t, visible;
    end if;
  end loop;
  raise notice 'PASS  another user reads nothing';
end $$;

-- --------------------------------------------------------------------------
-- ...cannot change or delete it either. An UPDATE or DELETE that matches no
-- visible row affects zero rows rather than erroring, so count the effect.
-- --------------------------------------------------------------------------
do $$
declare
  affected integer;
begin
  update public.receipts set total = 1 where id = '44444444-4444-4444-4444-444444444444';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'another user updated % receipt row(s)', affected;
  end if;

  delete from public.receipts where id = '44444444-4444-4444-4444-444444444444';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'another user deleted % receipt row(s)', affected;
  end if;

  delete from public.months where id = '33333333-3333-3333-3333-333333333333';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'another user deleted % month row(s)', affected;
  end if;

  update public.income set amount = 1 where source = 'Mum';
  get diagnostics affected = row_count;
  if affected <> 0 then
    raise exception 'another user updated % income row(s)', affected;
  end if;

  raise notice 'PASS  another user cannot update or delete';
end $$;

-- --------------------------------------------------------------------------
-- ...and cannot write rows attributed to someone else. This is the one that
-- matters most: without the WITH CHECK half of the policy, a client could
-- simply send a different user_id.
-- --------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.receipts (user_id, month_id, store_name, date, total, category)
    values (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      'Planted', '2026-09-09', 1, 'Groceries'
    );
    raise exception 'another user planted a row under the owner''s id';
  exception
    when insufficient_privilege then
      raise notice 'PASS  another user cannot write under someone else''s id';
  end;
end $$;

-- --------------------------------------------------------------------------
-- The owner's own writes still work, and are still theirs.
-- --------------------------------------------------------------------------
set local request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';

do $$
declare
  affected integer;
begin
  insert into public.receipts (user_id, month_id, store_name, date, total, category)
  values (
    '11111111-1111-1111-1111-111111111111',
    '33333333-3333-3333-3333-333333333333',
    'Pick n Pay', '2026-09-11', 310, 'Groceries'
  );

  update public.receipts set total = 320 where store_name = 'Pick n Pay';
  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'owner could not update their own receipt';
  end if;

  if (select count(*) from public.receipts) <> 2 then
    raise exception 'owner cannot see the receipt they just wrote';
  end if;

  raise notice 'PASS  owner can still read and write their own data';
end $$;

-- --------------------------------------------------------------------------
-- The category constraint really is closed.
-- --------------------------------------------------------------------------
do $$
begin
  begin
    insert into public.receipts (user_id, month_id, store_name, date, total, category)
    values (
      '11111111-1111-1111-1111-111111111111',
      '33333333-3333-3333-3333-333333333333',
      'Bad category', '2026-09-12', 10, 'Petrol'
    );
    raise exception 'a category outside the fixed set was accepted';
  exception
    when check_violation then
      raise notice 'PASS  categories outside the fixed set are rejected';
  end;
end $$;

reset role;
rollback;
