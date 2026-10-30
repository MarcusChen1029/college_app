# End-to-end portal password vault: design

Date: 2026-10-29. Status: draft for the owner's approval.
Branch: `feat/e2e-portal-vault` (worktree `.claude/worktrees/e2e-vault`, cut from `origin/main` at 6a5dd0c).

## Why

Students save portal passwords (Common App, UC, FAFSA, visa accounts...) on the Portals page and copy them when a
portal's login page asks. Since migration 0040 the web server encrypts them (AES-256-GCM, key `PORTAL_ENCRYPTION_KEY`
in Vercel) and the database holds only ciphertext. But the owner holds that key and the service-role key, so the owner
(or anyone who gets both) can still open every password. The owner wants it to be **impossible for the site owner to
read a student's password**. The only way to get that is to lock passwords in the student's browser with a key that
never leaves it.

How students use it today (owner's words): click the portal link on the page, then enter the email and password. So the
vault is a reference card used at every portal login, several times in one sitting.

## Goals

- A password is encrypted and decrypted only in the student's browser. The server and database only ever see
  ciphertext and wrapped keys they cannot open.
- The key comes from a **vault passphrase** the student creates. A **recovery code**, shown once, also opens the vault,
  so a forgotten passphrase can be replaced without losing anything.
- Typing the passphrase once unlocks Show / Copy / Save for every saved login until the tab is reloaded or closed.
- The 7 existing server-sealed passwords (all one student, checked 2026-10-29: `v1.` prefix, 7 rows) move into the new
  vault the next time that student unlocks, and the server copy stops existing.
- Afterwards, the server-side opening code, the key fingerprint logic and the portal use of the server key are removed.

## Non-goals

- End-to-end encryption of anything else (usernames, notes, essays, résumé, transcript). Usernames and portal links stay
  as they are.
- Sharing passwords with teachers, parents or AI. They still never see passwords, locked or not.
- A password generator, autofill into portals, or extension access to passwords.
- Server-side passphrase checks or attempt limits (the server can't check a passphrase; see "Known limits").
- New dependencies (no Argon2/zxcvbn libraries). WebCrypto only.

## Anti-goals (would be a failure even if it "works")

- Any path, after the handover, where a plaintext password, the passphrase, the recovery code or the vault key reaches
  our server, the database, logs, localStorage or a URL.
- A failed unlock, a network error or a wrong passphrase that looks like "no saved passwords", or that deletes anything.
- A student losing everything because a recovery code was shown but never actually saved.
- Breaking today's usernames, portal links, copy buttons, clipboard auto-clear, or the "AI tokens get 403" rule.

## What the student sees

- **No vault yet.** The password box on a login row (Portals page, My list) shows "Set up password vault" instead of an
  input. Signed-out users still can't save passwords (unchanged).
- **Setup dialog.** Step 1: passphrase + repeat. Plain warning: nobody, including this site, can reset it. Rules: at
  least 10 characters, not the same as the account email (builder's call: no strength library). Step 2: the recovery
  code, with Copy and Download (.txt) buttons. Step 3: the code is hidden and the student types one group of it, chosen
  at random and named by number ("type group 5"), which proves the code was saved somewhere. The vault is created on
  the server only after that confirmation, so an unconfirmed code never becomes live.
- **Locked.** Rows that hold a password show "Locked" with an Unlock button; typing a new password also asks to unlock
  first. Unlock dialog: passphrase field; "Forgot it? Use your recovery code" switches to code + new passphrase twice.
  Wrong passphrase: "That passphrase doesn't match" (nothing else changes).
- **Unlocked.** Show / Copy / save on blur / Clear work exactly as today.
- **Stays unlocked** for that tab: the key lives only in that page's memory, as a non-extractable WebCrypto key.
  Client-side navigation keeps it; a reload, closing the tab, sign-out or switching account locks it. A "Lock" button
  locks it by hand. No idle timeout (owner's flow is many logins in one sitting). Other tabs unlock separately.
- **Settings > Saved passwords** card: status (no vault / locked / unlocked), Change passphrase (needs the current
  passphrase or the recovery code), New recovery code (needs the passphrase; the old code stops working), Lock now, and
  "Delete all saved passwords and start over" (typed confirmation; the only way out when both secrets are lost).
- **Handover** (only students with old server-sealed rows): right after an unlock, the browser re-locks each old row in
  the background and shows "Moved N saved passwords into your locked vault." A row that fails stays old and is tried
  again on the next unlock; it is never dropped.
- **Recovery code use** does not change the code; the student can make a new one in Settings (builder's call).
- All new text in English and zh-TW (`web/lib/i18n/`); the stale lines that say passwords are plaintext or readable by
  AI (`security.ts`, `privacy.ts`) and the server-key wording (portal notices, `common.ts`, `connect-ai.ts`) are
  rewritten to describe the new vault, including the limit below.

## Crypto (decided)

All in WebCrypto, same code in the browser and in Node 24 tests (`globalThis.crypto.subtle`).

- **Vault key (VK):** 32 random bytes, used as an AES-256-GCM key. After unwrapping it is imported non-extractable.
  Changing the passphrase or the recovery code re-unwraps VK with the secret the student just typed (so the in-memory
  key never needs to be extractable).
- **Vault key id:** a random 16-character base64url id made with the vault (not derived from any secret). It is stored
  on the vault row and named in every password value, so a value saved under a replaced vault (another tab after "start
  over", say) is refused by the server instead of being stored where nobody can open it.
- **Passphrase wrap:** PBKDF2-HMAC-SHA-256 over a 16-byte random salt gives 512 bits: the first 256 are the
  key-encryption key (AES-256-GCM, VK encrypted with a 12-byte random IV), the last 256 are a check value whose SHA-256 is
  stored on the vault row. Unlock compares the check first and only then unwraps, so one unlock attempt tests exactly one
  passphrase even if someone with database write access planted a crafted wrapped key. Iterations: 600,000 (OWASP's
  figure for PBKDF2-SHA256), stored per vault so they can be raised later; the client has the same number as a hard
  floor, refuses a vault row below it ("vault settings look wrong", nothing deleted) and never re-wraps with fewer. Show
  "Unlocking…" while it runs (≈0.5-2 s on phones).
- **Recovery code:** 28 random Crockford base32 characters (140 bits), shown in 7 groups of 4 (`XXXX-XXXX-…`). Parsing
  ignores case, spaces and dashes and maps I/L→1, O→0. HKDF-SHA-256 over the normalized code (16-byte random salt, fixed
  info string) gives 512 bits, split into a key-encryption key and a check value exactly as for the passphrase. No
  stretching needed at 140 bits.
- **Each password:** AES-256-GCM under VK, 12-byte random IV, additional data binds it to the user, the slot and the
  vault key id, so a ciphertext moved to another slot, account or vault fails to open. Stored as
  `e1.<key id>.<base64url(iv | ciphertext+tag)>` in the existing `portal_passwords.sealed` column (512-char passwords fit
  far under its 4096 cap).
- Wrapped keys carry their own additional data naming the user, the vault key id and which secret wrapped them.

## Storage and API (decided)

- **New table `public.portal_vaults`**, one row per user: `user_id` (pk, → auth.users on delete cascade), `version`
  ('e1'), vault key id, passphrase salt, iterations, passphrase check hash, passphrase-wrapped VK, recovery salt,
  recovery check hash, recovery-wrapped VK, `created_at`, `updated_at`. Same lockdown as `portal_passwords`: RLS on, no policies, no grants to anon/authenticated (0044 already
  stops default grants), service role only. New migration file (next free number on `origin/main` at build time,
  currently 0045). **Applying it to the live project needs the owner's OK.**
- **The only door stays `POST /api/portal-passwords`**: website token required, AI-connection tokens get 403, user
  verified, as today. It now stores and returns opaque strings. Actions:
  - `vault` → the vault row (or null) + how many rows are `e1` vs old `v1`.
  - `vault_create` → insert only; 409 if one exists, and also refused while the user has any `e1` rows (they belong to
    a vault that is gone; only `reset` clears them). Old `v1` rows don't block it.
  - `vault_update` (change passphrase / new recovery code / reset passphrase with recovery code) → compare-and-set on
    `updated_at`.
  - `list` → slots, marking old `v1` ones.
  - `get {slot}` → the `e1` string. The server never opens it.
  - `set {slot, sealed, expected?}` → the server accepts only a well-formed `e1.` value (strict base64url, minimum
    length) whose key id matches the user's current vault, and rejects anything else (no vault = rejected); `""`/delete as today; `expected` = `updated_at` for compare-and-set (handover,
    concurrent tabs).
  - `delete {slot}` as today.
  - `import {entries: [{slot, sealed}]}` → insert-only; an occupied slot is reported as a conflict and the browser keeps
    its local copy (the sign-in merge dialog of old browser-stored passwords; the browser encrypts first and asks to
    unlock or create the vault; "Not now" keeps them local).
  - `handover {slot}` → only for a `v1` row: the server opens it with the server key and returns it once, for the
    browser to re-lock. Existing key-fingerprint checks stay for this action only. **Temporary.**
  - `reset` → deletes the vault row and all of the user's `portal_passwords` rows in one transaction (a database
    function only the service role can call), so no save can slip in between.
  - `import` follows the same key-id rule as `set`.
  - A row whose key id doesn't match the current vault (shouldn't happen given the rules above) shows "Saved with an
    older vault, can't be opened" with a Clear button, never a silent blank.
  - Removed: `reveal` (replaced by `get` + `handover`) and `migrate` (old plaintext: the college column is already
    dropped on the live project and profile plaintext is 0, checked 2026-10-29), plus `planMigration`, the page-load
    migrate call and `scripts/backfill-portal-passwords.mjs` (nothing to backfill without the student).

## Rollout

1. Owner OK → apply the new migration.
2. Ship the code to `main` (handover active).
3. The owner (the one student with saved passwords) opens Portals, sets up the vault, saves the recovery code, and the
   7 rows are re-locked. Proof: a prefix count on `portal_passwords` shows `v1.` = 0 and `e1.` = 7.
4. Follow-up commit: remove `handover`, `sealPassword`/`openPassword`, the key fingerprint code and `PORTAL_VAULT_CLAIM`;
   update `DEPLOY.md`, `CLAUDE.md`, the 2026-10-28 runbook and `docs/security-2026-10-28.md`. `GOOGLE_TOKEN_ENCRYPTION_KEY`
   stays (Google tokens still use it); `PORTAL_ENCRYPTION_KEY` can be deleted from Vercel. A later migration (owner OK)
   drops `portal_vault_meta` and adds a check that `sealed` starts with `e1.`.

## Testing

- Unit (`node --test`, real WebCrypto): round trip; wrong passphrase fails; recovery code opens and resets the
  passphrase; new recovery code invalidates the old one; ciphertext moved to another slot or user fails; recovery code
  parsing (case, dashes, I/L/O); `set`/`import` reject non-`e1` values (plaintext-looking strings included) and values
  naming another vault key id; `vault_create` refused while `e1` rows exist; a planted wrapped key or an iteration
  count below the floor never unlocks; `get` never opens;
  `handover` refuses `e1` rows; `reset` removes both tables' rows; AI token still 403; request bodies the client builds
  never contain the plaintext, passphrase or code.
- Browser: click through setup, unlock, wrong passphrase, recovery, change passphrase, new code, lock, reset and
  handover against a mock Supabase (the pattern in lessons 2026-10-24/10-28), with screenshots.
- Live: the prefix counts in rollout step 3.
- Fresh-context review of the diff before merging (crypto and data-loss paths).

## Known limits (stated honestly on the Security page)

- Anyone with the database can try to guess a passphrase offline; the 10-character minimum and 600k PBKDF2 rounds slow
  that down but can't stop a weak passphrase being guessed.
- The site's own code runs in the browser, so a changed (malicious) version of the site could capture a password as it
  is typed. End-to-end encryption protects against database leaks, stolen server keys (even with write access to the
  database), backups and the owner looking; it cannot protect against the site's code itself being changed. Bitwarden's
  web vault has the same limit.
- Supabase backups may hold the old server-sealed rows until they expire (those still need the server key to open).

## Left to the builder

File layout and names, component structure, exact copy wording (plain, matching the site), dialog styling with existing
`ui.ts` classes, how the locked state threads through `LoginRow`, chunking of `import`, and test file organisation.
