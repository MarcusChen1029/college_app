// Switching an account between the two places saved portal passwords can live (design:
// docs/superpowers/specs/2026-10-30-device-only-passwords-design.md): the locked vault (synced, server-stored, browser-
// sealed; vault-flows.ts) and "this device only" (device-passwords.ts). Pure flows: the vault side, the device store and
// the profile write come in as arguments, so the order of every step and every partial failure is tested in Node
// (password-mode.test.ts). portal-vault-client.ts wires them to the real requests.
// The rules: a password is deleted from one place only once the other place holds the same one (read back), and a
// password that differs between the two is never overwritten without the student choosing (resolveConflict). A failed
// mode write deletes nothing. While the account is in device mode the server takes no new vault values (409
// device_mode, portal-vault-handler.ts), so a list of the vault taken after the mode write is final. Plaintext passwords
// only pass between the two stores in memory; nothing here sends or logs one.

import type { DevicePasswords } from "./device-passwords.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { PasswordStorage } from "./student-rows.ts";
import type { FlowError } from "./vault-flows.ts";

/** The vault operations a switch needs, bound to one account and (for reveal/importAll/save) its open vault key. */
export type VaultSide = {
  /** Every stored slot with its kind (vault-flows.ts listSlots). */
  list(): Promise<SlotState[] | { error: FlowError }>;
  /** One password opened with the vault key (vault-flows.ts revealOne); "locked" when this tab has no open key. */
  reveal(slot: string): Promise<{ password: string } | { error: string }>;
  /** Insert-only import (vault-flows.ts importAll); resolves to the entries not confirmed stored. */
  importAll(entries: readonly SlotPassword[]): Promise<SlotPassword[]>;
  /** Seals and stores one password (vault-flows.ts saveOne); with `expected`, only over the row with that updated_at ("changed"). */
  save(slot: string, password: string, expected?: string): Promise<FlowError | null>;
  /** Deletes the server's copy of one slot. */
  remove(slot: string): Promise<FlowError | null>;
  /** Deletes the vault and every password the server holds for the account (vault-flows.ts resetAll). */
  reset(): Promise<FlowError | null>;
};
/** Writes the account's mode (student_profiles.password_storage); true only when the new value is confirmed stored. */
export type WriteMode = (mode: PasswordStorage) => Promise<boolean>;

/**
 * Why a switch to this device didn't happen. Nothing on the server changed in any of these cases, and nothing this
 * device held before was lost.
 * - locked / no_vault: the vault must be unlocked first (the client returns these before calling moveToDevice)
 * - device_unavailable: this browser can't keep passwords (no IndexedDB here, or it failed)
 * - unreadable: the server holds passwords this vault can't open (`slots`); clear them first
 * - conflict: this device already holds a different password for these logins (`slots`); nothing was written; keep
 *   one copy (resolveConflict), then try again
 * - copy_failed: a password couldn't be read from the vault, or copied here and read back (`slots`); copies made so
 *   far were taken off this device again where the vault still holds them (and they are still exactly the copies)
 * - changed: passwords kept changing in another tab while copying; try again
 * - mode_not_saved: every copy verified but the account's mode wasn't saved; the vault is untouched and this device
 *   keeps the copies (each one equal to the vault's); trying again is safe
 * - FlowError codes: the vault's list couldn't be read
 */
export type ToDeviceError = FlowError | "locked" | "device_unavailable" | "unreadable" | "conflict" | "copy_failed" | "changed" | "mode_not_saved";
/** Why the old vault was kept on the server after a switch (or by clearServerVault): `slots` names the logins involved. */
export type HoldReason = FlowError | "locked" | "device_unavailable" | "unreadable" | "conflict" | "copy_failed";
/**
 * ok: the account is in device mode with every vault password on this device. `serverLeft` > 0 = the old vault is still
 * on the server (`resetError` says why: the delete failed, or a password saved just before the switch differs from
 * this device's (`slots`) or couldn't be copied); retryServerDelete finishes it.
 */
