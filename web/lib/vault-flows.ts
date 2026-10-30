// Every browser-side flow of the portal vault, in one place and free of React, Supabase and the page: setup, unlock,
// recovery, change of passphrase or code, saving, showing, importing passwords saved before sign-in, and starting over. Each flow takes a `call` (one POST to /api/portal-passwords, already
// carrying the session) so the whole thing runs against the real handler in Node tests (vault-flows.test.ts).
// The passphrase, the recovery code, the vault key and every plaintext password stay in this code and the crypto it
// calls (vault-crypto.ts): a request body holds only the vault record's salts, checks and wrapped keys, or values
// already sealed here. Nothing here logs. A reply code that isn't one of the known ones is "failed". A write whose
// reply is lost is not assumed to have failed: the vault is read back (storeRecord, commitVault).

import { importFailures, IMPORT_MAX, isPortalSlot, SEALED_MAX, type SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import {
  createVault,
  openE1,
  rewrapPassphrase,
  rewrapRecovery,
  sealE1,
  unlockVault,
  type NewVault,
  type Secret,
} from "./vault-crypto.ts";
import { normalizeRecoveryCode, parseVaultRecord, RECOVERY_GROUPS, recoveryGroup, type VaultRecord } from "./vault-format.ts";

/** One POST to the vault endpoint; `data` is the parsed JSON reply ({} when there was none), status 0 = unreachable. */
export type Call = (body: Record<string, unknown>) => Promise<{ status: number; data: Record<string, unknown> }>;

export type FlowError =
  | "unauthorized"
  | "unavailable"
  | "not_found"
  | "too_many"
  | "no_vault"
  | "wrong_vault"
  | "changed"
  | "exists"
  | "orphans"
  | "bad_record"
  // The account keeps its passwords on its device now (0049): the server refuses vault writes. Reload to follow.
  | "device_mode"
  | "failed";

/** A tab with the vault open: the non-extractable vault key, and the user and vault key id every sealed value is bound to. */
export type Unlocked = { userId: string; keyId: string; key: CryptoKey };
/** The account's vault row as the server holds it; `updatedAt` is the exact string to hand back as `expected`. */
export type ServerVault = { record: VaultRecord; updatedAt: string };
/**
 * A vault made in memory and not yet stored. `confirmGroup` (1..7) is the group of the recovery code to type back. The
 * passphrase is not part of it: nothing after the first step needs it, so it isn't kept through the next ones.
 */
export type Prepared = NewVault & { confirmGroup: number };
/**
 * A new recovery code made in memory and not yet live: `record` is the vault with the new code's wrapper, `expected` the
 * `updated_at` of the vault it was made from. Until commitRecoveryCode stores it, the old code is the only one that works.
 */
export type PreparedRecovery = { record: VaultRecord; recoveryCode: string; confirmGroup: number; expected: string };

type Reply = Awaited<ReturnType<Call>>;
type Loose = Record<string, unknown>;

const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);

// A call that throws, or returns something that is not a reply, is a request that did not work.
async function send(call: Call, body: Loose): Promise<Reply> {
  try {
    const r = await call(body);
    return r && typeof r.status === "number" && isObj(r.data) ? r : { status: 0, data: {} };
  } catch {
    return { status: 0, data: {} };
  }
}

const REPLY_CODES: ReadonlySet<string> = new Set(["not_found", "too_many", "no_vault", "wrong_vault", "changed", "exists", "orphans", "bad_record", "device_mode"]);

function errorOf(r: Reply): FlowError {
  if (r.status === 401) return "unauthorized";
  if (r.status === 503) return "unavailable"; // a missing server setting, not the student's doing
  const code = r.data.error;
  return typeof code === "string" && REPLY_CODES.has(code) ? (code as FlowError) : "failed";
}

// A write counts as done only when the server says so in as many words.
const done = (r: Reply) => r.status === 200 && r.data.ok === true;

// The crypto helpers throw on input they refuse (an empty passphrase or password, a lone surrogate): that is "failed".
async function attempt<T>(f: () => Promise<T>): Promise<T | "failed"> {
  try {
    return await f();
  } catch {
    return "failed";
  }
}

/** Seals a password and opens the result again before it may go anywhere; null when either step doesn't hold. */
async function sealChecked(u: Unlocked, slot: string, password: string): Promise<string | null> {
  try {
    const sealed = await sealE1(u.key, u.keyId, u.userId, slot, password);
    return (await openE1(u.key, u.keyId, u.userId, slot, sealed)) === password ? sealed : null;
  } catch {
    return null;
  }
}

