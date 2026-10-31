"use client";

// The browser side of saved portal passwords, end to end: a password is sealed here, under a vault key that only this
// tab holds, before it goes to POST /api/portal-passwords (with the website's own access token); the server stores and
// returns opaque strings. Every vault step (setup, unlock, recovery, sealing, importing passwords saved before
// sign-in) is in vault-flows.ts; this file adds the page's state: which slots hold a password, whether the
// vault is locked, the open dialog, and the unlocked key.
// The key lives in the module variable `unlocked` and nowhere else: not in React state, storage or a URL. lock(),
// sign-out, another account and a vault that changed elsewhere drop it; a reload forgets it. A passphrase, a recovery
// code or a plaintext password is only passed straight through to the flows, by the component that holds it. Passwords
// never go through the profile/list store (student-store.ts). Nothing here logs or touches localStorage. Pure helpers
// live in portal-slots.ts so tests can reach them.
// Device mode (0049, docs/superpowers/specs/2026-10-30-device-only-passwords-design.md): the account's
// student_profiles.password_storage says where its passwords live. This file reads it with the vault and the slot list
// (refresh) and writes it only through writeMode (one column, upserted). In "device" mode the same functions
// (revealPassword, savePassword, deletePassword, forgetPassword, importPasswords) work on this browser's device store
// (device-passwords.ts over IndexedDB) for the signed-in account instead of the server; nothing of it is ever sent in a
// request. Switching is in password-mode.ts (switchToDevice / switchToVault below). Sign-out keeps the device store; it
// is keyed by account, so another account never sees it. The student store hears about mode changes (onPasswordMode)
// and tells this file when a profile load found a different one (noteProfileMode).

