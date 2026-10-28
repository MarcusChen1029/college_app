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
-- The old plaintext columns are left alone here: the server moves each student's passwords on their next visit
-- (verified copy first, then a compare-and-set removal through 0043's functions), and 0043 stops new plaintext.
-- Runbook: docs/superpowers/plans/2026-10-28-portal-password-encryption.md.

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

-- Which key the store belongs to: one row, the public fingerprint of the key (web/lib/portal-vault.ts vaultKeyId:
-- 16 characters of an HMAC under the derived subkey, never the key). The production deployment writes it on its first
-- password request; any deployment whose key gives another fingerprint (a preview, a laptop pointed at this database,
-- a backfill run with the wrong env) then answers 503 for every password action and touches nothing. Every sealed
-- value also names the fingerprint ("v1.<key id>.<...>"), so a row sealed under another key is never trusted.
-- To change the key on purpose: re-seal every row with the new key first; only then update this row (SQL Editor).
create table public.portal_vault_meta (
  id         boolean primary key default true check (id),
  key_id     text not null check (key_id ~ '^[A-Za-z0-9_-]{16}$'),
  created_at timestamptz not null default now()
);
alter table public.portal_vault_meta enable row level security;
-- service_role too: Supabase's default privileges give it everything on new tables, and it must not update or delete.
revoke all on table public.portal_vault_meta from public, anon, authenticated, service_role;
grant select, insert on table public.portal_vault_meta to service_role;
