# Portal password encryption: rollout runbook (2026-10-28)

Saved portal passwords move out of plaintext (`student_colleges.portal_password`, the `password` fields inside
`student_profiles.portals`, and signed-out localStorage) into `public.portal_passwords`: AES-256-GCM sealed by the web
server, bound to user and slot, readable only with the service-role key through `POST /api/portal-passwords`, which
refuses AI-connection (OAuth `client_id`) tokens. Background: security audit R1 (findings PW-1 to PW-7).

Code: `web/lib/portal-slots.ts` (slot names, stripping), `web/lib/portal-vault.ts` (crypto, token check),
`web/lib/portal-vault-server.ts`, `web/app/api/portal-passwords/route.ts`, `web/lib/portal-vault-client.ts`,
`web/components/LoginRow.tsx`, `web/components/LocalMergeDialog.tsx`, `web/lib/student-store.ts`, `web/lib/student-local.ts`.

Key: `PORTAL_ENCRYPTION_KEY` if set, else the existing `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64 of 32 bytes). Production
needs no new variable. Decide once: passwords sealed under one key don't open under the other, and changing the key
later makes every stored password "unreadable" (students must type them again).

## Order (do not reorder)

1. **Apply migration `supabase/migrations/0038_portal_passwords.sql`.** Creates the table (RLS on, no policies, grants
   only to `service_role`). Check: `select has_table_privilege('authenticated', 'public.portal_passwords', 'select')` is
   `false`, and the security advisor shows no new warning.

2. **Run the backfill** from the repo root with the production values (never commit them, never paste them in chat):
   ```bash
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... \
     node scripts/backfill-portal-passwords.mjs --dry-run      # counts only, writes nothing
   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... \
     node scripts/backfill-portal-passwords.mjs                # writes; skips slots already stored
   ```
   It prints counts only (`passwordsFound`, `alreadyInVault`, `toWrite`...). Running it again is safe. Node 22.18+.

3. **Deploy the code** (the branch with this runbook). From now on the site never reads `portal_password`, never writes
   a password into `portals`, and keeps none in localStorage. Run the backfill once more right after the deploy: it
   picks up passwords saved by the old site between steps 2 and 3. (A password *changed* in that window keeps its
   older value in the store; keep the window short.) As a safety net the new site also copies any password it still
   finds in the student's own profile row into the store once per page load, before its first profile save (which no
   longer writes passwords), and when all of them made it, removes them from that row's `portals`. List-row passwords
   (`portal_password`) are never read or written by the new site; only the backfill moves them.

4. **Verify** on the deployed site with a test account (not a student's):
   - Portals: save a password, reload, Show and Copy it ("Clipboard clears in 30 s"), Clear it.
   - Network tab: the profile/list requests carry no password; `/api/portal-passwords` answers `Cache-Control: no-store`.
   - `select slot, left(sealed, 3) from portal_passwords where user_id = '<test user>'` shows `v1.` values, no plaintext.
   - An AI-connection token gets `403 {"error":"forbidden"}` from `/api/portal-passwords`.
   - Signed out: the password field is disabled; sign in with signed-out data present: the "Add to this account?" dialog appears.
   - Run the count queries at the top of the strip patch: `without_vault_copy` should be 0.

   Don't run the backfill again after students have used the new site for a while: for a college login whose
   password a student cleared, it would restore the old value from `portal_password`. Go on to step 5 soon.

5. **Strip the plaintext copies:** run `supabase/patches/2026-10-28-strip-plaintext-portal-passwords.sql` in the SQL
   Editor (it only touches passwords whose slot is in the store). Re-run its count queries: `with_vault_copy` is 0.

6. **Later** (weeks after, once no old build is in use): run `supabase/patches/2026-10-28-drop-portal-password-column.sql`
   to drop `student_colleges.portal_password` and any `password` keys still left in `portals`. Read its header first:
   it deletes whatever was not copied. Supabase backups keep old values until they age out.

## Rollback

Before step 5 nothing is lost: the old columns still hold every password, so redeploying the previous build restores
the old behaviour (passwords saved only in the new store since step 3 would not show there). After step 5, rolling
back the code means students re-enter passwords; keep the new code.

## Still open after this change

- Usernames and links stay in `student_profiles.portals` / `student_colleges.portal_username`, which an AI-connection
  token can read straight from the Supabase API (RLS can't hide columns). The consent screen line "See or change your
  portal usernames and passwords" (`misc.connect.cannot.0`) is true for passwords now, not for usernames.
- The server and anyone with both the service-role key and the encryption key (Vercel env) can still decrypt.
- No rate limit on `/api/portal-passwords` beyond Supabase's auth checks; each account is capped at 500 stored passwords.