import { useSyncExternalStore } from "react";
import { devicePasswords, type DevicePasswords } from "./device-passwords";
import { idbDeviceStorage } from "./device-passwords-idb";
import { canLock, oneAtATime, type Hold, type LockError } from "./one-at-a-time";
import {
  clearServerVault,
  dropUnreadable,
  fencedDevice,
  fencedVault,
  fencedWrite,
  importToDevice,
  moveToDevice,
  moveToVault,
  resolveConflict as resolveConflictFlow,
  type ClearResult,
  type HoldReason,
  type ResolveError,
  type ToDeviceError,
  type ToDeviceResult,
  type ToVaultError,
  type ToVaultResult,
  type VaultSide,
  type WriteMode,
} from "./password-mode";
import type { SlotPassword } from "./portal-slots";
import type { SlotState } from "./portal-vault-handler";
import { PASSWORD_STORAGE_COLUMN, passwordStorageRow, toPasswordStorage, UNDEFINED_COLUMN, type PasswordStorage } from "./student-rows";
import { browserSupabase } from "./supabase-browser";
import type { Secret } from "./vault-crypto";
import {
  changePassphrase as changePassphraseFlow,
  commitRecoveryCode,
  commitVault,
  fetchVault,
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

// What the dialogs need to type their own state, so they import from here only. `Unlocked` is deliberately not among
// them. One result does carry a key: `Prepared` (from prepare()) holds the new vault's key and recovery code (never the
// passphrase) until commit() stores the vault; only the setup dialog holds it, in its own state, and drops it when it closes.
export type { FlowError, Prepared, PreparedRecovery, Secret };
// The switch results (field meanings in password-mode.ts).
export type { HoldReason, LockError, ResolveError, ToDeviceError, ToDeviceResult, ToVaultError, ToVaultResult };
/**
 * retryServerDelete's result: ok = the old vault is gone from the server; "wrong_mode" = the account isn't in device mode
 * now; LockError = this browser can't run it one tab at a time ("no_locks"), or it was given up ("timeout").
 */
export type ClearServerResult = ClearResult | { ok: false; error: "wrong_mode" | LockError; slots: string[] };
/** Where the signed-in account keeps its portal passwords: "vault" (server, synced, passphrase) or "device" (this browser only). */
export type PasswordMode = PasswordStorage;

const ENDPOINT = "/api/portal-passwords";

/** idle: not asked yet; unavailable: the server isn't set up for passwords (503); error: couldn't reach it. */
export type VaultStatus = "idle" | "loading" | "ready" | "unavailable" | "error";
/**
 * The account's vault on the server, in either mode. unknown: not asked yet (or the server couldn't say); none: the
 * account has no vault; locked / unlocked: this tab can't / can open its passwords. In device mode a vault is only left
 * when deleting the old one failed (see serverLeft); passwords there are open when deviceAvailable (passwordsOpen).
 */
export type VaultLock = "unknown" | "none" | "locked" | "unlocked";
export type VaultDialog = null | "setup" | "unlock";
export type VaultView = {
  status: VaultStatus;
  lock: VaultLock;
  /**
   * Slots that hold a password of any kind. Vault mode: on the server (sealed under the vault, or one this vault can't
   * open). Device mode: on this device for this account.
   */
  slots: ReadonlySet<string>;
  /** Slots whose stored value can't be opened (vault mode: another vault's or damaged; device mode: damaged here): only Clear helps. */
  other: ReadonlySet<string>;
  dialog: VaultDialog;
  /** Where this account keeps its passwords (the profile's password_storage). "vault" until the first load says otherwise. */
  mode: PasswordMode;
  /** This browser can keep device-mode passwords (IndexedDB works). Meaningful once deviceChecked; false then = "This browser can't keep passwords". */
  deviceAvailable: boolean;
  /** This device's storage has answered for the account (in vault mode it is read after the vault, so the page never waits for it). */
  deviceChecked: boolean;
  /**
   * Logins found holding one password on this device and a different one in the vault (by the last switch, move or
   * delete of the old vault on this page). Settings lists them; resolveConflict(slot, keep) keeps one copy.
   */
  conflicts: ReadonlySet<string>;
  /** The result of a move into the vault that ran by itself once Setup / Unlock opened the vault (dismissAutoMoved clears it). */
  autoMoved: ToVaultResult | null;
  /** Passwords this device holds for the account, in either mode (in vault mode they are left over: switchToVault moves them). */
  deviceCount: number;
  /** Device mode: passwords the old vault still holds on the server (0 = none); retryServerDelete deletes them. Always 0 in vault mode. */
  serverLeft: number;
  /**
   * This browser can run the steps that move passwords or delete the old vault one tab at a time (Web Locks). False:
   * switching, moving, deleting the old vault, keeping one copy of a conflict and Start over are off ("update your
   * browser"); saving, showing and clearing a password still work.
   */
  canSwitch: boolean;
};
/**
 * Why a password could not be shown or saved. "locked" = this tab has no open vault; the rest are the flows' own codes.
 * Device mode uses the same codes: "unavailable" = this browser can't keep passwords, "other_vault" = the value saved
 * here can't be opened, "not_found" = none saved here, "failed" = refused input or a write that didn't read back.
 */
export type VaultError = FlowError | "locked" | "other_vault";

const INITIAL: VaultView = {
  status: "idle",
  lock: "unknown",
  slots: new Set(),
  other: new Set(),
  dialog: null,
  mode: "vault",
  deviceAvailable: false,
  deviceChecked: false,
  conflicts: new Set(),
  autoMoved: null,
  deviceCount: 0,
  serverLeft: 0,
  canSwitch: false,
};
let view: VaultView = INITIAL;
let viewUser: string | null = null; // whose slots `view` holds
let listing: Promise<void> | null = null;
let kinds = new Map<string, SlotState["kind"]>(); // every slot stored on the server and what holds it, as last listed
let devSlots = new Set<string>(); // this account's slots on this device, as last listed
let devOther = new Set<string>(); // of those, the ones that didn't open here
let deviceReadyFor: string | null = null; // the account whose device mode was last found ready (unlock listeners told)
let conflictSlots = new Set<string>(); // see VaultView.conflicts
let pendingMove: string | null = null; // the account whose move into the vault waits for the vault to open (moveIntoVault)
let knownMode: { uid: string; mode: PasswordMode } | null = null; // the mode last read or written, for when a read fails
let unlocked: Unlocked | null = null; // this tab's vault key; see the header
let keyEpoch = 0; // counts every change of the key, so a read that went out before one can tell it is out of date
let following: Promise<void> = Promise.resolve(); // after-unlock jobs, one at a time
let watching = false;
const listeners = new Set<() => void>();
const unlockListeners = new Set<() => void>();
const modeListeners = new Set<(userId: string, mode: PasswordMode) => void>();

// The device store of this browser, made on first use (null storage on the server side or without IndexedDB).
let deviceStore: DevicePasswords | null = null;
const device = (): DevicePasswords => (deviceStore ??= devicePasswords(typeof window === "undefined" ? null : idbDeviceStorage()));

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

/** Whether passwords can be shown and saved right now: device mode on a browser that can keep them, or an unlocked vault. */
export const passwordsOpen = (v: VaultView): boolean => (v.mode === "device" ? v.deviceAvailable : v.lock === "unlocked");

/** Runs `cb` whenever the account's mode is read or written (the student store keeps profile.passwordStorage with it). Returns the way to stop. */
export function onPasswordMode(cb: (userId: string, mode: PasswordMode) => void): () => void {
  modeListeners.add(cb);
  return () => {
    modeListeners.delete(cb);
  };
}
function tellMode(userId: string, mode: PasswordMode) {
  for (const cb of [...modeListeners]) {
    try {
      cb(userId, mode);
    } catch {
      // a listener's problem
    }
  }
}

/**
 * The student store read the profile and found `mode`: if this page shows that account in the other mode (switched on
 * another device, say), everything is read again so passwords go to the right place.
 */
export function noteProfileMode(userId: string, mode: PasswordMode) {
  if (viewUser === userId && view.status === "ready" && view.mode !== mode) void refresh(userId);
}

// What the view shows for `mode`: the slots of the store passwords live in, and the counts of the other one.
function lists(mode: PasswordMode) {
  const deviceCount = devSlots.size;
  const conflicts = new Set(conflictSlots);
  const canSwitch = canLock();
  if (mode === "device") return { slots: new Set(devSlots), other: new Set([...devOther].filter((s) => devSlots.has(s))), deviceCount, serverLeft: kinds.size, conflicts, canSwitch };
  return { ...viewKinds(kinds), deviceCount, serverLeft: 0, conflicts, canSwitch };
}

// Conflicts found (or settled) by a switch, a move or resolveConflict on this page.
function noteConflicts(uid: string, slots: readonly string[], found: boolean) {
  if (viewUser !== uid || !slots.length) return;
  conflictSlots = new Set(conflictSlots);
  for (const slot of slots) {
    if (found) conflictSlots.add(slot);
    else conflictSlots.delete(slot);
  }
  emit({ ...view, ...lists(view.mode) });
}

// This device's list as just read (or "unavailable"): a conflict for a login no longer saved here is gone too.
function takeDeviceList(dev: string[] | "unavailable") {
  devSlots = new Set(dev === "unavailable" ? [] : dev);
  devOther = new Set([...devOther].filter((s) => devSlots.has(s)));
  if (dev !== "unavailable") conflictSlots = new Set([...conflictSlots].filter((s) => devSlots.has(s)));
}

// The key, only while it belongs to the account this page is showing.
const openKey = (): Unlocked | null => (unlocked && unlocked.userId === viewUser ? unlocked : null);

// The one place the key is set or dropped.
function setKey(next: Unlocked | null) {
  unlocked = next;
  keyEpoch++;
}

// A different account (or none): nothing of the old one stays, least of all its key. The first account of the page has
// nothing to drop, so a dialog opened before anything asked for it (the merge dialog's "Unlock") stays open.
function adopt(uid: string | null) {
  const first = viewUser === null && uid !== null;
  viewUser = uid;
  listing = null;
  setKey(null);
  kinds = new Map();
  devSlots = new Set();
  devOther = new Set();
  deviceReadyFor = null;
  conflictSlots = new Set();
  pendingMove = null;
  emit(first && view.dialog !== null ? { ...INITIAL, dialog: view.dialog } : INITIAL);
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

// The password endpoint answered 503 (the server isn't set up for vault passwords). Device mode doesn't need it: only
// what it knew of the old vault is dropped there, and its passwords stay on screen.
function markUnavailable() {
  kinds = new Map();
  if (view.mode === "device") emit({ ...view, ...lists("device") });
  else emit({ ...view, status: "unavailable", slots: new Set(), other: new Set() });
}

// The requests of a flow started for account `uid`. Each one carries the session's token only while that session is
// still `uid`'s: after a sign-out, or a sign-in to another account in this tab, nothing more is sent and the flow sees
// "unauthorized", so one account's record or passwords never reach another's. With `signal` (a locked step's, see
// sidesFor) nothing is sent once it aborted, and a request still out is cancelled.
const callFor =
  (uid: string, signal?: AbortSignal): Call =>
  async (body) => {
    if (signal?.aborted) return { status: 0, data: { error: "network" } };
    const session = await currentSession();
    if (!session || session.user.id !== uid) return { status: 401, data: { error: "unauthorized" } };
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
        signal,
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      // A 503 means the server isn't set up for passwords.
      if (res.status === 503 && viewUser === uid) markUnavailable();
      return { status: res.status, data };
    } catch {
      return { status: 0, data: { error: "network" } };
    }
  };

// The same reply table as vault-flows.ts, for the one request it has no flow for (delete).
const REPLY_CODES: ReadonlySet<string> = new Set(["not_found", "too_many", "no_vault", "wrong_vault", "changed", "exists", "orphans", "bad_record", "device_mode"]);
function errorOf(r: { status: number; data: Record<string, unknown> }): FlowError {
  if (r.status === 401) return "unauthorized";
  if (r.status === 503) return "unavailable";
  const code = r.data.error;
  return typeof code === "string" && REPLY_CODES.has(code) ? (code as FlowError) : "failed";
}

function viewKinds(from: ReadonlyMap<string, SlotState["kind"]>) {
  const slots = new Set<string>();
  const other = new Set<string>();
  from.forEach((kind, slot) => {
    slots.add(slot);
    if (kind === "other") other.add(slot);
  });
  return { slots, other };
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
  emit({ ...view, ...lists(view.mode) });
}
const markSlot = (uid: string, slot: string, has: boolean) => markSlots(uid, [slot], has);

// The same for this device's store: these slots now hold a password that opens here (or none).
function markDevice(uid: string, slots: readonly string[], has: boolean) {
  if (viewUser !== uid) return;
  devSlots = new Set(devSlots);
  devOther = new Set(devOther);
  for (const slot of slots) {
    if (has) devSlots.add(slot);
    else devSlots.delete(slot);
    devOther.delete(slot);
  }
  emit({ ...view, ...lists(view.mode) });
}
// A device value that turned out not to open here: only Clear helps.
function markDeviceOther(uid: string, slot: string) {
  if (viewUser !== uid || devOther.has(slot)) return;
  devOther = new Set(devOther).add(slot);
  emit({ ...view, ...lists(view.mode) });
}

// The mode as just read or written for `uid`. A move into the vault waiting for an unlock (pendingMove) is dropped as
// soon as the account is found in device mode: it must never run there (and a move never writes the mode anyway).
function sawMode(uid: string, mode: PasswordMode) {
  if (mode === "device" && pendingMove === uid) pendingMove = null;
}

// The account's mode as stored, or null when it couldn't be read (or the session is no longer `uid`'s). A database
// without the column (migration 0049 not applied yet) can only mean "vault".
async function readMode(uid: string): Promise<PasswordMode | null> {
  const session = await currentSession();
  if (!session || session.user.id !== uid) return null;
  let mode: PasswordMode | null;
  try {
    const { data, error } = await browserSupabase().from("student_profiles").select(PASSWORD_STORAGE_COLUMN).eq("user_id", uid).maybeSingle();
    if (error) mode = error.code === UNDEFINED_COLUMN ? "vault" : null;
    else mode = toPasswordStorage((data as Record<string, unknown> | null)?.[PASSWORD_STORAGE_COLUMN]);
  } catch {
    mode = null;
  }
  if (mode) sawMode(uid, mode);
  return mode;
}

// Saves the account's mode (this column only; see passwordStorageRow). True only once the stored value is confirmed: a
// reply that was lost after the write landed is caught by reading it back. Then the page and the student store follow.
async function writeMode(uid: string, mode: PasswordMode): Promise<boolean> {
  const session = await currentSession();
  if (!session || session.user.id !== uid) return false;
  let ok = false;
  try {
    const { data, error } = await browserSupabase().from("student_profiles").upsert(passwordStorageRow(uid, mode)).select(PASSWORD_STORAGE_COLUMN).maybeSingle();
    ok = !error && (data as Record<string, unknown> | null)?.[PASSWORD_STORAGE_COLUMN] === mode;
  } catch {
    // read back below
  }
  if (!ok) ok = (await readMode(uid)) === mode;
  if (ok) {
    sawMode(uid, mode);
    knownMode = { uid, mode };
    if (viewUser === uid && view.mode !== mode) emit({ ...view, mode, ...lists(mode) });
    tellMode(uid, mode);
  }
  return ok;
}

// Asks the server for the vault, the slot list and the account's mode, and this device for its slots, and shows them.
// - The mode: a read that fails falls back to the last one known on this page (else "vault"): the vault's view still
//   works, and a vault write after a switch elsewhere is refused by the server (device_mode), which reads it again.
// - Device mode waits for this device's list but not for the vault endpoint: a 503 or a failed list there only leaves
//   what is known of the old vault (lock, serverLeft) as it was.
// - Vault mode shows the vault as soon as the server answers; this device's list (leftovers, deviceAvailable) follows
//   when its storage does, so a slow IndexedDB open never holds the page up.
// A key that no longer fits the stored vault (reset or replaced from another tab) is dropped here, but only the key that
// was there when the reads went out: if the key changed meanwhile (a vault made, a lock taken) the reads may predate
// that, so they are made again (twice at most). The first time device mode is found ready for an account, the unlock
// listeners run too: passwords waiting in this browser can be stored now.
async function refresh(uid: string): Promise<"ok" | "unavailable" | "error"> {
  let vault: Awaited<ReturnType<typeof fetchVault>>;
  let listed: Awaited<ReturnType<typeof listSlots>>;
  let modeRead: PasswordMode | null;
  let before: Unlocked | null;
  const call = callFor(uid);
  const devRead = device().slots(uid); // never rejects
  for (let again = 0; ; again++) {
    const epoch = keyEpoch;
    before = unlocked;
    [vault, listed, modeRead] = await Promise.all([fetchVault(call), listSlots(call), readMode(uid)]);
    if (viewUser !== uid) return "error";
    if (epoch === keyEpoch || again >= 2) break;
  }
  if (modeRead) knownMode = { uid, mode: modeRead };
  const mode: PasswordMode = modeRead ?? (knownMode?.uid === uid ? knownMode.mode : "vault");
  const failure = (vault !== null && "error" in vault ? vault.error : null) ?? (Array.isArray(listed) ? null : listed.error);
  let lock: VaultLock | null = null; // null: the server couldn't say, keep what was shown
  if (!failure && Array.isArray(listed)) {
    const keyId = vault && !("error" in vault) ? vault.record.key_id : null;
    if (before && unlocked === before && before.userId === uid && before.keyId !== keyId) setKey(null);
    kinds = new Map(listed.map((s) => [s.slot, s.kind] as const));
    lock = keyId === null ? "none" : openKey() ? "unlocked" : "locked";
  }

  if (mode === "device") {
    const dev = await devRead;
    if (viewUser !== uid) return "error";
    takeDeviceList(dev);
    if (failure === "unavailable") kinds = new Map();
    const deviceAvailable = dev !== "unavailable";
    emit({ ...view, status: "ready", mode, deviceAvailable, deviceChecked: true, lock: lock ?? view.lock, ...lists(mode) });
    if (modeRead) tellMode(uid, modeRead);
    if (!deviceAvailable) deviceReadyFor = null;
    else if (deviceReadyFor !== uid) {
      deviceReadyFor = uid;
      following = following.then(() => tellUnlockListeners()).catch(() => {});
    }
    return "ok";
  }

  deviceReadyFor = null;
  if (failure === "unavailable") {
    markUnavailable();
    return "unavailable";
  }
  if (lock === null) {
    emit({ ...view, status: "error", mode });
    return "error";
  }
  emit({ ...view, status: "ready", mode, lock, ...lists(mode) });
  if (modeRead) tellMode(uid, modeRead);
  void devRead.then((dev) => {
    if (viewUser !== uid || view.mode !== "vault") return;
    takeDeviceList(dev);
    emit({ ...view, deviceAvailable: dev !== "unavailable", deviceChecked: true, ...lists(view.mode) });
  });
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
  setKey(null);
  emit({ ...view, lock: view.lock === "unlocked" ? "locked" : view.lock });
}

/**
 * Runs `cb` after every successful unlock (passphrase, recovery code or a new vault), once the list is fresh, and once
 * when device mode is first found ready for an account on this page (passwords can be stored then too). Returns the way to stop.
 */
export function onUnlock(cb: () => void): () => void {
  unlockListeners.add(cb);
  return () => {
    unlockListeners.delete(cb);
  };
}

// The key is in place: show the fresh list (what each stored value is depends on the vault), then tell the listeners.
// Nothing in here may throw: a listener's error never reaches the unlock.
async function afterUnlock(u: Unlocked) {
  try {
    if (viewUser === u.userId) await refresh(u.userId);
  } catch {
    // the list is read again at the next load
  }
  // Locked, signed out or unlocked again (that unlock has its own job) meanwhile: nobody is told about this key.
  if (openKey() !== u) return;
  tellUnlockListeners();
  // A move into the vault was waiting for this (a switch that needed a vault set up first, or "Move them into the
  // vault" that needed an unlock): it runs now, on its own, and its result shows as view.autoMoved.
  if (pendingMove === u.userId) {
    pendingMove = null;
    void finishPendingMove(u.userId);
  }
}

// The `onUnlock` listeners: passwords can be stored now (the vault opened, or device mode is ready). Never throws.
function tellUnlockListeners() {
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
  setKey(u);
  emit({ ...view, lock: "unlocked" });
  following = following.then(() => afterUnlock(u)).catch(() => {});
  return true;
}

// The stored vault is not the one this tab's key belongs to (reset or replaced elsewhere): lock, and look again.
function dropStaleKey(u: Unlocked, code: string) {
  if (unlocked !== u || (code !== "wrong_vault" && code !== "no_vault")) return;
  setKey(null);
  emit({ ...view, lock: "locked" });
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
 * this tab is unlocked ("ok"; the key stays inside this module, like unlock's). The list is read again in the background
 * and the `onUnlock` listeners run after that. A "failed" may hide a vault that was stored after all; the next list shows it.
 */
export async function commit(p: Prepared, typedGroup: string): Promise<"ok" | "group_mismatch" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await commitVault(callFor(uid), uid, p, typedGroup);
  if (r === "device_mode") void refresh(uid); // switched to this device elsewhere: show it
  if (typeof r === "string") return r;
  return opened(r) ? "ok" : "unauthorized";
}

/**
 * Opens the vault in this tab with the passphrase or the recovery code. With `newPassphrase` too (the "forgot it" path)
 * the vault is first re-wrapped under the new passphrase. "ok" = unlocked; the list is read again in the background and the
 * `onUnlock` listeners run after that. "wrong" = the secret doesn't match. The derivation is slow on purpose.
 */
export async function unlock(secret: Secret, newPassphrase?: string): Promise<"ok" | "wrong" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await unlockWith(callFor(uid), uid, secret, newPassphrase);
  // No vault, or the account keeps its passwords on this device now: this tab's view is stale (a reset, or a switch made
  // in another tab or on another device). Read the account again before the dialog speaks, so the page, the leftover
  // banner and the dialog all show the real state.
  if (r === "no_vault" || r === "device_mode") await refresh(uid);
  if (typeof r === "string") return r;
  return opened(r) ? "ok" : "unauthorized";
}

// The signed-in account while this page shows it in device mode; null otherwise (signed out, another account, vault mode).
async function deviceAccount(): Promise<string | null> {
  const uid = await account();
  return uid && viewUser === uid && view.mode === "device" ? uid : null;
}

const deviceSaveError = (e: "bad_input" | "unavailable" | "failed"): VaultError => (e === "unavailable" ? "unavailable" : "failed");

/**
 * One saved password, or why it can't be shown. "other_vault" = this vault can't open it (Clear is the way out). In
 * device mode it comes from this device ("other_vault" = the value saved here doesn't open; "unavailable" = this browser
 * can't keep passwords).
 */
export async function revealPassword(slot: string): Promise<{ password: string } | { error: VaultError }> {
  if (view.mode === "device") {
    const uid = await deviceAccount();
    if (!uid) return { error: "unauthorized" };
    const r = await device().reveal(uid, slot);
    if ("password" in r) return r;
    if (r.error === "not_found") markDevice(uid, [slot], false);
    if (r.error === "damaged") markDeviceOther(uid, slot);
    return { error: r.error === "damaged" ? "other_vault" : r.error === "bad_input" ? "failed" : r.error };
  }
  const u = openKey();
  if (!u) return { error: "locked" };
  const r = await revealOne(callFor(u.userId), u, slot);
  if ("error" in r) {
    if (r.error === "not_found") markSlot(u.userId, slot, false);
    else dropStaleKey(u, r.error);
  }
  return r;
}

/**
 * Saves (or replaces) one password; "" deletes it. Null when it worked. Needs the vault open ("locked" otherwise). In
 * device mode it is saved on this device only, and read back before null is returned.
 */
export async function savePassword(slot: string, password: string): Promise<VaultError | null> {
  if (password === "") return deletePassword(slot);
  if (view.mode === "device") {
    const uid = await deviceAccount();
    if (!uid) return "unauthorized";
    const err = await device().save(uid, slot, password);
    if (err) return deviceSaveError(err);
    markDevice(uid, [slot], true);
    return null;
  }
  const u = openKey();
  if (!u) return "locked";
  const err = await saveOne(callFor(u.userId), u, slot, password);
  if (err) {
    dropStaleKey(u, err);
    // The account keeps its passwords on its device now (switched in another tab or on another device): the server
    // refused the save; the page reads the mode again so the field moves to this device's store.
    if (err === "device_mode") void refresh(u.userId);
    return err;
  }
  markSlot(u.userId, slot, true);
  return null;
}

/** Deletes one saved password (the vault need not be open; in device mode, this device's copy). Null when it worked. */
export function deletePassword(slot: string): Promise<VaultError | null> {
  return view.mode === "device" ? deleteDeviceCopy(slot) : deleteServerCopy(slot);
}

async function deleteServerCopy(slot: string): Promise<VaultError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const r = await callFor(uid)({ action: "delete", slot });
  if (r.status !== 200 || r.data.ok !== true) return errorOf(r);
  markSlot(uid, slot, false);
  return null;
}