export type ToDeviceResult =
  | { ok: true; serverLeft: number; resetError: HoldReason | null; slots: string[] }
  | { ok: false; error: ToDeviceError; slots: string[] };

/**
 * Why a switch to the vault (or moving leftovers into it) didn't happen. Nothing changed in any of these cases.
 * - locked / no_vault: vault mode only: unlock (or set up) the vault first (returned by the client)
 * - device_unavailable: this browser's passwords couldn't be read just now (its storage failed); try again
 * - mode_not_saved: the account's new mode couldn't be saved
 * - FlowError codes: passed through from the client's own checks
 */
export type ToVaultError = FlowError | "locked" | "device_unavailable" | "mode_not_saved";
/**
 * ok: the account is in vault mode. `moved` = now in the vault and gone from this device. `kept` = the vault already held
 * a different password for these slots: both stay (resolveConflict). `unreadable` = saved here but can't be opened
 * here; left alone. `notDeleted` = in the vault, but the copy here couldn't be deleted (or changed meanwhile) and is still
 * here. `notMoved` = couldn't be stored in the vault this time; still here (moving leftovers tries again).
 * `deviceUnavailable` = this browser has no storage at all, so there was nothing to move. `setupNeeded` = the account
 * has no vault yet: set one up, then this device's passwords can be moved into it (they stay here until then).
 */
export type ToVaultResult =
  | { ok: true; moved: string[]; kept: string[]; unreadable: string[]; notDeleted: string[]; notMoved: string[]; deviceUnavailable: boolean; setupNeeded: boolean }
  | { ok: false; error: ToVaultError; slots: string[] };

/** clearServerVault's result: ok = the old vault and every server copy are deleted. */
export type ClearResult = { ok: true } | { ok: false; error: HoldReason; slots: string[] };

/** resolveConflict's result: null = one copy is kept and the other is gone; "changed" = look again (something moved). */
export type ResolveError = FlowError | "locked" | "device_unavailable" | "changed" | "failed";

// The injected calls are not expected to throw; if one does, it counts as that step failing.
async function settle<T>(f: () => Promise<T>, failed: T): Promise<T> {
  try {
    return await f();
  } catch {
    return failed;
  }
}

const MAX_PASSES = 3; // copy, then re-list until nothing changed in the vault meanwhile
const unreadableOf = (listed: readonly SlotState[]) => listed.filter((s) => s.kind !== "e1").map((s) => s.slot);

// A slot this device holds a copy of, as far as one flow knows: the vault row's updated_at it matches, what the slot held
// here before the flow (null: nothing, or a value that couldn't be opened), whether the flow wrote it, and the password
// the slot holds as far as the flow knows (the one it wrote, or the equal one it found).
type Copied = { stamp: string; prev: string | null; wrote: boolean; password: string };
type Sync = { ok: true } | { ok: false; error: "conflict" | "copy_failed" | "device_unavailable"; slots: string[] };

/**
 * Brings this device up to the vault for every listed slot not yet copied at its current updated_at. It looks at all of
 * them first and writes only then, so when it finds a conflict nothing of this round was written. A slot the flow
 * hasn't touched yet is compared with what this device already holds: the same password counts as copied; a different
 * one that opens here is a conflict and is never overwritten; none, or one that can't be opened, gets the vault's.
 * A slot the flow copied earlier (its own copy) follows the vault's newer value. Every write is a compare-and-save
 * (a value another tab saved here meanwhile is never replaced: that is a conflict too) and is read back.
 */