// The nine keys of a VaultRecord and nothing else: parseVaultRecord wants exactly these, so a field the server adds to its
// reply later (a created_at, say) must not turn every unlock into "bad_record". The type makes TypeScript refuse a missing
// or misspelt key here.
const recordOf = (v: Loose): Record<keyof VaultRecord, unknown> => ({
  version: v.version,
  key_id: v.key_id,
  pass_salt: v.pass_salt,
  pass_iterations: v.pass_iterations,
  pass_check: v.pass_check,
  pass_wrapped: v.pass_wrapped,
  rec_salt: v.rec_salt,
  rec_check: v.rec_check,
  rec_wrapped: v.rec_wrapped,
});

/** The account's vault row, null when there is none, or why it couldn't be read. A row that fails the format check is "bad_record". */
export async function fetchVault(call: Call): Promise<ServerVault | null | { error: FlowError }> {
  const r = await send(call, { action: "vault" });
  if (r.status !== 200 || !("vault" in r.data)) return { error: errorOf(r) };
  const v = r.data.vault;
  if (v === null) return null;
  if (!isObj(v) || typeof v.updated_at !== "string") return { error: "failed" };
  const record = parseVaultRecord(recordOf(v));
  return record ? { record, updatedAt: v.updated_at } : { error: "bad_record" };
}

const KINDS: ReadonlySet<unknown> = new Set(["e1", "other"]);

/** Every stored slot with its kind (never the value). */
export async function listSlots(call: Call): Promise<SlotState[] | { error: FlowError }> {
  const r = await send(call, { action: "list" });
  if (r.status !== 200 || !Array.isArray(r.data.slots)) return { error: errorOf(r) };
  const slots: SlotState[] = [];
  for (const s of r.data.slots) {
    if (!isObj(s) || typeof s.slot !== "string" || typeof s.updated_at !== "string" || !KINDS.has(s.kind)) return { error: "failed" };
    slots.push({ slot: s.slot, kind: s.kind as SlotState["kind"], updated_at: s.updated_at });
  }
  return slots;
}

// 252 = 7 * 36: bytes at or above it are dropped, so every group is equally likely.
function randomGroup(): number {
  const b = new Uint8Array(1);
  do {
    globalThis.crypto.getRandomValues(b);
  } while (b[0] >= 252);
  return (b[0] % RECOVERY_GROUPS) + 1;
}

const SELF_TEST_SLOT = "system:self-test";
const SELF_TEST_VALUE = "vault self-test";

/**
 * A new vault, made but not stored, after proving it works: it unlocks by the passphrase and by the recovery code, and a
 * value sealed with the new key opens under both unlocked keys. Throws "self_test_failed" otherwise; the student is
 * never shown a recovery code that doesn't work. Nothing is sent anywhere.
 */
export async function prepareVault(userId: string, passphrase: string): Promise<Prepared> {
  const made = await createVault(userId, passphrase);
  const byPassphrase = await unlockVault(userId, made.record, { passphrase });
  const byRecovery = await unlockVault(userId, made.record, { recovery: made.recoveryCode });
  if (typeof byPassphrase === "string" || typeof byRecovery === "string") throw new Error("self_test_failed");
  try {
    const sealed = await sealE1(made.key, made.record.key_id, userId, SELF_TEST_SLOT, SELF_TEST_VALUE);
    for (const key of [made.key, byPassphrase, byRecovery])
      if ((await openE1(key, made.record.key_id, userId, SELF_TEST_SLOT, sealed)) !== SELF_TEST_VALUE) throw new Error("self_test_failed");
  } catch {
    throw new Error("self_test_failed");
  }
  return { ...made, confirmGroup: randomGroup() };
}

// A typed group read the way a recovery code is (case, spaces and dashes ignored; I and L as 1, O as 0): padded to a
// whole code so the one normalizer decides, and null unless it was exactly four characters of the alphabet.
function normalizeGroup(typed: string): string | null {
  const code = normalizeRecoveryCode(`${typed}${"0".repeat(24)}`);
  return code ? code.slice(0, 4) : null;
}

// Whether what the student typed is the group of the code that was asked for (the proof that the code was saved).
function groupMatches(recoveryCode: string, confirmGroup: number, typedGroup: string): boolean {
  const want = recoveryGroup(recoveryCode, confirmGroup);
  return want !== "" && typeof typedGroup === "string" && normalizeGroup(typedGroup) === want;
}

