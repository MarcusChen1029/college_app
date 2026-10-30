-- Checks around migration 0048_vault_e1_only. Read-only: nothing here writes. Run in the dashboard SQL Editor (or psql).

-- PRE-CHECK: run BEFORE applying 0048 (and after the handover-free code is deployed).
-- 1) Which kinds of value are stored. Expect only "e1." rows (live data on 2026-10-30: 7 e1, 0 v1).
select left(sealed, 3) as prefix, count(*) as rows
from public.portal_passwords
group by 1
order by 1;

-- 2) Rows the new constraint would refuse (must be 0, or 0048's ALTER fails and rolls back).
select count(*) as rows_that_break_the_constraint
from public.portal_passwords
where sealed !~ '^e1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$';

-- POST-CHECK: run AFTER applying 0048.
-- 3) The constraint exists (expect one row: portal_passwords_e1_only, validated = true).
select c.conname, c.convalidated as validated, pg_get_constraintdef(c.oid) as definition
from pg_constraint c
where c.conrelid = 'public.portal_passwords'::regclass
  and c.conname = 'portal_passwords_e1_only';

-- 4) portal_vault_meta is gone (expect one row with exists_ = false).
select to_regclass('public.portal_vault_meta') is not null as exists_;