async function deleteDeviceCopy(slot: string): Promise<VaultError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  if (await device().remove(uid, slot)) return "unavailable";
  markDevice(uid, [slot], false);
  return null;
}

/**
 * For a removed login: deletes its password wherever this page can reach it (the server's copy and this device's, in
 * either mode), skipping a place this page already knows holds none. Errors are ignored.
 */
export function forgetPassword(slot: string | null) {
  if (!slot) return;
  const known = view.status === "ready";
  if (!known || kinds.has(slot)) void deleteServerCopy(slot);
  if (!known || devSlots.has(slot)) void deleteDeviceCopy(slot);
}

// Which of these entries the account already holds with the very same password: the import left such a slot alone, but
// nothing is lost by dropping the browser's copy. Only slots listed as sealed under the current vault are tried, with the
// open key; the account's value is only read, never replaced. A different password is a real conflict and stays.
async function sameAsStored(u: Unlocked, entries: readonly SlotPassword[]): Promise<Set<string>> {
  const same = new Set<string>();
  const call = callFor(u.userId);
  for (const e of entries) {
    if (openKey() !== u) break;
    if (kinds.get(e.slot) !== "e1") continue;
    const r = await revealOne(call, u, e.slot);
    if ("password" in r && r.password === e.password) same.add(e.slot);
  }
  return same;
}

