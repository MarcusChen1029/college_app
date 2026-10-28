-- Saved portal passwords (Common App, UC, FAFSA, visa accounts...), moved out of the plaintext
-- student_colleges.portal_password column and the student_profiles.portals jsonb (0007, 0013).
-- One row per password: `slot` names the login it belongs to (web/lib/portal-slots.ts: "system:<key>",
-- "campus:<system>:<campus>", "custom:<id>", "college:<student_colleges institution_id, or its id for a custom college>").
-- `sealed` is AES-256-GCM ciphertext made by the web server (web/lib/portal-vault.ts; key from PORTAL_ENCRYPTION_KEY,
-- else GOOGLE_TOKEN_ENCRYPTION_KEY), bound to the user and slot, so the database never holds a password in the clear.
-- Same pattern as google_tokens (0016): it lives in public because supabase-js can only reach exposed schemas;
-- RLS is on with no policies and all grants are revoked, so anon and authenticated tokens (the website's and an
-- AI connection's alike) can't read or write it. Only the server, with the service-role key, touches it, through
-- POST /api/portal-passwords, which also refuses AI-connection tokens.
-- The old plaintext columns are left alone here: backfill first, then supabase/patches/2026-10-28-*.sql
-- (runbook: docs/superpowers/plans/2026-10-28-portal-password-encryption.md).

create table public.portal_passwords (
  user_id    uuid not null references auth.users(id) on delete cascade,
  slot       text not null check (char_length(slot) between 1 and 200),
  sealed     text not null check (char_length(sealed) <= 4096),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot)
);
alter table public.portal_passwords enable row level security;
revoke all on table public.portal_passwords from public, anon, authenticated;
grant select, insert, update, delete on table public.portal_passwords to service_role;
