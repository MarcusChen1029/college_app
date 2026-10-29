# End-to-end Portal Password Vault Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portal passwords are encrypted and opened only in the student's browser (vault passphrase + recovery code); the server stores ciphertext it cannot open, and the 7 existing server-sealed rows move over on the owner's next unlock.

**Architecture:** Pure modules do the work and are tested in Node with real WebCrypto: `vault-format.ts` (encodings, validators), `vault-crypto.ts` (key derivation, wrap, seal/open), `vault-flows.ts` (every browser flow, with the HTTP call injected). The API route keeps its gate (website token, AI tokens 403) and now stores opaque strings through three service-role SQL functions that make key-id checks and "start over" atomic. `portal-vault-client.ts` becomes thin glue between the flows, React state and a single dialog host.

**Tech Stack:** Next.js 16 (App Router), React 19, supabase-js 2.118 (service role on the server), WebCrypto (`globalThis.crypto.subtle`, browser and Node 24), `node --test`, Postgres (Supabase).

**Spec:** `docs/superpowers/specs/2026-10-29-e2e-portal-vault-design.md` (approved 2026-10-29, owner also approved applying the migration).

## Global Constraints

- WebCrypto only; no new npm dependencies.
- Value format `e1.<key id>.<base64url(iv | ciphertext+tag)>`; key id = 16 chars `[A-Za-z0-9_-]`; IV 12 bytes; salts 16 bytes.
- PBKDF2-HMAC-SHA-256, 600,000 iterations, hard floor 600,000 in the client and in the table check; 512 derived bits = 256-bit KEK ‖ 256-bit check value (SHA-256 of it stored).
- Recovery code: 28 Crockford base32 chars (`0123456789ABCDEFGHJKMNPQRSTVWXYZ`), 7 groups of 4; parsing ignores case, spaces, dashes; I/L→1, O→0. HKDF-SHA-256 (16-byte salt, info `college-tracker vault e1 recovery`) → 512 bits split as above.
- Passphrase: at least 10 characters (code points), not equal (case-insensitive, trimmed) to the account email; NFC-normalized before encoding; never trimmed.
- Passwords ≤ 512 chars (`PASSWORD_MAX`), ≤ 500 slots per user (`MAX_SLOTS_PER_USER`), `IMPORT_MAX` 300 per request.
- Plaintext, passphrase, recovery code and vault key never go to the server, logs, localStorage or a URL (exception: `handover` returns a `v1` password from the server, temporary).
- `/api/portal-passwords` keeps: website token required, AI-connection tokens 403, no CORS, `no-store`, error bodies are codes only, nothing logged.
- New table: RLS on, no policies, revoke all from `public, anon, authenticated`; functions: `revoke execute ... from public, anon, authenticated`, grant to `service_role`, `set search_path = ''`.
- Next 16: read `web/node_modules/next/dist/docs/` before writing Next code (`web/AGENTS.md`). Tests import siblings with the `.ts` extension (`node --test lib/*.test.ts`); files a test imports must not use the `@/` alias.
- UI text goes through `web/lib/i18n/` in English and zh-TW (the i18n test fails on missing/unused keys). Use `buttonClass`/`ui.ts` classes; never raw red/amber/green classes.
- Run before every commit: `cd web && npx tsc --noEmit && npm run lint && npm test`. Read the exit code (`; echo exit=$?`), not RTK-compressed text (lessons 2026-10-26).
- Conventional commits (`feat:`, `fix:`, `docs:`), ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work only in `C:\Users\user\Desktop\college\.claude\worktrees\e2e-vault`.

## Review Focus

