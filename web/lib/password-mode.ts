// Switching an account between the two places saved portal passwords can live (design:
// docs/superpowers/specs/2026-10-30-device-only-passwords-design.md): the locked vault (synced, server-stored, browser-
// sealed; vault-flows.ts) and "this device only" (device-passwords.ts). Pure flows: the vault side, the device store and
// the profile write come in as arguments, so the order of every step and every partial failure is tested in Node
// (password-mode.test.ts). portal-vault-client.ts wires them to the real requests.
// The rule both ways: nothing is deleted anywhere until every password is confirmed in its new place AND the account's
// mode is written. A failed mode write deletes nothing. Plaintext passwords only pass between the two stores in memory;
// nothing here sends or logs one.

import type { DevicePasswords } from "./device-passwords.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { PasswordStorage } from "./student-rows.ts";
import type { FlowError } from "./vault-flows.ts";

/** The vault operations a switch needs, bound to one account and (for reveal/importAll) its open vault key. */
export type VaultSide = {
  /** Every stored slot with its kind (vault-flows.ts listSlots). */
  list(): Promise<SlotState[] | { error: FlowError }>;
  /** One password opened with the vault key (vault-flows.ts revealOne); any error means "not shown". */
  reveal(slot: string): Promise<{ password: string } | { error: string }>;
  /** Insert-only import (vault-flows.ts importAll); resolves to the entries not confirmed stored. */
  importAll(entries: readonly SlotPassword[]): Promise<SlotPassword[]>;
  /** Deletes the vault and every password the server holds for the account (vault-flows.ts resetAll). */
  reset(): Promise<FlowError | null>;
};
/** Writes the account's mode (student_profiles.password_storage); true only when the new value is confirmed stored. */
export type WriteMode = (mode: PasswordStorage) => Promise<boolean>;

/**
 * Why a switch to this device didn't happen. Nothing on the server changed in any of these cases.
 * - locked / no_vault: the vault must be unlocked first (the client returns these before calling moveToDevice)
 * - device_unavailable: this browser can't keep passwords (no IndexedDB here, or it failed)
 * - unreadable: the server holds passwords this vault can't open (`slots`); clear them first
 * - copy_failed: a password couldn't be read from the vault, or copied here and read back (`slots`); copies made so
 *   far were taken off this device again
 * - changed: passwords kept changing in another tab while copying; try again
 * - mode_not_saved: every copy verified but the account's mode wasn't saved; the vault is untouched and this device
 *   keeps the copies (a failed profile write deletes nothing); trying again is safe
 * - FlowError codes: the vault's list couldn't be read
 */
export type ToDeviceError = FlowError | "locked" | "device_unavailable" | "unreadable" | "copy_failed" | "changed" | "mode_not_saved";
/**
 * ok: the account is in device mode with every password on this device. `serverLeft` > 0 = deleting the old vault's
 * server copies failed (`resetError` says why): they are still there until a retry works. `replaced` = slots where this
 * device held an older, different copy that the vault's value replaced.
 */
export type ToDeviceResult =
  | { ok: true; serverLeft: number; resetError: FlowError | null; replaced: string[] }
  | { ok: false; error: ToDeviceError; slots: string[] };

/**
 * Why a switch to the vault didn't happen. Nothing was deleted from this device in any of these cases.
 * - locked / no_vault: the vault must be unlocked (or set up) first (returned by the client)
 * - move_failed: some passwords couldn't be read here or confirmed in the vault (`slots`); the mode is unchanged
 * - mode_not_saved: everything is in the vault but the account's mode wasn't saved; trying again is safe
 * - FlowError codes: passed through from the client's own checks
 */
export type ToVaultError = FlowError | "locked" | "move_failed" | "mode_not_saved";
/**
 * ok: the account is in vault mode. `moved` = now in the vault and gone from this device. `kept` = the vault already held
 * a different password for these slots: the vault's stays, this device's copy stays too (listed so the student can
 * compare). `unreadable` = saved here but can't be opened here; left alone. `notDeleted` = in the vault, but the copy
 * here couldn't be deleted (or changed meanwhile) and is still here. `deviceUnavailable` = this browser couldn't be read,
 * so there was nothing to move.
 */
export type ToVaultResult =
  | { ok: true; moved: string[]; kept: string[]; unreadable: string[]; notDeleted: string[]; deviceUnavailable: boolean }
  | { ok: false; error: ToVaultError; slots: string[] };

// The injected calls are not expected to throw; if one does, it counts as that step failing.
async function settle<T>(f: () => Promise<T>, failed: T): Promise<T> {
  try {
    return await f();
  } catch {
    return failed;
  }
}

const MAX_PASSES = 3; // copy, then re-list until nothing changed in the vault meanwhile

