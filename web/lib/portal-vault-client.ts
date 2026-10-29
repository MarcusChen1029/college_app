"use client";

// The browser side of saved portal passwords, end to end: a password is sealed here, under a vault key that only this
// tab holds, before it goes to POST /api/portal-passwords (with the website's own access token); the server stores and
// returns opaque strings. Every vault step (setup, unlock, recovery, sealing, moving old rows over, importing passwords
// saved before sign-in) is in vault-flows.ts; this file adds the page's state: which slots hold a password, whether the
// vault is locked, the open dialog, and the unlocked key.
// The key lives in the module variable `unlocked` and nowhere else: not in React state, storage or a URL. lock(),
// sign-out, another account and a vault that changed elsewhere drop it; a reload forgets it. A passphrase, a recovery
// code or a plaintext password is only passed straight through to the flows, by the component that holds it. Passwords
// never go through the profile/list store (student-store.ts). Nothing here logs or touches localStorage. Pure helpers
// live in portal-slots.ts so tests can reach them.

import { useSyncExternalStore } from "react";
import type { SlotPassword } from "./portal-slots";
import type { SlotState } from "./portal-vault-handler";
import { browserSupabase } from "./supabase-browser";
import type { Secret } from "./vault-crypto";
import {
  changePassphrase as changePassphraseFlow,
  commitRecoveryCode,
  commitVault,
  fetchVault,
  handoverAll,
  importAll,
  listSlots,
  prepareRecoveryCode,
  prepareVault,
  resetAll,
  revealOne,
  saveOne,
  unlockWith,
  type Call,
  type FlowError,
  type Prepared,
  type PreparedRecovery,
  type Unlocked,
} from "./vault-flows";

// What the dialogs need to type their own state, so they import from here only.
export type { FlowError, Prepared, PreparedRecovery, Secret, Unlocked };

const ENDPOINT = "/api/portal-passwords";

/** idle: not asked yet; unavailable: the server isn't set up for passwords (503); error: couldn't reach it. */
export type VaultStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
/** unknown: not asked yet (or the server couldn't say); none: the account has no vault; locked / unlocked: this tab can't / can open passwords. */
export type VaultLock = "unknown" | "none" | "locked" | "unlocked";
export type VaultDialog = null | "setup" | "unlock";
export type VaultView = {
  status: VaultStatus;
  lock: VaultLock;
  /** Slots that hold a password of any kind (sealed under the vault, old server-sealed, or one this vault can't open). */
  slots: ReadonlySet<string>;
  /** Slots whose stored value is neither of ours: nothing here can open it, only Clear helps. */
  other: ReadonlySet<string>;
  /** How many slots still hold an old server-sealed value, waiting to be moved into the vault at the next unlock. */
  legacy: number;
  dialog: VaultDialog;
  /** How many old rows the latest handover moved into the vault (0 when every row failed); null when none ran since the last lock. */
  moved: number | null;
};
/** Why a password could not be shown or saved. "locked" = this tab has no open vault; the rest are the flows' own codes. */
export type VaultError = FlowError | "locked" | "other_vault" | "legacy";

const INITIAL: VaultView = { status: "idle", lock: "unknown", slots: new Set(), other: new Set(), legacy: 0, dialog: null, moved: null };
let view: VaultView = INITIAL;
let viewUser: string | null = null; // whose slots `view` holds
let listing: Promise<void> | null = null;
let kinds = new Map<string, SlotState["kind"]>(); // every stored slot and what holds it, as last listed
let unlocked: Unlocked | null = null; // this tab's vault key; see the header
let following: Promise<void> = Promise.resolve(); // after-unlock jobs, one at a time
let watching = false;
const listeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();

function emit(next: VaultView) {
  view = next;
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Which slots hold a password, whether the vault is open in this tab, and whether the store can be reached. */
export const useVault = () => useSyncExternalStore(subscribe, () => view, () => INITIAL);

// The key, only while it belongs to the account this page is showing.
const openKey = (): Unlocked | null => (unlocked && unlocked.userId === viewUser ? unlocked : null);

// A different account (or none): nothing of the old one stays, least of all its key.
function adopt(uid: string | null) {
  viewUser = uid;
  listing = null;
  unlocked = null;
  kinds = new Map();
  emit(INITIAL);
}

// Sign-out and switching accounts must lock this tab even when no password field is on screen to notice.
function watchAccount() {
  if (watching || typeof window === "undefined") return;
  try {
    browserSupabase().auth.onAuthStateChange((_event, session) => {
      const uid = session?.user.id ?? null;
      if (viewUser !== null && uid !== viewUser) adopt(uid);
    });
    watching = true;
  } catch {
    // no Supabase configured: there is no account to lock
  }
}

async function currentSession() {
  try {
    return (await browserSupabase().auth.getSession()).data.session;
  } catch {
    return null;
  }
}

/** The signed-in account, after dropping everything that belonged to another one. Null when signed out. */
async function account(): Promise<string | null> {
  const uid = (await currentSession())?.user.id ?? null;
  watchAccount();
  if (uid !== viewUser) adopt(uid);
  return uid;
}

function markUnavailable() {
  kinds = new Map();
  emit({ ...view, status: "unavailable", slots: new Set(), other: new Set(), legacy: 0 });
}

const call: Call = async (body) => {
  const session = await currentSession();
  if (!session) return { status: 401, data: { error: "unauthorized" } };
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 503 && viewUser === session.user.id) markUnavailable();
    return { status: res.status, data };
  } catch {
    return { status: 0, data: { error: "network" } };
  }
};