1. Two tabs: tab A does "start over" and sets up a new vault while tab B is still unlocked with the old key; B's next save must fail with a visible "your vault changed, unlock again" message and store nothing. (Task 5 test `stale tab save is refused`.)
2. Network drop during handover: a `set` or read-back that fails must leave the `v1` row untouched and count it as failed for the next unlock, never delete it. (Task 5 test `handover keeps v1 on failure`.)
3. Same passphrase typed on two devices: NFC vs NFD Chinese/accented input must unlock; phone keyboards must not auto-capitalize or auto-correct the passphrase field. (Task 3 test `NFD passphrase unlocks`; Task 7 input attributes.)
4. Double-click or slow phone on "Create vault": two concurrent commits must not create two vaults or show an error for the one that succeeded. (Task 5 test `double commit is one vault`.)
5. Orphan `e1` rows with no vault (left by a failure mid-way): setup must say so and offer "start over", not loop on an error. (Task 5 test `orphans block setup until reset`.)

---

### Task 1: Migration 0045 — vault table and atomic functions

**Files:**
- Create: `supabase/migrations/0045_portal_vaults.sql` (re-check the next free number on `origin/main` first: `git fetch -q && git ls-tree --name-only origin/main supabase/migrations/ | tail -3`)
- Create: `supabase/patches/2026-10-29_portal_vaults_smoke_test.sql`

**Interfaces:**
- Produces table `public.portal_vaults(user_id uuid pk → auth.users on delete cascade, version text check = 'e1', key_id text check ~ '^[A-Za-z0-9_-]{16}$', pass_salt text, pass_iterations int check between 600000 and 10000000, pass_check text, pass_wrapped text, rec_salt text, rec_check text, rec_wrapped text, created_at timestamptz default now(), updated_at timestamptz default now())`; each base64url column checked with `~ '^[A-Za-z0-9_-]+$'` and exact lengths (salt 22, check 43, wrapped 80 chars).
- Produces `public.portal_vault_create(p_user uuid, p_record jsonb) returns text`: `'exists'` if a vault row exists; `'orphans'` if the user has any `portal_passwords` row whose `sealed` starts with `e1.`; else inserts and returns `'ok'`. Rows starting with `v1.` don't block.
- Produces `public.portal_vault_put(p_user uuid, p_slot text, p_sealed text, p_expected timestamptz, p_insert_only boolean) returns text`: takes `select key_id ... for share` on the vault row (`'no_vault'` if none); `'wrong_vault'` unless `split_part(p_sealed, '.', 2) = key_id` and `p_sealed like 'e1.%'`; with `p_expected` not null: update only where `updated_at = p_expected`, else `'changed'`; with `p_insert_only`: insert on conflict do nothing, `'occupied'` if nothing inserted; otherwise upsert; a new slot past 500 rows → `'too_many'`; sets `updated_at = now()`; returns `'ok'`.
- Produces `public.portal_vault_reset(p_user uuid) returns void`: deletes the vault row first (row lock waits for any `put` holding `for share`), then all the user's `portal_passwords` rows.
- `vault_update` is done by the server with a plain compare-and-set update (Task 4), so no function for it.

- [ ] **Step 1: Write the migration** with the header comment style of 0040 (what, why, who can reach it). All three functions `language plpgsql security invoker set search_path = ''`; `revoke execute on function ... from public, anon, authenticated; grant execute ... to service_role`. Table: `enable row level security`, `revoke all ... from public, anon, authenticated`, `grant select, insert, update, delete ... to service_role`.
- [ ] **Step 2: Write the smoke test patch** as one `begin; ... rollback;` block that, for a throwaway uuid inserted into `auth.users`, asserts with `raise exception` on mismatch: create → `'ok'`, create again → `'exists'`; put with wrong key id → `'wrong_vault'`; put insert-only twice → `'ok'` then `'occupied'`; put with a stale `p_expected` → `'changed'`; reset → vault and rows gone; an `e1.` row with no vault → create returns `'orphans'`; `anon` and `authenticated` have no privilege on the table or functions (`has_table_privilege`, `has_function_privilege`).
- [ ] **Step 3: Static check:** `grep -c "revoke" supabase/migrations/0045_portal_vaults.sql` ≥ 4. Not applied yet: applying is the rollout step after the code is reviewed.
- [ ] **Step 4: Commit** `feat(db): portal_vaults table and atomic vault functions (0045)`.

### Task 2: `vault-format.ts` — encodings and validators