/**
 * Moves passwords this browser saved before sign-in into the vault, sealed here. A slot the account already holds keeps
 * the account's value. Resolves to the entries that are NOT confirmed stored (the caller keeps those): every entry, with
 * nothing sent, while the vault is locked or doesn't exist yet; an entry whose slot already holds the same password
 * counts as stored, one that holds a different password does not.
 * In device mode they go into this device's store instead, insert-only by the same rules (nothing is sent): every entry
 * is kept while the page hasn't loaded the account or this browser can't keep passwords.
 */
export async function importPasswords(entries: readonly SlotPassword[]): Promise<SlotPassword[]> {
  if (view.mode === "device") return importIntoDevice(entries);
  const u = openKey();
  if (!u || entries.length === 0) return [...entries];
  const left = await importAll(callFor(u.userId), u, entries);
  const same = left.length ? await sameAsStored(u, left) : new Set<string>();
  const kept = left.filter((e) => !same.has(e.slot));
  const keptSlots = new Set(kept.map((e) => e.slot));
  markSlots(u.userId, entries.filter((e) => !keptSlots.has(e.slot)).map((e) => e.slot), true);
  return kept;
}

async function importIntoDevice(entries: readonly SlotPassword[]): Promise<SlotPassword[]> {
  const uid = entries.length ? await deviceAccount() : null;
  if (!uid || view.status !== "ready" || !view.deviceAvailable) return [...entries];
  const left = await importToDevice(device(), uid, entries);
  const leftSlots = new Set(left.map((e) => e.slot));
  markDevice(uid, entries.filter((e) => !leftSlots.has(e.slot)).map((e) => e.slot), true);
  return left;
}