/**
 * The last step of setup: the typed group must match the one asked for ("group_mismatch" creates nothing and sends
 * nothing), then the vault is stored. A second click that meets its own vault, or a reply that was lost after the
 * vault was stored, is a success (the stored vault has this key id); any other vault is "exists", and an `e1` row
 * without a vault is "orphans".
 */
export async function commitVault(call: Call, userId: string, p: Prepared, typedGroup: string): Promise<Unlocked | "group_mismatch" | FlowError> {
  if (!groupMatches(p.recoveryCode, p.confirmGroup, typedGroup)) return "group_mismatch";
  const unlocked: Unlocked = { userId, keyId: p.record.key_id, key: p.key };
  const r = await send(call, { action: "vault_create", record: p.record });
  if (done(r)) return unlocked;
  const there = await fetchVault(call);
  return there && !("error" in there) && there.record.key_id === p.record.key_id ? unlocked : errorOf(r);
}

// The same vault, for a record that was sent and a vault that was read back: the key id and both checks. A new passphrase
// or a new recovery code always brings a new salt, so a changed wrapper always has a new check.
const sameVault = (a: VaultRecord, b: VaultRecord) => a.key_id === b.key_id && a.pass_check === b.pass_check && a.rec_check === b.rec_check;

/**
 * Stores a record made by a rewrap or a new recovery code, if the vault still has `expected` as updated_at. A reply that
 * isn't a clean "ok" may hide a write that did happen (the connection dropped after the commit, a 5xx, a mangled body),
 * and then the new passphrase or code is already live while the caller thinks it isn't. So on anything but a clean ok the
 * stored vault is read back: if it holds this record's checks the write happened (null), otherwise the reply's error. This
 * also makes a second click on the same step a success instead of "changed".
 */
async function storeRecord(call: Call, record: VaultRecord, expected: string): Promise<null | FlowError> {
  const r = await send(call, { action: "vault_update", record, expected });
  if (done(r)) return null;
  const there = await fetchVault(call);
  return there && !("error" in there) && sameVault(there.record, record) ? null : errorOf(r);
}

/**
 * Opens the vault with the passphrase or the recovery code. With `newPassphrase` as well (the "forgot it" path) the
 * vault is first re-wrapped under the new passphrase and stored; the recovery code stays as it was. "wrong" = the
 * secret doesn't match. The derivation is slow on purpose, so the caller shows "Unlocking...".
 */
export async function unlockWith(call: Call, userId: string, secret: Secret, newPassphrase?: string): Promise<Unlocked | "wrong" | FlowError> {
  const from = await fetchVault(call);
  if (from === null) return "no_vault";
  if ("error" in from) return from.error;
  const key = await attempt(() => unlockVault(userId, from.record, secret));
  if (typeof key === "string") return key;
  if (newPassphrase !== undefined) {
    const next = await attempt(() => rewrapPassphrase(userId, from.record, secret, newPassphrase));
    if (typeof next === "string") return next;
    const stored = await storeRecord(call, next, from.updatedAt);
    if (stored) return stored;
  }
  return { userId, keyId: from.record.key_id, key };
}

/**
 * One saved password, or why it can't be shown. "other_vault" = the stored value doesn't open with this vault (an older
 * vault, a moved or damaged value).
 */
export async function revealOne(call: Call, u: Unlocked, slot: string): Promise<{ password: string } | { error: FlowError | "other_vault" }> {
  const r = await send(call, { action: "get", slot });
  if (r.status !== 200) return { error: errorOf(r) };
  const sealed = r.data.sealed;
  if (typeof sealed !== "string") return { error: "failed" };
  const password = await openE1(u.key, u.keyId, u.userId, slot, sealed); // null for another key id, slot or user, or a damaged value
  return password === null ? { error: "other_vault" } : { password };
}

/**
 * Seals one password, opens it again to be sure, then stores it (replacing the slot's value). The plaintext never leaves.
 * With `expected` (the slot's updated_at as listed) it is a compare-and-set: "changed" when the stored row moved on.
 */
export async function saveOne(call: Call, u: Unlocked, slot: string, password: string, expected?: string): Promise<FlowError | null> {
  const sealed = await sealChecked(u, slot, password);
  if (sealed === null) return "failed";
  const r = await send(call, expected === undefined ? { action: "set", slot, sealed } : { action: "set", slot, sealed, expected });
  return done(r) ? null : errorOf(r);
}