// The same reply table as vault-flows.ts, for the one request it has no flow for (delete).
const REPLY_CODES: ReadonlySet<string> = new Set(["not_found", "too_many", "no_vault", "wrong_vault", "changed", "exists", "orphans", "bad_record"]);
function errorOf(r: { status: number; data: Record<string, unknown> }): FlowError {
  if (r.status === 401) return "unauthorized";
  if (r.status === 503) return "unavailable";
  const code = r.data.error;
  return typeof code === "string" && REPLY_CODES.has(code) ? (code as FlowError) : "failed";
}

function viewKinds(from: ReadonlyMap<string, SlotState["kind"]>) {
  const slots = new Set<string>();
  const other = new Set<string>();
  let legacy = 0;
  from.forEach((kind, slot) => {
    slots.add(slot);
    if (kind === "other") other.add(slot);
    else if (kind === "v1") legacy++;
  });
  return { slots, other, legacy };
}

// These slots now hold a value sealed under the vault (or none, when `has` is false). Ignored when the page has moved
// on to another account while the request was out.
function markSlots(uid: string, slots: readonly string[], has: boolean) {
  if (viewUser !== uid) return;
  const next = new Map(kinds);
  for (const slot of slots) {
    if (has) next.set(slot, "e1");
    else next.delete(slot);
  }
  kinds = next;
  emit({ ...view, ...viewKinds(next) });
}
const markSlot = (uid: string, slot: string, has: boolean) => markSlots(uid, [slot], has);

// Asks the server for the vault and the slot list together and shows both. A key that no longer fits the stored vault
// (reset or replaced from another tab) is dropped here.
async function refresh(uid: string): Promise<"ok" | "unavailable" | "error"> {
  const [vault, listed] = await Promise.all([fetchVault(call), listSlots(call)]);
  if (viewUser !== uid) return "error";
  const failure = (vault !== null && "error" in vault ? vault.error : null) ?? (Array.isArray(listed) ? null : listed.error);
  if (failure === "unavailable") {
    markUnavailable();
    return "unavailable";
  }
  if (failure || !Array.isArray(listed)) {
    emit({ ...view, status: "error" });
    return "error";
  }
  const keyId = vault && !("error" in vault) ? vault.record.key_id : null;
  if (unlocked?.userId === uid && unlocked.keyId !== keyId) unlocked = null;
  kinds = new Map(listed.map((s) => [s.slot, s.kind] as const));
  emit({ ...view, status: "ready", lock: keyId === null ? "none" : openKey() ? "unlocked" : "locked", ...viewKinds(kinds) });
  return "ok";
}

/** Loads the vault and the slot list: once per page and account (again after a failed try). Safe to call from every login row. */
export async function loadSlots(): Promise<void> {
  const uid = await account();
  if (!uid) return;
  listing ??= (async () => {
    emit({ ...view, status: "loading" });
    const result = await refresh(uid);
    if (viewUser === uid && result === "error") listing = null; // try again next time
  })();
  return listing;
}

export function openVaultDialog(dialog: "setup" | "unlock") {
  if (view.dialog !== dialog) emit({ ...view, dialog });
}
export function closeVaultDialog() {
  if (view.dialog !== null) emit({ ...view, dialog: null });
}

/** Locks this tab: the key is dropped, passwords need the passphrase (or recovery code) again. */
export function lock() {
  unlocked = null;
  emit({ ...view, lock: view.lock === "unlocked" ? "locked" : view.lock, moved: null });
}

/** Runs `cb` after every successful unlock (passphrase, recovery code or a new vault), once old rows have been moved. Returns the way to stop. */
export function onUnlock(cb: () => void): () => void {
  unlockListeners.add(cb);
  return () => {
    unlockListeners.delete(cb);
  };
}