async function syncFromVault(userId: string, vault: VaultSide, device: DevicePasswords, listed: readonly SlotState[], copied: Map<string, Copied>): Promise<Sync> {
  const todo = listed.filter((s) => copied.get(s.slot)?.stamp !== s.updated_at);
  const writes: { s: SlotState; password: string; prev: string | null; current: string | null }[] = [];
  const conflicts: string[] = [];
  for (const s of todo) {
    const got = await settle(() => vault.reveal(s.slot), { error: "failed" });
    if (!("password" in got)) return { ok: false, error: "copy_failed", slots: [s.slot] };
    const known = copied.get(s.slot);
    if (known) {
      writes.push({ s, password: got.password, prev: known.prev, current: known.password });
      continue;
    }
    const had = await device.reveal(userId, s.slot);
    if ("password" in had) {
      if (had.password === got.password) copied.set(s.slot, { stamp: s.updated_at, prev: had.password, wrote: false, password: had.password });
      else conflicts.push(s.slot);
      continue;
    }
    if (had.error === "unavailable") return { ok: false, error: "device_unavailable", slots: [s.slot] };
    if (had.error === "bad_input") return { ok: false, error: "copy_failed", slots: [s.slot] };
    writes.push({ s, password: got.password, prev: null, current: null }); // nothing here, or nothing that opens
  }
  if (conflicts.length) return { ok: false, error: "conflict", slots: conflicts };
  for (const w of writes) {
    const before = copied.get(w.s.slot);
    // Recorded before the save, so a save that landed but failed its read-back is taken back too (takeBack only removes
    // or replaces a value that is still exactly this one).
    copied.set(w.s.slot, { stamp: w.s.updated_at, prev: w.prev, wrote: true, password: w.password });
    const err = await device.saveIfSame(userId, w.s.slot, w.current, w.password);
    if (err === "changed") {
      if (before) copied.set(w.s.slot, before);
      else copied.delete(w.s.slot);
      return { ok: false, error: "conflict", slots: [w.s.slot] };
    }
    if (err) return { ok: false, error: "copy_failed", slots: [w.s.slot] };
  }
  return { ok: true };
}

// Takes back what a flow wrote to one slot (the earlier value where there was one, nothing where there wasn't), but only
// while the slot still holds exactly what the flow wrote: a value another tab or flow saved meanwhile stays.
async function takeBack(userId: string, device: DevicePasswords, slot: string, c: Copied) {
  if (!c.wrote) return;
  if (c.prev === null) await device.removeIfSame(userId, slot, c.password);
  else await device.saveIfSame(userId, slot, c.password, c.prev);
}

/**
 * Vault -> this device, in this order: look at every vault password next to this device's (a different password here
 * is a conflict: stop, nothing written); copy the rest here and read each one back; re-list the vault and copy whatever
 * another tab changed meanwhile, until the list holds still; write the mode "device" (the server takes no new vault
 * values from then on); list the vault once more and copy what landed just before the switch; only then delete the
 * vault and its server copies. `hasVault` = the account has a vault row (with none and nothing stored there is nothing
 * to delete). Every password must open: a value the vault can't open stops the switch.
 */