// The vault calls a switch needs, for account `uid` with the vault key `u` (null: no vault, or not open in this tab).
const vaultSide = (call: Call, u: Unlocked | null): VaultSide => ({
  list: () => listSlots(call),
  reveal: (slot) => (u ? revealOne(call, u, slot) : Promise.resolve({ error: "locked" })),
  importAll: (entries) => (u ? importAll(call, u, entries) : Promise.resolve([...entries])),
  save: (slot, password, expected) => (u ? saveOne(call, u, slot, password, expected) : Promise.resolve<FlowError>("failed")),
  remove: async (slot) => {
    const r = await call({ action: "delete", slot });
    return r.status === 200 && r.data.ok === true ? null : errorOf(r);
  },
  reset: () => resetAll(call),
});

// What a locked step works with, for account `uid`: its requests, the vault side, this device's store and the mode
// write, all fenced by the step's hold (one-at-a-time.ts, password-mode.ts fenced*): once the step is given up after a
// time-out, nothing more is sent, written or deleted, and a request still out is cancelled.
type Sides = { call: Call; vault: (u: Unlocked | null) => VaultSide; device: DevicePasswords; writeMode: WriteMode };
function sidesFor(uid: string, hold: Hold): Sides {
  const call = callFor(uid, hold.signal);
  return {
    call,
    vault: (u) => fencedVault(vaultSide(call, u), hold),
    device: fencedDevice(device(), hold),
    writeMode: fencedWrite((m) => writeMode(uid, m), hold),
  };
}