**Files:**
- Create: `web/lib/vault-format.ts`
- Test: `web/lib/vault-format.test.ts`

**Interfaces:**
- Produces:
  - `export const PBKDF2_MIN_ITERATIONS = 600_000; export const RECOVERY_LENGTH = 28; export const RECOVERY_GROUPS = 7;`
  - `b64u(bytes: Uint8Array): string` (no padding) and `fromB64u(s: string): Uint8Array | null` (strict alphabet, null on anything else)
  - `type E1Parts = { keyId: string; body: Uint8Array }`; `parseE1(sealed: unknown): E1Parts | null` (prefix `e1.`, key id regex, body ≥ 12 + 16 + 1 bytes); `e1Value(keyId: string, body: Uint8Array): string`; `isKeyId(v: unknown): v is string`; `newKeyId(): string` (12 random bytes → 16 chars)
  - `type VaultRecord = { version: "e1"; key_id: string; pass_salt: string; pass_iterations: number; pass_check: string; pass_wrapped: string; rec_salt: string; rec_check: string; rec_wrapped: string }`; `parseVaultRecord(v: unknown): VaultRecord | null` (exact keys only; salts decode to 16 bytes, checks to 32, wrapped to 60; iterations integer in [600000, 10000000])
  - `normalizeRecoveryCode(input: string): string | null` (28 valid chars after mapping, else null); `formatRecoveryCode(code: string): string` (`XXXX-XXXX-…`); `recoveryGroup(code: string, n: number): string` (1-based)
  - `passphraseProblem(passphrase: string, email: string | null): "too_short" | "is_email" | null`