const IMPORT_BODY_MAX = 200_000; // bytes of JSON in one import request

const jsonBytes = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

type Sealed = { slot: string; sealed: string };

/**
 * Saves passwords that were kept in this browser before sign-in, sealed here, insert-only (a slot that already holds a
 * value keeps it). One entry per slot, the first wins. Requests are cut at IMPORT_MAX entries and ~200 KB. Returns the
 * entries NOT confirmed stored (occupied, refused, unsealable, or in a request that failed); the browser keeps those.
 */
export async function importAll(call: Call, u: Unlocked, entries: readonly SlotPassword[]): Promise<SlotPassword[]> {
  const seen = new Set<string>();
  const unique = entries.filter((e) => !seen.has(e.slot) && seen.add(e.slot));

  const items: Sealed[] = [];
  for (const e of unique) {
    const sealed = isPortalSlot(e.slot) ? await sealChecked(u, e.slot, e.password) : null;
    if (sealed !== null && sealed.length <= SEALED_MAX) items.push({ slot: e.slot, sealed });
  }

  const empty = jsonBytes({ action: "import", entries: [] });
  const chunks: Sealed[][] = [];
  let chunk: Sealed[] = [];
  let size = empty;
  for (const item of items) {
    const n = jsonBytes(item) + 1; // and the comma
    if (chunk.length > 0 && (chunk.length >= IMPORT_MAX || size + n > IMPORT_BODY_MAX)) {
      chunks.push(chunk);
      chunk = [];
      size = empty;
    }
    chunk.push(item);
    size += n;
  }
  if (chunk.length > 0) chunks.push(chunk);

  const stored = new Set<string>();
  for (const c of chunks) {
    const r = await send(call, { action: "import", entries: c });
    const failed = new Set(importFailures(c, r));
    // A reply that doesn't add up (imported + failed != sent) is not trusted: the whole request counts as not stored.
    if (r.status === 200 && r.data.imported === c.length - failed.size) for (const item of c) if (!failed.has(item)) stored.add(item.slot);
  }
  return unique.filter((e) => !stored.has(e.slot));
}

/** The vault under a new passphrase, proved by the current passphrase or the recovery code. Same key, same saved passwords. */
export async function changePassphrase(call: Call, userId: string, secret: Secret, newPassphrase: string): Promise<null | "wrong" | FlowError> {
  const from = await fetchVault(call);
  if (from === null) return "no_vault";
  if ("error" in from) return from.error;
  const next = await attempt(() => rewrapPassphrase(userId, from.record, secret, newPassphrase));
  if (typeof next === "string") return next;
  return storeRecord(call, next, from.updatedAt);
}

/**
 * Step 1 of a new recovery code (needs the passphrase): makes the code and the vault record that carries it, in memory.
 * The only request is the one that reads the vault, so the old code keeps working and the new one is not live until
 * commitRecoveryCode stores it. Like prepareVault, the new code must open the new record before it is handed back.
 */
export async function prepareRecoveryCode(call: Call, userId: string, passphrase: string): Promise<PreparedRecovery | "wrong" | FlowError> {
  const from = await fetchVault(call);
  if (from === null) return "no_vault";
  if ("error" in from) return from.error;
  const made = await attempt(() => rewrapRecovery(userId, from.record, passphrase));
  if (typeof made === "string") return made;
  const test = await attempt(() => unlockVault(userId, made.record, { recovery: made.recoveryCode }));
  if (typeof test === "string") return "failed";
  return { record: made.record, recoveryCode: made.recoveryCode, confirmGroup: randomGroup(), expected: from.updatedAt };
}

/**
 * Step 2: the typed group must match the one asked for ("group_mismatch" sends nothing and the old code stays the only
 * one), then the record is stored if the vault is still the one the code was made from ("changed" otherwise; make a new
 * code). A reply that was lost after the write counts as done: the stored vault is read back (storeRecord).
 */
export async function commitRecoveryCode(call: Call, p: PreparedRecovery, typedGroup: string): Promise<null | "group_mismatch" | FlowError> {
  if (!groupMatches(p.recoveryCode, p.confirmGroup, typedGroup)) return "group_mismatch";
  return storeRecord(call, p.record, p.expected);
}

/** "Start over": the vault and every saved password are deleted on the server. Null when it worked. */
export async function resetAll(call: Call): Promise<FlowError | null> {
  const r = await send(call, { action: "reset" });
  return done(r) ? null : errorOf(r);
}
