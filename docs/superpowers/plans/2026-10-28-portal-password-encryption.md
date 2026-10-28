# Portal password encryption: rollout runbook (2026-10-28)

Saved portal passwords move out of plaintext (`student_colleges.portal_password`, the `password` keys inside
`student_profiles.portals`, signed-out localStorage) into `public.portal_passwords`: AES-256-GCM sealed by the web
server, bound to user and slot, readable only with the service-role key through `POST /api/portal-passwords`, which
refuses AI-connection (OAuth `client_id`) tokens. Background: security audit R1 (PW-1 to PW-7), review R2 (F1-F13).

Code: `web/lib/portal-slots.ts` (slot names, stripping, save pass-through), `web/lib/portal-migrate.ts` (what to
copy, keep or leave), `web/lib/portal-vault.ts` (crypto, token check), `web/lib/portal-vault-server.ts`,
`web/app/api/portal-passwords/route.ts`, `web/lib/portal-vault-client.ts`, `web/lib/student-store.ts`,
`web/lib/student-local.ts`, `web/components/LoginRow.tsx`, `web/components/LocalMergeDialog.tsx`.

Key: `PORTAL_ENCRYPTION_KEY` if set, else the existing `GOOGLE_TOKEN_ENCRYPTION_KEY` (base64 of 32 bytes; already set
in Production). Decide once: passwords sealed under one key don't open under the other. A key change no longer loses
anything silently: a row that doesn't open is treated as missing, so plaintext that still exists is copied again and
nothing is removed until a copy opens; but passwords that exist only in the store become "unreadable" (re-type).

## How existing passwords move (no owner step needed)

On each signed-in student's next page load, before the page reads or writes the profile or list, the browser calls
`migrate`. The server, with the service role and for that student only:

1. reads their plaintext (college rows and profile `portals`) and their store rows;
2. keeps a store row that already opens with the current key, otherwise seals the plaintext, writes it, reads it back
   and opens it to the same value;
3. only then removes that plaintext, through 0041's compare-and-set functions (`strip_college_portal_password`,
   `replace_profile_portals`), which refuse if the row changed since it was read and can only remove passwords;
4. answers counts only: `{ migrated, kept, failed }`. Failed values stay plaintext and are tried again next visit.

Until then nothing on the site removes plaintext: list saves never touch `portal_password`, and profile saves put
back the password keys the row still holds (`keepStoredPasswords`). Passwords a browser saved while signed out stay in
that browser (key `college-tracker:v1:legacy-passwords`) until the account confirms it stored them, or the student
chooses "Don't add" / "Remove from this browser"; a password whose account login has a different username is held back.

## Order

1. **Apply migrations `0038` → `0039` → `0040` → `0041`** (0039 and 0040 come from fix/security-hardening).
   Before 0041, dry-run it: `supabase/patches/2026-10-28_forbid_plaintext_dry_run.sql` with 0041 pasted at its marker
   must end in `DRY RUN RESULT: 0 failures` (it can never commit). 0041 stops with an error if `student_colleges` has a
   column it doesn't know; add the column to its grant list first.
   Check: `select has_table_privilege('authenticated', 'public.portal_passwords', 'select')` is `false`;
   `select has_column_privilege('authenticated', 'public.student_colleges', 'portal_password', 'select')` is `false`.

2. **Deploy the code.** From here on the site keeps no password in plaintext, and old open tabs can't write one back
   (0041 refuses it; those tabs show a save error and reload). AI-connection tokens can't read `portal_password` any
   more (0041 column grants), and can't reach the store at all.

3. **Verify** with a test account that has a plaintext password from before (one system login, one college login):
   open the site signed in, then on Portals press Show on both: the old values appear. `2026-10-28-portal-plaintext-counts.sql`
   shows that student gone from the plaintext counts. Network tab: profile/list requests carry no password;
   `/api/portal-passwords` answers `Cache-Control: no-store`; an AI-connection token gets `403 {"error":"forbidden"}`.

4. **Wait** for students to visit. Watch `2026-10-28-portal-plaintext-counts.sql`. Optional, for students who don't
   come back: `node scripts/backfill-portal-passwords.mjs --dry-run`, then without `--dry-run`, run with the
   Production values of `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the key (e.g. `vercel env pull`).
   It follows the same verify-before-remove rule and prints counts only. "unplaceable" values (outside the slot format,
   over 512 characters) can't be moved by either; decide about them by hand.

5. **Only when every plaintext count is 0** (and no old build is in use): `supabase/patches/2026-10-28-drop-portal-password-column.sql`.
   It refuses to run while any plaintext is left, then drops 0041's college trigger and function and the column, and
   removes leftover empty `password` keys. Supabase backups keep old values until they age out.

## Rollback

- Code: an older build can't read `portal_password` after 0041 (its list load fails), so roll back 0041's grants too
  (`grant select, insert, update on public.student_colleges to authenticated`) if the old build must run again.
- Data: every password the new site moved now exists only in `portal_passwords`. An old build shows those as empty.
  Rolling back therefore needs a restore (open each row with the key and write it back to its place); there is no
  script for that yet, so prefer fixing forward.

## Still open

- Usernames and links stay in `student_profiles.portals` / `student_colleges.portal_username`, readable by an
  AI-connection token through the Data API.
- The server, and anyone with both the service-role key and the encryption key (Vercel env), can decrypt.
- No rate limit on `/api/portal-passwords` beyond Supabase's auth checks; each account is capped at 500 stored passwords.
- The clipboard clear after Copy is best effort (the page must still be open, and it can clear something copied in
  another app within those 30 s); the UI says so.