- [ ] **Step 1: Write failing tests**: `b64u round trip and strict rejects` (`fromB64u("ab+c") === null`, `fromB64u("ab=") === null`); `parseE1` accepts `e1Value(id, 29 bytes)`, rejects `"hunter2"`, `"e1.short.abc"`, `"v1." + ...`, a body of 28 bytes, non-strings; `parseVaultRecord` rejects iterations 599999, an extra key, a 15-byte salt; `normalizeRecoveryCode("abcd efgh-ijkl-mnop-qrst-vwxy-z01o")` maps I/L→1 and O→0 and returns 28 chars, `normalizeRecoveryCode("U".repeat(28)) === null`, a 27-char input → null; `formatRecoveryCode` gives 7 groups joined by `-`; `recoveryGroup(code, 5) === code.slice(16, 20)`; `passphraseProblem("123456789", null) === "too_short"`, `passphraseProblem("我的護照密碼很長很長", null) === null` (10 code points), `passphraseProblem(" Me@X.com ", "me@x.com") === "is_email"`.
- [ ] **Step 2: Run** `cd web && node --test lib/vault-format.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** in `web/lib/vault-format.ts` (no imports beyond `globalThis.crypto.getRandomValues`; usable on server and client).
- [ ] **Step 4: Run** the test → PASS; then `npx tsc --noEmit; echo exit=$?` → `exit=0`.
- [ ] **Step 5: Commit** `feat(vault): value and record formats for the browser-locked vault`.

### Task 3: `vault-crypto.ts` — derive, wrap, seal, open

**Files:**
- Create: `web/lib/vault-crypto.ts`
- Test: `web/lib/vault-crypto.test.ts`

**Interfaces:**
- Consumes: everything from Task 2.
- Produces:
  - `type Secret = { passphrase: string } | { recovery: string }`
  - `type NewVault = { record: VaultRecord; recoveryCode: string; key: CryptoKey }`
  - `createVault(userId: string, passphrase: string): Promise<NewVault>` (random VK, key id, both wraps; `key` = VK imported non-extractable)
  - `unlockVault(userId: string, record: VaultRecord, secret: Secret): Promise<CryptoKey | "wrong" | "bad_record">` (re-validates with `parseVaultRecord`, floor enforced → `"bad_record"`; compares the check hash before unwrapping; GCM failure after a matching check → `"bad_record"`)
  - `rewrapPassphrase(userId: string, record: VaultRecord, secret: Secret, newPassphrase: string): Promise<VaultRecord | "wrong" | "bad_record">` (same key id and recovery wrap; new salt; iterations = max(record, 600000))
  - `rewrapRecovery(userId: string, record: VaultRecord, passphrase: string): Promise<{ record: VaultRecord; recoveryCode: string } | "wrong" | "bad_record">`
  - `sealE1(key: CryptoKey, keyId: string, userId: string, slot: string, password: string): Promise<string>`; `openE1(key: CryptoKey, keyId: string, userId: string, slot: string, sealed: string): Promise<string | null>` (null for another key id, tamper, wrong slot/user)
- Additional data strings (exact): wraps `vault:e1|user:<userId>|key:<keyId>|by:passphrase` and `…|by:recovery`; passwords `pw:e1|user:<userId>|key:<keyId>|slot:<slot>`. Raw VK bytes exist only inside create/rewrap and are zeroed (`fill(0)`) before returning.

- [ ] **Step 1: Write failing tests** (real WebCrypto, real 600k iterations): `round trip` (create → unlock with passphrase → sealE1/openE1 equals); `wrong passphrase is "wrong"`; `recovery code unlocks` (also lowercased with spaces); `rewrapPassphrase with recovery then new passphrase unlocks, old fails`; `rewrapRecovery invalidates the old code`; `moved ciphertext fails` (other slot, other user, other key id → null); `NFD passphrase unlocks` (vault made with `"Café-密碼-123".normalize("NFC")`, unlocked with `.normalize("NFD")`); `planted wrapped key never unlocks` (record with `pass_wrapped` swapped for another vault's → `"bad_record"` or `"wrong"`, never a key); `iterations below floor is bad_record`; `record bytes carry no plaintext` (JSON of record and sealed value contains neither passphrase nor password nor recovery code).
- [ ] **Step 2: Run** `node --test lib/vault-crypto.test.ts` → FAIL.
- [ ] **Step 3: Implement.** PBKDF2 via `importKey("raw", utf8(nfc), "PBKDF2")` + `deriveBits({name:"PBKDF2", hash:"SHA-256", salt, iterations}, 512)`; HKDF via `importKey("raw", utf8(normalizedCode), "HKDF")` + `deriveBits({name:"HKDF", hash:"SHA-256", salt, info}, 512)`; KEK = first 32 bytes imported as AES-GCM non-extractable; check = `b64u(SHA-256(last 32 bytes))`.
- [ ] **Step 4: Run** → PASS; `npx tsc --noEmit; echo exit=$?` → 0.
- [ ] **Step 5: Commit** `feat(vault): browser-side key derivation and password sealing`.

### Task 4: Server — request parsing, handler, store, route

**Files:**
- Modify: `web/lib/portal-slots.ts:192-226` (`VaultRequest`, `parseVaultRequest`), `web/lib/portal-vault-handler.ts`, `web/lib/portal-vault-server.ts`, `web/app/api/portal-passwords/route.ts` (header comment lists the new actions)
- Delete: `web/lib/portal-migrate.ts`, `web/lib/portal-migrate.test.ts`, `scripts/backfill-portal-passwords.mjs` (and its two tests in `web/lib/portal-vault.test.ts:120-160`)
- Test: `web/lib/portal-vault-handler.test.ts`, `web/lib/portal-slots.test.ts`
- Keep unchanged: `web/lib/portal-vault.ts` (v1 open + key fingerprint, used by `handover`; removed in the follow-up), `tokenSource`/`bearerToken`.

**Interfaces:**
- Consumes: `parseE1`, `isKeyId`, `parseVaultRecord`, `VaultRecord` (Task 2); SQL functions (Task 1).
- Produces (`portal-slots.ts`):
  ```ts
  export type SealedEntry = { slot: string; sealed: string };
  export type VaultRequest =
    | { action: "vault" | "list" | "reset" }
    | { action: "vault_create"; record: VaultRecord }
    | { action: "vault_update"; record: VaultRecord; expected: string }
    | { action: "get" | "delete" | "handover"; slot: string }
    | { action: "set"; slot: string; sealed: string; expected: string | null }
    | { action: "import"; entries: SealedEntry[] };
  export type VaultRequestError = "bad_request" | "bad_slot" | "bad_value" | "bad_record" | "too_many";
  ```
  `set`/`import` values must pass `parseE1` (`bad_value` otherwise, including any plaintext and `""`); `expected` is an ISO timestamp string or absent.
- Produces (`portal-vault-handler.ts`): `type SlotState = { slot: string; kind: "e1" | "v1" | "other"; updated_at: string }` and
  ```ts
  export type VaultDeps = {
    verifyUser(token: string): Promise<string | null>;
    keyStatus(): Promise<KeyStatus | "no_key">;                // only consulted by handover
    vault(userId: string): Promise<(VaultRecord & { updated_at: string }) | null>;
    createVault(userId: string, r: VaultRecord): Promise<"ok" | "exists" | "orphans">;
    updateVault(userId: string, r: VaultRecord, expected: string): Promise<{ updated_at: string } | "changed" | "no_vault">;
    list(userId: string): Promise<SlotState[]>;                // kind "other" = e1 with another key id
    get(userId: string, slot: string): Promise<string | null>; // the stored string, never opened
    put(userId: string, e: SealedEntry, expected: string | null, insertOnly: boolean): Promise<"ok" | "no_vault" | "wrong_vault" | "changed" | "occupied" | "too_many">;
    remove(userId: string, slot: string): Promise<void>;
    handover(userId: string, slot: string): Promise<{ password: string; updated_at: string } | "missing" | "not_legacy" | "unreadable">;
    reset(userId: string): Promise<void>;
  };
  ```
  Replies: `vault` → `{ vault: record+updated_at | null }`; `vault_create` → `{ ok: true }` / 409 `exists` / 409 `orphans`; `vault_update` → `{ ok: true, updated_at }` / 409 `changed` / 404 `no_vault` / 409 `wrong_vault` when `record.key_id` differs from the stored one; `list` → `{ slots: SlotState[] }`; `get` → `{ sealed }` / 404 `not_found`; `set` → `{ ok: true }` / 404 `no_vault` / 409 `wrong_vault|changed|too_many`; `delete` → `{ ok: true }`; `import` → `{ imported: number, failed: string[] }` (every non-`ok` put is a failed slot); `handover` → `{ password, updated_at }` / 404 `not_found` / 409 `not_legacy|unreadable` / 503 `key_mismatch|key_unclaimed|no_key`; `reset` → `{ ok: true }`.
  Check order stays: token 401 → AI token 403 → session 401 → body 400 → action. The key check moves inside `handover` only.
- `portal-vault-server.ts`: `VaultConfig.key` becomes `Buffer | null`; `vaultConfig()` returns null only when a Supabase setting is missing; `put`/`createVault`/`reset` call the RPCs; `list` classifies rows with `parseE1` + the vault's key id (`sealed` values never leave the server except through `get`); `handover` = existing open logic for `v1.` rows only.

- [ ] **Step 1: Rewrite the failing tests**: in `portal-slots.test.ts` replace the request-parsing cases: `set rejects plaintext` (`{action:"set", slot:"system:common_app", sealed:"hunter2"}` → `bad_value`), `set rejects ""`, `import rejects a plaintext entry`, `vault_create rejects a record below 600000`, `migrate and reveal are gone` (→ `bad_request`); keep slot-format and leak tests. In `portal-vault-handler.test.ts`: `AI token is 403 before anything`; `key mismatch blocks only handover` (deps.keyStatus → "mismatch": `list` 200, `handover` 503 `key_mismatch`); `no_key answers 503 for handover`; `get never opens` (deps.get returns the string; reply body equals `{ sealed }`); `import reports non-ok puts as failed`; `each action runs exactly one dep`; `failures answer 500 with a code only`.
- [ ] **Step 2: Run** `node --test lib/portal-slots.test.ts lib/portal-vault-handler.test.ts` → FAIL.
- [ ] **Step 3: Implement** parsing, handler, server deps, route comment; delete the migrate files and the backfill script; remove `PORTAL_VAULT_CLAIM`-dependent code paths only where they guarded non-handover actions.
- [ ] **Step 4: Run** `npx tsc --noEmit && npm run lint && npm test; echo exit=$?` → 0 (fix any test that imported `portal-migrate`).
- [ ] **Step 5: Commit** `feat(vault): server stores only browser-sealed values; v1 handover`.

### Task 5: `vault-flows.ts` — every browser flow, tested end to end in Node

**Files:**
- Create: `web/lib/vault-flows.ts`
- Test: `web/lib/vault-flows.test.ts` (an in-memory `VaultDeps` with the Task 1 semantics, wired through the real `handleVault` and `parseVaultRequest`; the `call` the flows get is `(body) => handleVault(token, JSON.parse(JSON.stringify(body)), deps)` mapped to `{ status, data }`)

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces:
  ```ts
  export type Call = (body: Record<string, unknown>) => Promise<{ status: number; data: Record<string, unknown> }>;
  export type FlowError = "unauthorized" | "unavailable" | "not_found" | "too_many" | "no_vault" | "wrong_vault" | "changed" | "exists" | "orphans" | "bad_record" | "failed";
  export type Unlocked = { userId: string; keyId: string; key: CryptoKey };
  export type ServerVault = { record: VaultRecord; updatedAt: string };
  export type Prepared = NewVault & { passphrase: string; confirmGroup: number }; // 1..7
  fetchVault(call: Call): Promise<ServerVault | null | { error: FlowError }>;
  listSlots(call: Call): Promise<SlotState[] | { error: FlowError }>;
  prepareVault(userId: string, passphrase: string): Promise<Prepared>;            // createVault + self-test: unlock by passphrase AND by recovery code, seal/open a probe; throws "self_test_failed"
  commitVault(call: Call, userId: string, p: Prepared, typedGroup: string): Promise<Unlocked | "group_mismatch" | FlowError>; // "exists" with the same key_id on the server = success (double click)
  unlockWith(call: Call, userId: string, secret: Secret, newPassphrase?: string): Promise<Unlocked | "wrong" | FlowError>;   // recovery + newPassphrase = rewrap + vault_update
  revealOne(call: Call, u: Unlocked, slot: string): Promise<{ password: string } | { error: FlowError | "other_vault" }>;
  saveOne(call: Call, u: Unlocked, slot: string, password: string): Promise<FlowError | null>;  // seal, openE1 check, set
  handoverAll(call: Call, u: Unlocked, legacy: readonly SlotState[]): Promise<{ moved: number; failed: number }>; // per slot: handover → seal → open check → set with expected → get → open equals
  importAll(call: Call, u: Unlocked, entries: readonly SlotPassword[]): Promise<SlotPassword[]>;           // returns entries NOT stored
  changePassphrase(call: Call, userId: string, secret: Secret, newPassphrase: string): Promise<null | "wrong" | FlowError>;
  newRecoveryCode(call: Call, userId: string, passphrase: string): Promise<{ recoveryCode: string } | "wrong" | FlowError>;
  resetAll(call: Call): Promise<FlowError | null>;
  ```

- [ ] **Step 1: Write failing tests**, one per behavior: `setup then unlock in a new tab` (second `Unlocked` from `unlockWith` opens the first tab's saved password); `group mismatch creates nothing`; `double commit is one vault` (`Promise.all` of two `commitVault` with the same `Prepared` → both `Unlocked`, server has one vault); `stale tab save is refused` (tab B unlocked; tab A `resetAll` + new vault; B `saveOne` → `"wrong_vault"` or `"no_vault"`, server unchanged); `orphans block setup until reset` (seed an `e1` row with no vault → `commitVault` → `"orphans"`; after `resetAll` → `Unlocked`); `recovery resets the passphrase` (old passphrase now `"wrong"`); `handover moves v1 rows` (seed 3 `v1` rows via the real `sealPassword` from `portal-vault.ts` and a deps.handover that opens them → `{moved: 3, failed: 0}`, `listSlots` all `e1`, each `revealOne` equals the original); `handover keeps v1 on failure` (deps.put throws for one slot → `{moved: 2, failed: 1}`, that row still `v1` and unchanged); `import keeps occupied and locked` (occupied slot returned as not stored); `nothing secret crosses the wire` (record every `call` body: none contains the passphrase, the recovery code, or any plaintext password — except `handover` replies, which are server → browser).
- [ ] **Step 2: Run** `node --test lib/vault-flows.test.ts` → FAIL.
- [ ] **Step 3: Implement** `vault-flows.ts` (imports with `.ts` extensions; no React, no supabase-js).
- [ ] **Step 4: Run** `npm test; echo exit=$?` → 0.
- [ ] **Step 5: Commit** `feat(vault): browser vault flows with an end-to-end test against the real handler`.

### Task 6: Client glue and the student store

**Files:**
- Modify: `web/lib/portal-vault-client.ts` (whole file), `web/lib/student-store.ts:14, 254-258, 307-313, 729-733`

**Interfaces:**
- Consumes: Task 5 flows (the `call` here is the existing fetch wrapper).
- Produces (`portal-vault-client.ts`):
  ```ts
  export type VaultLock = "unknown" | "none" | "locked" | "unlocked";
  export type VaultDialog = null | "setup" | "unlock";
  export type VaultView = { status: VaultStatus; lock: VaultLock; slots: ReadonlySet<string>; other: ReadonlySet<string>; legacy: number; dialog: VaultDialog; moved: number | null };
  useVault(): VaultView; loadSlots(): Promise<void>;          // loads vault + list once per page and account
  openVaultDialog(d: "setup" | "unlock"): void; closeVaultDialog(): void;
  prepare(passphrase: string): Promise<Prepared>; commit(p: Prepared, typedGroup: string): ReturnType<typeof commitVault>;
  unlock(secret: Secret, newPassphrase?: string): Promise<"ok" | "wrong" | FlowError>;
  lock(): void; onUnlock(cb: () => void): () => void;
  revealPassword, savePassword, deletePassword, forgetPassword (same names and shapes as today, error union widened to FlowError | "locked" | "other_vault");
  importPasswords(entries: readonly SlotPassword[]): Promise<SlotPassword[]>; // locked or no vault → returns all entries
  changePassphrase, newRecoveryCode, resetVault  // thin wrappers over the flows
  copyText, copySecret, CLIPBOARD_CLEAR_MS       // unchanged
  ```
  The `Unlocked` key lives in a module variable only; `loadSlots` on a different user, sign-out, and `lock()` drop it. After a successful unlock: run `handoverAll` when `legacy > 0` (sets `moved`), then every `onUnlock` callback.
- `student-store.ts`: remove `migrateStoredPasswords` and `migratedFor`; register `onUnlock(() => moveLocalPasswords())` once, where `moveLocalPasswords` sends `localPasswords` through `importPasswords` and keeps the ones not stored (same bookkeeping as the merge path at :311-313).

- [ ] **Step 1: Implement** the client and store changes.
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint && npm test; echo exit=$?` → 0, and `grep -rn "migrateStoredPasswords\|action: \"reveal\"\|action: \"migrate\"" web` → no matches (use the Grep tool with a positive control, lessons 2026-10-25).
- [ ] **Step 3: Commit** `feat(vault): client keeps the vault key in memory and runs handover after unlock`.