export async function moveToDevice(x: {
  userId: string;
  hasVault: boolean;
  vault: VaultSide;
  device: DevicePasswords;
  writeMode: WriteMode;
}): Promise<ToDeviceResult> {
  const { userId, vault, device } = x;
  const fail = (error: ToDeviceError, slots: string[] = []): ToDeviceResult => ({ ok: false, error, slots });
  if ((await device.slots(userId)) === "unavailable") return fail("device_unavailable");

  const copied = new Map<string, Copied>();
  // Stopping: copies are taken back only where a fresh list shows the vault still holds that login (so the password is
  // not lost) and only while the slot still holds exactly what this flow wrote. Another tab may have finished a switch
  // and deleted the vault meanwhile: then these copies are the passwords, and they stay. No list = every copy stays.
  const abort = async (error: ToDeviceError, slots: string[] = []) => {
    const now = await settle(() => vault.list(), { error: "failed" as FlowError });
    if (Array.isArray(now)) {
      const inVault = new Set(now.filter((s) => s.kind === "e1").map((s) => s.slot));
      for (const [slot, c] of copied) if (inVault.has(slot)) await takeBack(userId, device, slot, c);
    }
    copied.clear();
    return fail(error, slots);
  };

  let listed: SlotState[] = [];
  for (let pass = 0; ; pass++) {
    const r = await settle(() => vault.list(), { error: "failed" as FlowError });
    if (!Array.isArray(r)) return abort(r.error);
    listed = r;
    const unreadable = unreadableOf(listed);
    if (unreadable.length) return abort("unreadable", unreadable);
    // Gone from the vault since an earlier pass (cleared in another tab, or the whole vault deleted by another tab's
    // switch): the copy here is kept, since it may now be the only one; this flow just stops tracking it.
    const now = new Set(listed.map((s) => s.slot));
    for (const slot of [...copied.keys()]) if (!now.has(slot)) copied.delete(slot);
    const todo = listed.filter((s) => copied.get(s.slot)?.stamp !== s.updated_at);
    if (todo.length === 0) break;
    if (pass >= MAX_PASSES) return abort("changed", todo.map((s) => s.slot));
    const synced = await syncFromVault(userId, vault, device, listed, copied);
    if (!synced.ok) return abort(synced.error, synced.slots);
  }

  // Every copy is verified. A mode write that didn't land deletes nothing: the vault keeps everything, the copies stay.
  if (!(await settle(() => x.writeMode("device"), false))) return fail("mode_not_saved");

  // The switch is made. A save that reached the server before it took effect is in this list; nothing can join it now.
  const held = (resetError: HoldReason, slots: string[], serverLeft: number): ToDeviceResult => ({ ok: true, serverLeft, resetError, slots });
  const last = await settle(() => vault.list(), { error: "failed" as FlowError });
  if (!Array.isArray(last)) return held(last.error, [], listed.length);
  const unreadable = unreadableOf(last);
  if (unreadable.length) return held("unreadable", unreadable, last.length);
  const synced = await syncFromVault(userId, vault, device, last, copied);
  if (!synced.ok) return held(synced.error, synced.slots, last.length);
  if (!x.hasVault && last.length === 0) return { ok: true, serverLeft: 0, resetError: null, slots: [] };
  const resetError = await settle(() => vault.reset(), "failed" as FlowError);
  return resetError ? held(resetError, [], last.length) : { ok: true, serverLeft: 0, resetError: null, slots: [] };
}

/**
 * Device mode: deletes the old vault and every password it still holds on the server, but only once each of them is on
 * this device: one the device lacks is copied here and read back first; the same password here is fine; a different one
 * stops it ("conflict", nothing written). A vault holding passwords needs to be open (`open`), since a sealed value can't
 * be compared without the key; an empty one is deleted without. The server takes no new vault values in device mode, so
 * the list taken here is what the reset deletes.
 */
export async function clearServerVault(x: { userId: string; open: boolean; vault: VaultSide; device: DevicePasswords }): Promise<ClearResult> {
  const fail = (error: HoldReason, slots: string[] = []): ClearResult => ({ ok: false, error, slots });
  const listed = await settle(() => x.vault.list(), { error: "failed" as FlowError });
  if (!Array.isArray(listed)) return fail(listed.error);
  if (listed.length) {
    const unreadable = unreadableOf(listed);
    if (unreadable.length) return fail("unreadable", unreadable);
    if (!x.open) return fail("locked");
    if ((await x.device.slots(x.userId)) === "unavailable") return fail("device_unavailable");
    const synced = await syncFromVault(x.userId, x.vault, x.device, listed, new Map());
    if (!synced.ok) return fail(synced.error, synced.slots);
  }
  const err = await settle(() => x.vault.reset(), "failed" as FlowError);
  return err ? fail(err) : { ok: true };
}

/**
 * Device mode, the way out of "unreadable": deletes from the server only the stored passwords nobody can open (sealed by
 * a vault that no longer exists, or damaged), as listed now; openable ones are left for clearServerVault, which copies
 * them here before the old vault goes. The server takes no new vault values in device mode, so nothing else can be
 * caught by it. `removed` = the slots deleted.
 */