/**
 * Runs a step that moves passwords or deletes the old vault for `uid`: one at a time across this browser's tabs, with
 * its calls fenced (sidesFor). `failed` makes the result for "no_locks" (this browser can't hold the lock: nothing ran)
 * and "timeout" (nothing the step did finished for LOCK_IDLE_MS: the lock is released, nothing more is deleted; trying
 * again is safe). Then the page reads everything again, outside the lock (reading changes nothing); after a time-out
 * without waiting for it, since the network that hung may hang again.
 */
async function locked<T>(uid: string, step: (s: Sides) => Promise<T>, failed: (e: LockError) => T): Promise<T> {
  let finished = false;
  const r = await oneAtATime(
    uid,
    async (hold) => {
      const v = await step(sidesFor(uid, hold));
      finished = true;
      return v;
    },
    { noLock: failed("no_locks"), timedOut: failed("timeout") },
  );
  if (viewUser === uid) {
    if (finished) await refresh(uid);
    else void refresh(uid);
  }
  return r;
}
const lockFailed = (error: LockError): { ok: false; error: LockError; slots: string[] } => ({ ok: false, error, slots: [] });

/**
 * Settings: "This device only" (password-mode.ts moveToDevice). A different password already on this device for any
 * login stops it before anything is written ("conflict": the logins land in view.conflicts, resolveConflict keeps one
 * copy). Otherwise every vault password is copied here and read back; then the account switches to device mode; then
 * the vault is listed again (the server takes no new vault values from then on) and what landed just before is copied
 * too; each copy is checked once more; only then the vault and its server copies are deleted. Needs the vault unlocked
 * when the account has one ("locked": offer Unlock). Errors before anything happened: "unauthorized",
 * "unavailable"/"failed" (couldn't load), "device_unavailable" (this browser can't keep passwords), "no_locks" (this
 * browser can't do it one tab at a time: update it), "timeout" (a request hung; nothing more was deleted). ok with
 * resetError: the old vault is still on the server (with "conflict" its logins are in view.conflicts) until
 * retryServerDelete() works. Already in device mode: ok, nothing done.
 */
export async function switchToDevice(): Promise<ToDeviceResult> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized", slots: [] };
  return locked(uid, (s) => switchToDeviceNow(uid, s), lockFailed);
}

// The account still signed in after waiting for the lock (another tab's step may have taken a while).
const stillSignedIn = async (uid: string) => (await account()) === uid;

async function switchToDeviceNow(uid: string, s: Sides): Promise<ToDeviceResult> {
  const fail = (error: ToDeviceError): ToDeviceResult => ({ ok: false, error, slots: [] });
  if (!(await stillSignedIn(uid))) return fail("unauthorized");
  const loaded = await refresh(uid);
  if (loaded !== "ok" || viewUser !== uid) return fail(loaded === "unavailable" ? "unavailable" : "failed");
  if (view.mode === "device") return { ok: true, serverLeft: view.serverLeft, resetError: null, slots: [] };
  const u = openKey();
  if (view.lock === "unknown") return fail("failed");
  if (view.lock !== "none" && !u) return fail("locked");
  const r = await moveToDevice({ userId: uid, hasVault: view.lock !== "none", vault: s.vault(u), device: s.device, writeMode: s.writeMode });
  if ((!r.ok && r.error === "conflict") || (r.ok && r.resetError === "conflict")) noteConflicts(uid, r.slots, true);
  return r;
}

/**
 * Settings: back to the locked vault (password-mode.ts moveToVault). This device's passwords are read first (a storage
 * failure changes nothing). The account then switches to vault mode first (the server takes vault values only then);
 * with no vault yet the result says `setupNeeded` and the passwords wait here (open the Setup dialog; the move then runs
 * by itself once the vault exists). With a vault it must be open ("locked": offer Unlock, nothing changed). The
 * passwords go into the vault insert-only, are read back from it, and only then leave this device; `kept` (a different
 * password in the vault) go to view.conflicts. If a fresh load finds the account in vault mode already (switched
 * elsewhere), it only moves what is left here, like moveIntoVault. "no_locks" / "timeout" as for switchToDevice.
 */