### Task 7: UI — dialogs, password field, Settings card, copy

**Files:**
- Create: `web/components/VaultDialogs.tsx` (`VaultDialogHost`: setup in 3 steps, unlock with a "use recovery code" mode), `web/components/VaultSettings.tsx`
- Modify: `web/app/layout.tsx:108` (mount `<VaultDialogHost />` next to `LocalMergeDialogHost`), `web/components/LoginRow.tsx:82-238` (`PasswordField`), `web/components/SettingsPage.tsx` (card next to `ConnectedExtensions`), `web/components/LocalMergeDialog.tsx` (failed text), `web/components/PortalsPage.tsx` (one-line "moved N" notice from `view.moved`), `web/lib/i18n/messages/portals.ts` and `settings.ts` (en + zh-TW)

**Interfaces:**
- Consumes: Task 6 client exports only.

Behavior (from the spec's "What the student sees"; wording is the builder's, plain and short):
- `PasswordField`: `lock === "none"` → button "Set up password vault" (opens setup); `"locked"` → saved rows show "Locked" + Unlock button, empty rows show Unlock to type; `"unlocked"` → today's Show / Copy / save-on-blur / Clear; a slot in `other` → "Saved with an older vault, can't be opened" + Clear. `wrong_vault`/`no_vault` errors → lock and ask to unlock again.
- Setup: step 1 passphrase + repeat (`passphraseProblem` messages, the "nobody can reset it" warning); step 2 code shown with Copy (use `copyText`, not `copySecret`) and Download (`recovery-code.txt` via a Blob URL, revoked after click); step 3 code hidden, "Type group N"; `orphans` → explain + offer "Delete all saved passwords and start over".
- Passphrase inputs: `type="password"`, `autoComplete="new-password"` on setup / `"current-password"` on unlock, `autoCapitalize="off"`, `autoCorrect="off"`, `spellCheck={false}`; buttons disabled with "Unlocking…" while a derivation runs.
- Settings card: status; Change passphrase (current passphrase or recovery code + new twice); New recovery code (passphrase, then the step 2/3 screens); Lock now; Start over (type `DELETE` to confirm, then `resetVault`).