/**
 * Vault -> this device, in this order: copy every vault password here and read each one back; re-list the vault and
 * copy whatever another tab changed meanwhile (until the list holds still); only when all of them verify, write the mode
 * "device"; only then delete the vault and its server copies. `hasVault` = the account has a vault row (with none and
 * nothing stored there is nothing to delete). Every password must open: a value the vault can't open stops the switch.
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

  // Every slot this flow wrote here: what the slot held before (put back if the switch doesn't happen; null = nothing,
  // or a value that couldn't be opened anyway), the vault row's updated_at it was copied from, and the copied password.
  const written = new Map<string, { prev: string | null; stamp: string; password: string }>();
  const putBack = async (slot: string) => {
    const w = written.get(slot);
    if (!w) return;
    if (w.prev === null) await device.remove(userId, slot);
    else await device.save(userId, slot, w.prev);
    written.delete(slot);
  };
  const abort = async (error: ToDeviceError, slots: string[] = []) => {
    for (const slot of [...written.keys()]) await putBack(slot);
    return fail(error, slots);
  };

  let listed: SlotState[] = [];
  for (let pass = 0; ; pass++) {
    const r = await settle(() => vault.list(), { error: "failed" as FlowError });
    if (!Array.isArray(r)) return abort(r.error);
    listed = r;
    const unreadable = listed.filter((s) => s.kind !== "e1").map((s) => s.slot);
    if (unreadable.length) return abort("unreadable", unreadable);
    // Cleared in the vault since an earlier pass: the copy made of it goes too.
    const now = new Set(listed.map((s) => s.slot));
    for (const slot of [...written.keys()]) if (!now.has(slot)) await putBack(slot);
    const todo = listed.filter((s) => written.get(s.slot)?.stamp !== s.updated_at);
    if (todo.length === 0) break;
    if (pass >= MAX_PASSES) return abort("changed", todo.map((s) => s.slot));
    for (const s of todo) {
      const got = await settle(() => vault.reveal(s.slot), { error: "failed" });
      if (!("password" in got)) return abort("copy_failed", [s.slot]);
      let prev = written.get(s.slot)?.prev;
      if (prev === undefined) {
        const had = await device.reveal(userId, s.slot);
        if ("password" in had) prev = had.password;
        else if (had.error === "not_found" || had.error === "damaged") prev = null;
        else return abort(had.error === "unavailable" ? "device_unavailable" : "copy_failed", [s.slot]);
      }
      written.set(s.slot, { prev, stamp: s.updated_at, password: got.password }); // before the save, so a half-done save is undone too
      if ((await device.save(userId, s.slot, got.password)) !== null) return abort("copy_failed", [s.slot]);
      const back = await device.reveal(userId, s.slot);
      if (!("password" in back) || back.password !== got.password) return abort("copy_failed", [s.slot]);
    }
  }

  const replaced = [...written].filter(([, w]) => w.prev !== null && w.prev !== w.password).map(([slot]) => slot);
  // Every copy is verified. A mode write that didn't land deletes nothing: the vault keeps everything, the copies stay.
  if (!(await settle(() => x.writeMode("device"), false))) return fail("mode_not_saved");
  if (!x.hasVault && listed.length === 0) return { ok: true, serverLeft: 0, resetError: null, replaced };
  const resetError = await settle(() => vault.reset(), "failed" as FlowError);
  return { ok: true, serverLeft: resetError ? listed.length : 0, resetError, replaced };
}

/**
 * This device -> vault, in this order: move this device's passwords into the vault insert-only; read every one back
 * from the vault; only when all are confirmed (or are conflicts) write the mode "vault"; only then delete the copies
 * here that the vault confirmed, each only if it is still the value that was moved. A slot the vault already holds with
 * a different password stays on this device and is listed in `kept`. Also works in vault mode, for passwords left on
 * this device (an earlier conflict, or a switch made on another device).
 */
export async function moveToVault(x: { userId: string; vault: VaultSide; device: DevicePasswords; writeMode: WriteMode }): Promise<ToVaultResult> {
  const { userId, vault, device } = x;
  const listed = await device.slots(userId);
  const deviceUnavailable = listed === "unavailable"; // nothing can be read here, so nothing is here to move
  const entries: SlotPassword[] = [];
  const unreadable: string[] = [];
  const failed: string[] = [];
  for (const slot of deviceUnavailable ? [] : listed) {
    const r = await device.reveal(userId, slot);
    if ("password" in r) entries.push({ slot, password: r.password });
    else if (r.error === "damaged") unreadable.push(slot);
    else if (r.error !== "not_found") failed.push(slot); // not_found: deleted meanwhile, nothing to move
  }
  if (failed.length) return { ok: false, error: "move_failed", slots: failed };

  if (entries.length) await settle(() => vault.importAll(entries), entries);
  // The vault's own copy decides, whatever the import replied: the same password = stored (just now, or already).
  const moved: SlotPassword[] = [];
  const kept: string[] = [];
  for (const e of entries) {
    const r = await settle(() => vault.reveal(e.slot), { error: "failed" });
    if ("password" in r) {
      if (r.password === e.password) moved.push(e);
      else kept.push(e.slot);
    } else if (r.error === "other_vault") kept.push(e.slot); // the slot holds a value this vault can't open: not ours to replace
    else failed.push(e.slot);
  }
  if (failed.length) return { ok: false, error: "move_failed", slots: failed };

  if (!(await settle(() => x.writeMode("vault"), false))) return { ok: false, error: "mode_not_saved", slots: [] };

  const notDeleted: string[] = [];
  for (const e of moved) {
    // Deleted only while it still holds the value that was moved (another tab may have saved a newer one meanwhile).
    const now = await device.reveal(userId, e.slot);
    if ("password" in now && now.password === e.password) {
      if ((await device.remove(userId, e.slot)) !== null) notDeleted.push(e.slot);
    } else if (!("error" in now && now.error === "not_found")) notDeleted.push(e.slot);
  }
  return { ok: true, moved: moved.map((e) => e.slot), kept, unreadable, notDeleted, deviceUnavailable };
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
