-- Browser-locked values only (design: docs/superpowers/specs/2026-10-29-e2e-portal-vault-design.md; cleanup of the temporary
-- "v1" path that 0047 left in place).
-- Until now portal_passwords.sealed could hold two kinds of value: "e1.<key_id>.<...>" made in the student's browser (0047), and
-- "v1.<key_id>.<...>" made by the web server with an env key (0040), which the site re-locked into the vault one student at a
-- time ("handover"). The last student with v1 rows has handed them over, so the server no longer opens v1 values and the
-- website code that did so is gone. This migration makes the database say the same thing:
--   1. drops portal_vault_meta (0040): the table holding the public fingerprint of that env key. Nothing reads or writes it now.
--   2. adds portal_passwords_e1_only: `sealed` must look like "e1.<16 key id characters>.<base64url>". It checks the shape
--      only (portal_vault_put, 0047, already checks that the key id is the user's vault's); it is the backstop that keeps a
--      v1 value, or a plaintext password, from ever being stored again, whatever code runs.
-- ORDER: apply this AFTER the code that removes the handover is deployed. The live site before that code still lists "v1" rows
-- and has a handover action; this migration drops the table that action reads, so it must not run first.
-- Live data was checked on 2026-10-30 before this was written: 0 rows starting "v1.", 7 starting "e1.", no other prefix. If
-- that has changed (a v1 row has appeared) the ALTER below is refused (check constraint violated) and adds nothing, so run
-- the pre-check first and do not apply while it shows anything but "e1." rows.
-- Verify before and after with patches/2026-10-30_vault_e1_only_check.sql, or just:
--   select left(sealed, 3) as prefix, count(*) from public.portal_passwords group by 1;   -- before: only "e1." rows
-- The 0047 smoke test (patches/2026-10-29_portal_vaults_smoke_test.sql) inserts a v1 row on purpose, so run it BEFORE this
-- migration, never after.
-- Applying this to the live project is a rollout step after the code is deployed (owner's OK).

drop table public.portal_vault_meta;

alter table public.portal_passwords
  add constraint portal_passwords_e1_only check (sealed ~ '^e1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$');