- [ ] **Step 1: Implement** components and dictionary keys (both languages).
- [ ] **Step 2: Verify** `npx tsc --noEmit && npm run lint && npm test; echo exit=$?` → 0 (the i18n test proves both dictionaries match).
- [ ] **Step 3: Commit** `feat(vault): setup, unlock and recovery dialogs; locked password field; Settings card`.

### Task 8: Wording and docs

**Files:**
- Modify: `web/lib/i18n/messages/security.ts:20-30`, `privacy.ts:16,34-36`, `common.ts:56-66`, `portals.ts:39-61` (+ zh-TW copies), `web/lib/connect-ai.ts:15`, `CONNECT_AI_SETUP.md:89`, `CLAUDE.md` (portal-password lines + migration next number 0046), `DEPLOY.md:68-77` (key now only needed until the handover is done), `docs/superpowers/plans/2026-10-28-portal-password-encryption.md` (top note: superseded by this plan), `docs/security-2026-10-28.md:11,36`

- [ ] **Step 1: Rewrite** each line to say: passwords are locked in the student's browser with their vault passphrase; the site, its owner, teachers and AI can't open them; the two known limits from the spec (offline guessing of weak passphrases; a changed version of the site's own code).
- [ ] **Step 2: Verify** `npm test; echo exit=$?` → 0 and Grep `plain text|plaintext|readable by AI` in `web/lib/i18n/messages/{security,privacy}.ts` → no stale claim left.
- [ ] **Step 3: Commit** `docs: describe the browser-locked password vault`.

### After the tasks (controller, not a task)

1. Fresh-context opus review of the whole branch (crypto, data-loss paths, Review Focus list).
2. Browser click-through against a mock Supabase (setup, wrong passphrase, recovery, change, new code, lock, start over, handover of seeded `v1` rows), screenshots.
3. `git fetch` and re-check `origin/main` for new migrations or edits to the same files; apply 0045 (owner approved 2026-10-29), run the smoke patch, `list_migrations` to confirm.
4. Ship: PR to `main`, merge after checks.
5. Owner unlocks once on the live site; prove with `select left(sealed,3), count(*) from portal_passwords group by 1` → only `e1.` = 7.
6. Follow-up plan: remove `handover`, `portal-vault.ts` v1 code, `portal_vault_meta`, `PORTAL_ENCRYPTION_KEY`; migration adding `check (sealed like 'e1.%')`.
