-- Where a student keeps saved portal passwords (design: docs/superpowers/specs/2026-10-30-device-only-passwords-design.md).
--   'vault'  (default, today's behavior): sealed in the browser under the vault key and stored on the server in
--            portal_passwords (0047), synced to every device; needs the vault passphrase.
--   'device' : kept only in the browser where they were typed (IndexedDB, web/lib/device-passwords.ts), never sent to
--            the server; no passphrase. The passwords themselves never reach the database in this mode: this column is
--            the only trace, so every device knows which mode the account is in.
-- The choice is per account, so it lives in the profile. Access needs nothing new:
--   - student_profiles keeps its 0001 table-level grants and its "own profile" RLS policy (authenticated, own row only;
--     anon has no policy and so no row), so the student reads and writes the new column through the same path as every
--     other profile field. The website writes it alone (upsert of user_id + password_storage, web/lib/portal-vault-client.ts
--     writeMode); the whole-profile save (student-rows.ts fromProfile) never sends it, so a tab that loaded before a switch
--     can't switch it back.
--   - Not exposed elsewhere: ai_student_profiles (0041/0045) lists its columns explicitly and is not changed; the OAuth
--     write guard (0041 section 1d) refuses any AI change to a column outside its allow-list, this one included; the
--     teacher RPCs (0022/0023/0028/0029/0033), the share-link views (0032/0038/0041: parent_view, portfolio_view) and
--     the extension RPCs (0031/0039/0042) build their replies from explicit fields and never return a whole profile row.
--   - Triggers: guard_plan_columns (0045) and forbid_plaintext_password (0043) don't touch it; touch (0001) still sets
--     updated_at.
-- ORDER: apply this BEFORE deploying the code that reads it. That code adds password_storage to the profile select
-- (PROFILE_COLUMNS), which fails on a database without the column.
-- Smoke test: supabase/patches/2026-10-30_password_storage_smoke_test.sql (ends in a deliberate error; nothing persists).
-- Applying this to the live project is a rollout step (owner's OK); existing rows get 'vault', so nobody's behavior changes.

alter table public.student_profiles
  add column password_storage text not null default 'vault'
    constraint student_profiles_password_storage_check check (password_storage in ('vault', 'device'));

comment on column public.student_profiles.password_storage is
  'Where saved portal passwords live: vault (portal_passwords, browser-sealed, synced) or device (only in the browser that saved them). 0049.';