// The key is in place: re-lock any old server-sealed rows one at a time (a lock in between stops the rest), show the
// fresh list, then tell the listeners. Nothing in here may throw: a listener's error never reaches the unlock.
async function afterUnlock(u: Unlocked) {
  try {
    const listed = await listSlots(call);
    let moved = 0;
    let tried = false;
    for (const s of Array.isArray(listed) ? listed : []) {
      if (s.kind !== "v1" || openKey() !== u) continue;
      tried = true;
      moved += (await handoverAll(call, u, [s])).moved;
    }
    if (tried && viewUser === u.userId) emit({ ...view, moved });
    if (viewUser === u.userId) await refresh(u.userId);
  } catch {
    // the handover is retried at the next unlock
  }
  for (const cb of [...unlockListeners]) {
    try {
      const result: unknown = cb();
      if (result && typeof (result as Promise<unknown>).catch === "function") (result as Promise<unknown>).catch(() => {});
    } catch {
      // a listener's problem
    }
  }
}

// Takes a fresh key into the page and starts the after-unlock job in the background (the dialog doesn't wait for it).
// False when the page moved on to another account while the key was being made; the key is then simply not kept.
function opened(u: Unlocked): boolean {
  if (viewUser !== u.userId) return false;
  unlocked = u;
  emit({ ...view, lock: "unlocked" });
  following = following.then(() => afterUnlock(u)).catch(() => {});
  return true;
}

// The stored vault is not the one this tab's key belongs to (reset or replaced elsewhere): lock, and look again.
function dropStaleKey(u: Unlocked, code: string) {
  if (unlocked !== u || (code !== "wrong_vault" && code !== "no_vault")) return;
  unlocked = null;
  emit({ ...view, lock: "locked", moved: null });
  void refresh(u.userId);
}

/**
 * Step 1 of setup: makes the vault and its recovery code in memory after proving they work. Nothing is sent. Throws when
 * the self-test fails or nobody is signed in; the dialog shows its generic error.
 */
export async function prepare(passphrase: string): Promise<Prepared> {
  const uid = await account();
  if (!uid) throw new Error("unauthorized");
  return prepareVault(uid, passphrase);
}

/**
 * Step 2: the typed group must match the one asked for ("group_mismatch" creates nothing), then the vault is stored and
 * this tab is unlocked. The `Unlocked` it returns is the key the module already holds: callers only check that the
 * result is not a string and never keep it. A "failed" may hide a vault that was stored after all; the next list shows it.
 */
export async function commit(p: Prepared, typedGroup: string): ReturnType<typeof commitVault> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await commitVault(call, uid, p, typedGroup);
  if (typeof r === "string") return r;
  return opened(r) ? r : "unauthorized";
}

/**
 * Opens the vault in this tab with the passphrase or the recovery code. With `newPassphrase` too (the "forgot it" path)
 * the vault is first re-wrapped under the new passphrase. "ok" = unlocked; old rows are moved in the background and the
 * `onUnlock` listeners run after that. "wrong" = the secret doesn't match. The derivation is slow on purpose.
 */
export async function unlock(secret: Secret, newPassphrase?: string): Promise<"ok" | "wrong" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await unlockWith(call, uid, secret, newPassphrase);
  if (typeof r === "string") return r;
  return opened(r) ? "ok" : "unauthorized";
}

/** One saved password, or why it can't be shown. "legacy" = an old row not moved yet (never offer to delete it); "other_vault" = this vault can't open it (Clear is the way out). */
export async function revealPassword(slot: string): Promise<{ password: string } | { error: VaultError }> {
  const u = openKey();
  if (!u) return { error: "locked" };
  const r = await revealOne(call, u, slot);
  if ("error" in r) {
    if (r.error === "not_found") markSlot(u.userId, slot, false);
    else dropStaleKey(u, r.error);
  }
  return r;
}

/** Saves (or replaces) one password; "" deletes it. Null when it worked. Needs the vault open ("locked" otherwise). */
export async function savePassword(slot: string, password: string): Promise<VaultError | null> {
  if (password === "") return deletePassword(slot);
  const u = openKey();
  if (!u) return "locked";
  const err = await saveOne(call, u, slot, password);
  if (err) {
    dropStaleKey(u, err);
    return err;
  }
  markSlot(u.userId, slot, true);
  return null;
}

/** Deletes one saved password (the vault need not be open). Null when it worked. */
export async function deletePassword(slot: string): Promise<VaultError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await call({ action: "delete", slot });
  if (r.status !== 200 || r.data.ok !== true) return errorOf(r);
  markSlot(uid, slot, false);
  return null;
}