export async function dropUnreadable(vault: VaultSide): Promise<{ ok: true; removed: string[] } | { ok: false; error: FlowError; slots: string[] }> {
  const listed = await settle(() => vault.list(), { error: "failed" as FlowError });
  if (!Array.isArray(listed)) return { ok: false, error: listed.error, slots: [] };
  const removed: string[] = [];
  for (const slot of unreadableOf(listed)) {
    const err = await settle(() => vault.remove(slot), "failed" as FlowError);
    if (err) return { ok: false, error: err, slots: [slot] };
    removed.push(slot);
  }
  return { ok: true, removed };
}

/**
 * This device -> vault, in this order: read every password saved here (a storage failure stops it: nothing changed);
 * write the mode "vault" (needed first: in device mode the server takes no vault values; a failed write changes
 * nothing); with no vault yet, stop there (`setupNeeded`: everything stays here until a vault is set up). Otherwise move
 * them into the vault insert-only and read every one back from the vault; delete the copies here that the vault holds
 * identically, each only if it still holds the value that was moved (compared and deleted in one storage step). A slot
 * the vault holds with a different password stays on this device (`kept`). `writeMode` null = the account is already in
 * vault mode (moving passwords left on this device); `vault` null = the account has no vault yet.
 */
export async function moveToVault(x: { userId: string; vault: VaultSide | null; device: DevicePasswords; writeMode: WriteMode | null }): Promise<ToVaultResult> {
  const { userId, vault, device } = x;
  const fail = (error: ToVaultError, slots: string[] = []): ToVaultResult => ({ ok: false, error, slots });
  const listed = await device.slots(userId);
  // No storage at all = nothing can be saved here. Storage that failed just now may hold passwords: change nothing.
  if (listed === "unavailable" && device.present) return fail("device_unavailable");
  const deviceUnavailable = listed === "unavailable";
  const entries: SlotPassword[] = [];
  const unreadable: string[] = [];
  for (const slot of deviceUnavailable ? [] : listed) {
    const r = await device.reveal(userId, slot);
    if ("password" in r) entries.push({ slot, password: r.password });
    else if (r.error === "damaged") unreadable.push(slot);
    else if (r.error !== "not_found") return fail("device_unavailable", [slot]); // not_found: deleted meanwhile
  }

  const write = x.writeMode;
  if (write && !(await settle(() => write("vault"), false))) return fail("mode_not_saved");
  const result = { moved: [] as string[], kept: [] as string[], unreadable, notDeleted: [] as string[], notMoved: [] as string[], deviceUnavailable };
  if (!vault) return { ok: true, ...result, setupNeeded: true };

  if (entries.length) await settle(() => vault.importAll(entries), entries);
  // The vault's own copy decides, whatever the import replied: the same password = stored (just now, or already).
  const moved: SlotPassword[] = [];
  for (const e of entries) {
    const r = await settle(() => vault.reveal(e.slot), { error: "failed" });
    if ("password" in r) {
      if (r.password === e.password) moved.push(e);
      else result.kept.push(e.slot);
    } else if (r.error === "other_vault") result.kept.push(e.slot); // the slot holds a value this vault can't open: not ours to replace
    else result.notMoved.push(e.slot);
  }
  for (const e of moved) {
    // Deleted only while it still holds the value that was moved (another tab may have saved a newer one meanwhile).
    if ((await device.removeIfSame(userId, e.slot, e.password)) !== null) result.notDeleted.push(e.slot);
    else result.moved.push(e.slot);
  }
  return { ok: true, ...result, setupNeeded: false };
}

