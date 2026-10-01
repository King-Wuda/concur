-- ============================================================================
-- A month of realistic data, inserted BETWEEN the first and second pass of the
-- migrations.
--
-- The point is to answer "will running this migration lose what I already
-- have?" with evidence rather than with a reading of the SQL. 20_data_survives
-- checks every row below is still there, byte for byte, after the migrations
-- have been applied over the top of it.
--
-- It belongs to a user of its own, so the row level security checks that run
-- afterwards - which count rows for two other users - are unaffected by it.
-- ============================================================================

insert into auth.users (id, email)
values ('99999999-9999-9999-9999-999999999999', 'existing@example.com')
on conflict (id) do nothing;

insert into public.months (id, user_id, month, salary, salary_after_tax, tithe, rent, investec, notes)
values (
  'aaaaaaaa-0000-0000-0000-00000000000a',
  '99999999-9999-9999-9999-999999999999',
  '2026-08-01', 52000, 39500, 5200, 12500, 4000, 'before the migration'
);

insert into public.budgets (id, user_id, month_id, category, budgeted_amount)
values (
  'bbbbbbbb-0000-0000-0000-00000000000b',
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-0000-0000-0000-00000000000a',
  'Groceries', 5000
);

insert into public.receipts (id, user_id, month_id, store_name, date, total, category, note)
values (
  'cccccccc-0000-0000-0000-00000000000c',
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-0000-0000-0000-00000000000a',
  'Checkers Hyper', '2026-08-14', 537.26, 'Groceries', 'paid partly by gift card'
);

insert into public.line_items (id, user_id, receipt_id, item_name, amount, quantity, category, position)
values
  ('dddddddd-0000-0000-0000-00000000000d',
   '99999999-9999-9999-9999-999999999999',
   'cccccccc-0000-0000-0000-00000000000c',
   'Huggies Nappies SZ4 66s', 329.99, null, 'Lily', 0),
  ('dddddddd-0000-0000-0000-00000000000e',
   '99999999-9999-9999-9999-999999999999',
   'cccccccc-0000-0000-0000-00000000000c',
   'Full Cream Milk 2L', 32.99, 1, 'Groceries', 1);

insert into public.fixed_expenses (id, user_id, month_id, name, amount, category, include_in_budget, position)
values (
  'ffffffff-0000-0000-0000-00000000000f',
  '99999999-9999-9999-9999-999999999999',
  'aaaaaaaa-0000-0000-0000-00000000000a',
  'Spotify', 69, 'Subscriptions', true, 0
);