export async function switchToVault(): Promise<ToVaultResult> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized", slots: [] };
  return locked(uid, (s) => switchToVaultNow(uid, s), lockFailed);
}

async function switchToVaultNow(uid: string, s: Sides): Promise<ToVaultResult> {
  const fail = (error: ToVaultError): ToVaultResult => ({ ok: false, error, slots: [] });
  if (!(await stillSignedIn(uid))) return fail("unauthorized");
  const loaded = await refresh(uid);
  if (loaded !== "ok" || viewUser !== uid) return fail(loaded === "unavailable" ? "unavailable" : "failed");
  if (view.lock === "unknown") return fail("failed");
  if (view.mode !== "device") return moveLeftovers(uid, s);
  const u = openKey();
  if (view.lock !== "none" && !u) return fail("locked");
  const r = await moveToVault({ userId: uid, vault: u ? s.vault(u) : null, device: s.device, writeMode: s.writeMode });
  // No vault yet: once the student sets one up (the Setup dialog), the move runs by itself (afterUnlock).
  if (r.ok && r.setupNeeded) pendingMove = uid;
  if (r.ok) noteConflicts(uid, r.kept, true);
  return r;
}

/**
 * "Move them into the vault" (Settings, and the banner on Portals / My list) for passwords left on this device in vault
 * mode. With the vault open it moves them now and resolves to the result. Otherwise it opens the Setup or Unlock dialog
 * and resolves to "dialog": the move then runs by itself right after the vault opens, and its result appears as
 * view.autoMoved. Same rules as switchToVault (insert-only, read back, deleted here only once confirmed), but a move
 * never changes the account's mode: if the account keeps its passwords on this device now (switched in another tab or
 * on another device), nothing moves ("wrong_mode") and the page shows device mode. "no_locks": nothing is opened or
 * moved (update the browser).
 */
export async function moveIntoVault(): Promise<ToVaultResult | "dialog"> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized", slots: [] };
  if (!canLock()) return lockFailed("no_locks");
  if (view.mode === "vault" && view.status === "ready" && view.lock !== "unknown" && !openKey()) {
    pendingMove = uid;
    openVaultDialog(view.lock === "none" ? "setup" : "unlock");
    return "dialog";
  }
  dismissAutoMoved();
  return locked(uid, (s) => moveIntoVaultNow(uid, s), lockFailed);
}

async function moveIntoVaultNow(uid: string, s: Sides): Promise<ToVaultResult> {
  const fail = (error: ToVaultError): ToVaultResult => ({ ok: false, error, slots: [] });
  if (!(await stillSignedIn(uid))) return fail("unauthorized");
  const loaded = await refresh(uid);
  if (loaded !== "ok" || viewUser !== uid) return fail(loaded === "unavailable" ? "unavailable" : "failed");
  if (view.lock === "unknown") return fail("failed");
  return moveLeftovers(uid, s);
}

// After a fresh load: this device's passwords into the open vault, never writing the mode. The page's mode may be the
// last one known (a failed read falls back to it), so moveToVault reads the stored one again right before moving and
// right before deleting anything here (readMode).
async function moveLeftovers(uid: string, s: Sides): Promise<ToVaultResult> {
  const fail = (error: ToVaultError): ToVaultResult => ({ ok: false, error, slots: [] });
  if (view.mode === "device") return fail("wrong_mode");
  if (view.lock === "none") return fail("no_vault");
  const u = openKey();
  if (!u) return fail("locked");
  const r = await moveToVault({ userId: uid, vault: s.vault(u), device: s.device, writeMode: null, readMode: () => readMode(uid) });
  if (r.ok) noteConflicts(uid, r.kept, true);
  return r;
}

// A move the vault's opening was waiting for: run it (one at a time, like every switch) and show its result.
async function finishPendingMove(uid: string) {
  const r = await locked(uid, (s) => moveIntoVaultNow(uid, s), lockFailed);
  if (viewUser === uid) emit({ ...view, autoMoved: r });
}

/** Forgets the result of a move that ran by itself after Setup / Unlock (view.autoMoved), once it has been read. */
export function dismissAutoMoved() {
  if (view.autoMoved) emit({ ...view, autoMoved: null });
}

/**
 * Device mode, Settings: deletes the old vault and every password it still holds on the server (password-mode.ts
 * clearServerVault): each one is first copied to this device (or found here identically) and checked once more right
 * before the delete; a different password here stops it ("conflict", logins in view.conflicts). A vault holding
 * passwords must be unlocked ("locked": offer Unlock); an empty one goes without. Refused with "wrong_mode" unless the
 * account is in device mode as stored right now, so a stale tab can never delete a vault another device switched back
 * to. "unreadable": deleteUnreadableServerCopies is the way out. "no_locks" / "timeout" as for switchToDevice.
 */
export async function retryServerDelete(): Promise<ClearServerResult> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized", slots: [] };
  return locked(uid, (s) => retryServerDeleteNow(uid, s), lockFailed);
}

async function retryServerDeleteNow(uid: string, s: Sides): Promise<ClearServerResult> {
  if (!(await stillSignedIn(uid))) return { ok: false, error: "unauthorized", slots: [] };
  const mode = await readMode(uid);
  if (mode === null) return { ok: false, error: "failed", slots: [] };
  if (mode !== "device") return { ok: false, error: "wrong_mode", slots: [] };
  const u = openKey();
  const r = await clearServerVault({ userId: uid, open: !!u, vault: s.vault(u), device: s.device });
  if (!r.ok && r.error === "conflict") noteConflicts(uid, r.slots, true);
  if (r.ok && viewUser === uid) setKey(null);
  return r;
}