/**
 * One login whose password differs between this device and the vault: the student keeps one copy, the other goes.
 * Needs the vault open (both values are compared first; the same password on both sides needs no choice).
 * - Vault mode, keep "vault": this device's copy is deleted (only while it is still the one compared).
 *   Keep "device": this device's password is written into the vault over exactly the row that was compared
 *   (compare-and-set: "changed" if it moved on), read back, then deleted here.
 * - Device mode, keep "vault": the vault's password is saved on this device and read back.
 *   Keep "device": the vault's copy of that login is deleted on the server (the server takes no vault writes in device
 *   mode); this device's stays.
 * "changed" also when the side to keep has nothing that opens (keeping it would lose the other).
 */
export async function resolveConflict(x: {
  userId: string;
  mode: PasswordStorage;
  slot: string;
  keep: "vault" | "device";
  vault: VaultSide;
  device: DevicePasswords;
}): Promise<ResolveError | null> {
  const { userId, slot, vault, device } = x;
  const deviceError = (e: "changed" | "unavailable" | null): ResolveError | null => (e === "unavailable" ? "device_unavailable" : e);

  const here = await device.reveal(userId, slot);
  if ("error" in here && here.error === "unavailable") return "device_unavailable";
  if ("error" in here && here.error === "bad_input") return "failed";
  const mine = "password" in here ? here.password : null; // null: nothing here, or a value that doesn't open here

  const listed = await settle(() => vault.list(), { error: "failed" as FlowError });
  if (!Array.isArray(listed)) return listed.error;
  const row = listed.find((s) => s.slot === slot) ?? null;
  const got = row ? await settle(() => vault.reveal(slot), { error: "failed" }) : null;
  if (got && "error" in got && got.error !== "other_vault") return got.error === "locked" ? "locked" : "failed";
  const theirs = got && "password" in got ? got.password : null; // null: no vault copy, or one this vault can't open

  if (mine !== null && mine === theirs) return x.mode === "vault" ? deviceError(await device.removeIfSame(userId, slot, mine)) : null;

  if (x.keep === "vault") {
    if (theirs === null) return "changed";
    if (x.mode === "device") {
      // Only over the value compared above: one saved here by another tab since then is never replaced ("changed").
      const err = await device.saveIfSame(userId, slot, mine, theirs);
      return err === null || err === "changed" ? err : err === "unavailable" ? "device_unavailable" : "failed";
    }
    if (mine === null) return "error" in here && here.error === "not_found" ? null : deviceError(await device.remove(userId, slot));
    return deviceError(await device.removeIfSame(userId, slot, mine));
  }

  if (mine === null) return "changed";
  if (x.mode === "device") return row ? settle(() => vault.remove(slot), "failed" as FlowError) : null;
  let err: FlowError | null;
  if (row) err = await settle(() => vault.save(slot, mine, row.updated_at), "failed" as FlowError);
  else {
    // No vault row to compare with (cleared meanwhile): insert-only, so a value saved elsewhere since is never replaced.
    const left = await settle(() => vault.importAll([{ slot, password: mine }]), [{ slot, password: mine }]);
    err = left.length ? "changed" : null;
  }
  if (err) return err;
  const back = await settle(() => vault.reveal(slot), { error: "failed" });
  if (!("password" in back) || back.password !== mine) return "failed";
  return deviceError(await device.removeIfSame(userId, slot, mine));
}

/**
 * Device mode's import of passwords an older build saved in this browser (the sign-in merge's "Add to this account"):
 * insert-only into the device store, one entry per slot (the first wins). Resolves to the entries NOT confirmed stored,
 * which the caller keeps where they are: a slot that already holds a different password, an invalid entry, or a
 * failed write. A slot that already holds the very same password counts as stored.
 */
export async function importToDevice(device: DevicePasswords, userId: string, entries: readonly SlotPassword[]): Promise<SlotPassword[]> {
  const seen = new Set<string>();
  const unique = entries.filter((e) => !seen.has(e.slot) && seen.add(e.slot));
  const left: SlotPassword[] = [];
  for (const e of unique) if ((await device.add(userId, e.slot, e.password)) !== null) left.push(e);
  return left;
}