/** For a removed login: deletes its password unless this page already knows there is none. Errors are ignored. */
export function forgetPassword(slot: string | null) {
  if (!slot || (view.status === "ready" && !view.slots.has(slot))) return;
  void deletePassword(slot);
}

/**
 * Moves passwords this browser saved before sign-in into the vault, sealed here. A slot the account already holds keeps
 * the account's value. Resolves to the entries that are NOT confirmed stored (the caller keeps those); when the vault is
 * locked or doesn't exist yet that is every entry and nothing is sent.
 */
export async function importPasswords(entries: readonly SlotPassword[]): Promise<SlotPassword[]> {
  const u = openKey();
  if (!u || entries.length === 0) return [...entries];
  const left = await importAll(call, u, entries);
  const leftSlots = new Set(left.map((e) => e.slot));
  markSlots(u.userId, entries.filter((e) => !leftSlots.has(e.slot)).map((e) => e.slot), true);
  return left;
}

/**
 * The vault under a new passphrase, proved by the current passphrase or the recovery code; same key, same saved
 * passwords. Null when it worked. A "failed" can mean the write landed and only its reply was lost (and the read-back
 * failed too): do not reset anything on it, offer the same step again.
 */
export async function changePassphrase(secret: Secret, newPassphrase: string): Promise<null | "wrong" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return changePassphraseFlow(call, uid, secret, newPassphrase);
}

/**
 * Step 1 of a new recovery code: made in memory from the passphrase (this tab need not be unlocked), not live yet; the
 * old code keeps working. "locked" is part of the type for callers that handle every vault error alike; it is not
 * returned today.
 */
export async function prepareRecovery(passphrase: string): Promise<PreparedRecovery | "wrong" | FlowError | "locked"> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return prepareRecoveryCode(call, uid, passphrase);
}

/**
 * Step 2: the typed group must match the one asked for ("group_mismatch" sends nothing and the old code stays the only
 * one), then the new code goes live. "changed" = the vault moved on in between: prepare again. A "failed" can mean the
 * write landed and only its reply was lost (and the read-back failed too): keep the prepared code, do not clear or
 * reset anything, offer the same step again.
 */
export async function commitRecovery(p: PreparedRecovery, typedGroup: string): Promise<null | "group_mismatch" | FlowError> {
  return commitRecoveryCode(call, p, typedGroup);
}

/** "Start over": the vault and every saved password are deleted on the server, and this tab forgets its key. Null when it worked. */
export async function resetVault(): Promise<FlowError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const err = await resetAll(call);
  if (err) return err;
  unlocked = null;
  kinds = new Map();
  emit({ ...view, lock: "none", slots: new Set(), other: new Set(), legacy: 0, moved: null });
  return null;
}

// --- Clipboard ---------------------------------------------------------------------------------------------------

export const CLIPBOARD_CLEAR_MS = 30_000;
const RETRY_FOR_MS = 2 * 60_000;
let lastCopied: string | null = null; // what this page last put on the clipboard
let watchingCopies = false;

/** Copies text and remembers it was this page's last copy. False when the browser refused. */
export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    lastCopied = value;
    return true;
  } catch {
    return false;
  }
}

/** Copies a password, then clears the clipboard after 30 s if it still holds it (best effort; see clearLater). */
export async function copySecret(value: string): Promise<boolean> {
  if (!watchingCopies) {
    watchingCopies = true;
    // The student copied something else on this page: the clipboard no longer holds the password.
    document.addEventListener("copy", () => {
      lastCopied = null;
    });
  }
  if (!(await copyText(value))) return false;
  const until = Date.now() + CLIPBOARD_CLEAR_MS + RETRY_FOR_MS;
  setTimeout(() => void clearLater(value, until), CLIPBOARD_CLEAR_MS);
  return true;
}

// Clears only while this page's last copy is still the password, and, where the browser lets the page read the
// clipboard without asking, only if the clipboard still holds it. Writing needs the page focused: if the student is
// on the portal's tab, it tries again when they come back, for up to two more minutes.
async function clearLater(value: string, until: number) {
  if (lastCopied !== value) return;
  try {
    const perm = await navigator.permissions?.query({ name: "clipboard-read" as PermissionName });
    if (perm?.state === "granted" && (await navigator.clipboard.readText()) !== value) return;
  } catch {
    // reading isn't allowed here (most browsers): rely on lastCopied
  }
  try {
    await navigator.clipboard.writeText("");
    if (lastCopied === value) lastCopied = null;
  } catch {
    if (Date.now() < until) window.addEventListener("focus", () => void clearLater(value, until), { once: true });
  }
}