/**
 * Settings: one login holds different passwords on this device and in the vault; the student keeps one copy
 * (password-mode.ts resolveConflict; confirm first, the other copy is gone for good). Needs the vault unlocked
 * ("locked"). Vault mode: keep "vault" deletes this device's copy; keep "device" writes it into the vault
 * (compare-and-set, "changed" if the vault's moved on meanwhile) and then deletes it here. Device mode: keep "vault"
 * saves the vault's password on this device; keep "device" deletes the vault's copy on the server (both re-read just
 * before). Null when it worked; the login then leaves view.conflicts. "no_locks" / "timeout" as for switchToDevice.
 */
export async function resolveConflict(slot: string, keep: "vault" | "device"): Promise<ResolveError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return locked(
    uid,
    async (s): Promise<ResolveError | null> => {
      if (!(await stillSignedIn(uid))) return "unauthorized";
      const loaded = await refresh(uid); // the mode as stored now decides which side may be written
      if (loaded !== "ok" || viewUser !== uid) return loaded === "unavailable" ? "unavailable" : "failed";
      const u = openKey();
      if (!u) return "locked";
      const r = await resolveConflictFlow({ userId: uid, mode: view.mode, slot, keep, vault: s.vault(u), device: s.device });
      if (r === null) noteConflicts(uid, [slot], false);
      return r;
    },
    (e) => e,
  );
}

/**
 * Device mode, Settings, after "unreadable": the old vault's passwords nobody can open, as the server lists them right
 * now (for the confirm's count). Reading only; nothing changes.
 */
export async function unreadableServerCopies(): Promise<{ ok: true; slots: string[] } | { ok: false; error: FlowError }> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized" };
  const listed = await listSlots(callFor(uid));
  if (!Array.isArray(listed)) return { ok: false, error: listed.error };
  return { ok: true, slots: listed.filter((s) => s.kind !== "e1").map((s) => s.slot) };
}

/**
 * Device mode, Settings, after "unreadable" and a confirm naming how many: deletes from the server just those of
 * `slots` that still can't be opened (password-mode.ts dropUnreadable). The others stay for retryServerDelete, which
 * copies them here before the vault goes. "wrong_mode" unless the account is in device mode as stored right now;
 * "no_locks" / "timeout" as for switchToDevice.
 */
export async function deleteUnreadableServerCopies(slots: readonly string[]): Promise<{ ok: true; removed: string[] } | { ok: false; error: FlowError | LockError | "wrong_mode"; slots: string[] }> {
  const uid = await account();
  if (!uid) return { ok: false, error: "unauthorized", slots: [] };
  return locked(
    uid,
    async (s): Promise<{ ok: true; removed: string[] } | { ok: false; error: FlowError | LockError | "wrong_mode"; slots: string[] }> => {
      if (!(await stillSignedIn(uid))) return { ok: false, error: "unauthorized", slots: [] };
      const mode = await readMode(uid);
      if (mode !== "device") return { ok: false, error: mode === null ? "failed" : "wrong_mode", slots: [] };
      return dropUnreadable(s.vault(openKey()), slots);
    },
    lockFailed,
  );
}

/** Settings: "Delete passwords on this device" for the signed-in account (any mode; confirm first). Null when it worked. */
export async function deleteDevicePasswords(): Promise<"unauthorized" | "unavailable" | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return deleteAccountDevicePasswords(uid);
}

/**
 * Account deletion: deletes every password (and the key) this browser keeps for `userId`, without needing a session
 * (call it after the account is deleted, before signing out). Null when it worked.
 */
export async function deleteAccountDevicePasswords(userId: string): Promise<"unavailable" | null> {
  const err = await device().removeAll(userId);
  if (!err && viewUser === userId) {
    devSlots = new Set();
    devOther = new Set();
    conflictSlots = new Set();
    emit({ ...view, ...lists(view.mode) });
  }
  return err;
}

/**
 * The vault under a new passphrase, proved by the current passphrase or the recovery code; same key, same saved
 * passwords. Null when it worked. A "failed" can mean the write landed and only its reply was lost (and the read-back
 * failed too): do not reset anything on it, offer the same step again.
 */
export async function changePassphrase(secret: Secret, newPassphrase: string): Promise<null | "wrong" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return changePassphraseFlow(callFor(uid), uid, secret, newPassphrase);
}

/**
 * Step 1 of a new recovery code: made in memory from the passphrase (this tab need not be unlocked), not live yet; the
 * old code keeps working. "locked" is part of the type for callers that handle every vault error alike; it is not
 * returned today.
 */
export async function prepareRecovery(passphrase: string): Promise<PreparedRecovery | "wrong" | FlowError | "locked"> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return prepareRecoveryCode(callFor(uid), uid, passphrase);
}

/**
 * Step 2: the typed group must match the one asked for ("group_mismatch" sends nothing and the old code stays the only
 * one), then the new code goes live. "changed" = the vault moved on in between: prepare again. A "failed" can mean the
 * write landed and only its reply was lost (and the read-back failed too): keep the prepared code, do not clear or
 * reset anything, offer the same step again.
 */
export async function commitRecovery(p: PreparedRecovery, typedGroup: string): Promise<null | "group_mismatch" | FlowError> {
  const uid = await account();
  if (!uid) return "unauthorized";
  return commitRecoveryCode(callFor(uid), p, typedGroup);
}

/**
 * "Start over": the vault and every saved password are deleted on the server, and this tab forgets its key. Null when it
 * worked. Runs one at a time with the other password steps ("no_locks": this browser can't, nothing deleted; "timeout").
 */
export async function resetVault(): Promise<FlowError | LockError | null> {
  const uid = await account();
  if (!uid) return "unauthorized";
  const err = await locked(uid, async (s): Promise<FlowError | null> => ((await stillSignedIn(uid)) ? resetAll(s.call) : "unauthorized"), (e): FlowError | LockError => e);
  if (err) return err;
  if (viewUser === uid) {
    setKey(null);
    kinds = new Map();
    emit({ ...view, lock: "none", ...lists(view.mode) });
  }
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
