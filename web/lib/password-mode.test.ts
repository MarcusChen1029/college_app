import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePasswords } from "./device-passwords.ts";
import { MemoryDeviceStorage } from "./fixtures/memory-device-storage.ts";
import { clearServerVault, importToDevice, moveToDevice, moveToVault, resolveConflict, type VaultSide, type WriteMode } from "./password-mode.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { FlowError } from "./vault-flows.ts";

// The switching flows with the real device store (real WebCrypto over memory storage) and a fake vault side that keeps
// a log and, like the server (portal-vault-handler.ts), takes no new values while the account is in device mode.

const U = "11111111-1111-4111-8111-111111111111";
const S1 = "system:commonapp";
const S2 = "system:uc";
const S3 = "custom:fafsa-login";
const S4 = "campus:uc:UC Berkeley";

/** The account's vault as the server would hold it: password null = a value this vault can't open (kind "other"). */
class FakeVault implements VaultSide {
  rows = new Map<string, { password: string | null; updated_at: string }>();
  /** student_profiles.password_storage as the server reads it. */
  serverMode: "vault" | "device" = "vault";
  locked = false;
  failList = false;
  failReset = false;
  failReveal = new Set<string>();
  importRefuses = new Set<string>(); // slots the import silently doesn't store
  lists = 0;
  /** Runs at every list, before it answers (another tab at work). */
  onList: ((n: number) => void) | null = null;
  private tick = 0;
  private log: string[];
  constructor(log: string[]) {
    this.log = log;
  }

  set(slot: string, password: string | null) {
    this.rows.set(slot, { password, updated_at: `2026-10-30T08:00:00.${String(++this.tick).padStart(6, "0")}+00:00` });
  }
  async list(): Promise<SlotState[] | { error: FlowError }> {
    this.log.push("vault:list");
    this.onList?.(++this.lists);
    if (this.failList) return { error: "failed" };
    return [...this.rows].map(([slot, r]) => ({ slot, kind: r.password === null ? "other" : "e1", updated_at: r.updated_at }));
  }
  async reveal(slot: string) {
    if (this.locked) return { error: "locked" };
    if (this.failReveal.has(slot)) return { error: "failed" };
    const r = this.rows.get(slot);
    if (!r) return { error: "not_found" };
    return r.password === null ? { error: "other_vault" } : { password: r.password };
  }
  async importAll(entries: readonly SlotPassword[]) {
    this.log.push("vault:import");
    if (this.serverMode === "device") return [...entries];
    const left: SlotPassword[] = [];
    for (const e of entries) {
      if (this.importRefuses.has(e.slot) || this.rows.has(e.slot)) left.push(e);
      else this.set(e.slot, e.password);
    }
    return left;
  }
  async save(slot: string, password: string, expected?: string): Promise<FlowError | null> {
    this.log.push("vault:save");
    if (this.serverMode === "device") return "device_mode";
    if (expected !== undefined && this.rows.get(slot)?.updated_at !== expected) return "changed";
    this.set(slot, password);
    return null;
  }
  async remove(slot: string): Promise<FlowError | null> {
    this.log.push("vault:remove");
    this.rows.delete(slot);
    return null;
  }
  async reset() {
    this.log.push("vault:reset");
    if (this.failReset) return "failed" as const;
    this.rows.clear();
    return null;
  }
}

function setup() {
  const log: string[] = [];
  const storage = new MemoryDeviceStorage();
  const device = devicePasswords(storage);
  const vault = new FakeVault(log);
  let writeOk = true;
  const writes: string[] = [];
  const writeMode: WriteMode = async (mode) => {
    log.push(`mode:${mode}`);
    writes.push(mode);
    if (writeOk) vault.serverMode = mode;
    return writeOk;
  };
  return { log, storage, device, vault, writeMode, writes, failWrites: () => (writeOk = false) };
}

const shown = async (device: ReturnType<typeof devicePasswords>, slot: string) => {
  const r = await device.reveal(U, slot);
  return "password" in r ? r.password : r.error;
};
const OK_SWITCH = { ok: true, serverLeft: 0, resetError: null, slots: [] };

// ── vault -> this device ──

test("to device: copied and read back, mode written, vault listed again, then deleted", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.set(S3, "fafsa pw 7890");
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, OK_SWITCH);
  assert.equal(await shown(t.device, S1), "common app pw");
  assert.equal(await shown(t.device, S2), "uc pw 123456");
  assert.equal(await shown(t.device, S3), "fafsa pw 7890");
  assert.deepEqual(t.writes, ["device"]);
  const mode = t.log.indexOf("mode:device");
  assert.ok(t.log.indexOf("vault:list", mode) > mode && t.log.indexOf("vault:list", mode) < t.log.indexOf("vault:reset"), t.log.join(" "));
  assert.equal(t.vault.rows.size, 0);
});

test("to device: a different password already on this device is a conflict: nothing written, nothing lost", async () => {
  for (const failWrite of [false, true]) {
    const t = setup();
    await t.device.save(U, S1, "device-only A");
    t.vault.set(S1, "the vault's B");
    t.vault.set(S2, "uc pw 123456");
    if (failWrite) t.failWrites(); // the reported case: a failed mode write afterwards must not have cost "A" either
    const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: false, error: "conflict", slots: [S1] });
    assert.equal(await shown(t.device, S1), "device-only A");
    assert.equal(await shown(t.device, S2), "not_found", "nothing was written");
    assert.deepEqual(t.writes, []);
    assert.equal(t.vault.rows.size, 2);
  }
});

test("to device: the same password already here is fine and stays if the switch stops", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  await t.device.save(U, S3, "unrelated, kept");
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.storage.failing = [{ op: "putValue", slot: S2 }];
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "copy_failed", slots: [S2] });
  t.storage.failing = [];
  assert.equal(await shown(t.device, S1), "common app pw", "an equal copy that was here before stays");
  assert.equal(await shown(t.device, S2), "not_found");
  assert.equal(await shown(t.device, S3), "unrelated, kept");
  assert.deepEqual(t.writes, []);
  assert.equal(t.vault.rows.size, 2);
});

test("to device: a copy that fails (vault read or read-back) changes nothing on the server and takes back the copies", async () => {
  for (const how of ["vault read", "read-back"] as const) {
    const t = setup();
    t.vault.set(S1, "common app pw");
    t.vault.set(S2, "uc pw 123456");
    if (how === "vault read") t.vault.failReveal.add(S2);
    else {
      const put = t.storage.putValue.bind(t.storage);
      t.storage.putValue = (userId, slot, value) => put(userId, slot, slot === S2 ? value.slice(0, -3) + "AAA" : value);
    }
    const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: false, error: "copy_failed", slots: [S2] }, how);
    assert.deepEqual(t.writes, [], "mode never written");
    assert.ok(!t.log.includes("vault:reset"), "server untouched");
    assert.equal(t.vault.rows.size, 2);
    assert.deepEqual(await t.device.slots(U), [], "the copies made were taken back");
  }
});

test("to device: a failed reset leaves the account in device mode and reports what the server still holds", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.failReset = true;
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, serverLeft: 2, resetError: "failed", slots: [] });
  assert.deepEqual(t.writes, ["device"]);
  assert.equal(t.vault.rows.size, 2);
  assert.equal(await shown(t.device, S1), "common app pw");
});

test("to device: a failed profile write deletes nothing (vault untouched, copies kept)", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.failWrites();
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "mode_not_saved", slots: [] });
  assert.ok(!t.log.includes("vault:reset"));
  assert.equal(t.vault.rows.size, 2);
  assert.equal(await shown(t.device, S1), "common app pw");
  assert.equal(await shown(t.device, S2), "uc pw 123456");
});

test("to device: a save that landed just before the switch took effect is copied before the vault is deleted", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.onList = () => {
    // The first list after the mode write sees what another tab saved a moment before it.
    if (t.vault.serverMode === "device" && !t.vault.rows.has(S4)) {
      t.vault.set(S4, "saved in another tab");
      t.vault.set(S2, "uc pw changed elsewhere");
    }
  };
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, OK_SWITCH);
  assert.equal(await shown(t.device, S4), "saved in another tab");
  assert.equal(await shown(t.device, S2), "uc pw changed elsewhere");
  assert.equal(t.vault.rows.size, 0);
});

test("to device: after the switch, a password that differs from this device's (or can't be copied) holds the vault on the server", async () => {
  for (const how of ["conflict", "copy_failed"] as const) {
    const t = setup();
    t.vault.set(S1, "common app pw");
    await t.device.save(U, S3, "this device's own fafsa");
    t.vault.onList = () => {
      if (t.vault.serverMode !== "device" || t.vault.rows.has(S3)) return;
      t.vault.set(S3, "another fafsa password");
      if (how === "copy_failed") t.vault.failReveal.add(S3);
    };
    const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: true, serverLeft: 2, resetError: how, slots: [S3] }, how);
    assert.deepEqual(t.writes, ["device"]);
    assert.ok(!t.log.includes("vault:reset"), "nothing deleted on the server");
    assert.equal(await shown(t.device, S3), "this device's own fafsa");
    assert.equal(await shown(t.device, S1), "common app pw");
  }
});

test("to device: a password the vault can't open stops it before anything is copied", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, null);
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "unreadable", slots: [S2] });
  assert.deepEqual(await t.device.slots(U), []);
  assert.deepEqual(t.writes, []);
});

test("to device: an unreadable vault list or an unusable device stops it with nothing changed", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.failList = true;
  assert.deepEqual(await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode }), { ok: false, error: "failed", slots: [] });
  t.vault.failList = false;
  const noDevice = devicePasswords(null);
  assert.deepEqual(await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: noDevice, writeMode: t.writeMode }), { ok: false, error: "device_unavailable", slots: [] });
  assert.deepEqual(t.writes, []);
  assert.equal(t.vault.rows.size, 1);
});

test("to device: what another tab changes in the vault meanwhile is copied too; a cleared one is taken back", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.set(S3, "fafsa pw 7890");
  t.vault.onList = (n) => {
    if (n !== 2) return;
    t.vault.set(S2, "uc pw changed"); // new value, new updated_at
    t.vault.set(S4, "berkeley portal"); // new slot
    t.vault.rows.delete(S3); // cleared
  };
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.equal(r.ok, true);
  assert.equal(await shown(t.device, S2), "uc pw changed");
  assert.equal(await shown(t.device, S4), "berkeley portal");
  assert.equal(await shown(t.device, S3), "not_found");
  assert.equal(t.vault.lists, 4, "three passes, then the one after the switch");
});

test("to device: a vault that never holds still is not switched", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.onList = () => t.vault.set(S1, `changed again ${t.vault.lists}`);
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "changed", slots: [S1] });
  assert.deepEqual(t.writes, []);
  assert.deepEqual(await t.device.slots(U), []);
});

test("to device: no vault and nothing stored: only the mode is written", async () => {
  const t = setup();
  const r = await moveToDevice({ userId: U, hasVault: false, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, OK_SWITCH);
  assert.deepEqual(t.writes, ["device"]);
  assert.ok(!t.log.includes("vault:reset"));
});

// ── deleting the old vault later (retryServerDelete) ──

test("clear server vault: copies what this device lacks, accepts equal copies, then deletes", async () => {
  const t = setup();
  t.vault.serverMode = "device";
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  await t.device.save(U, S1, "common app pw");
  assert.deepEqual(await clearServerVault({ userId: U, open: true, vault: t.vault, device: t.device }), { ok: true });
  assert.equal(await shown(t.device, S2), "uc pw 123456", "copied here before the delete");
  assert.equal(t.vault.rows.size, 0);
  assert.ok(t.log.indexOf("vault:reset") > t.log.indexOf("vault:list"));
});

test("clear server vault: a different password here, a locked vault, an unreadable value or a failed copy stop it; nothing deleted", async () => {
  const cases = [
    { how: "conflict", expect: { ok: false, error: "conflict", slots: [S2] } },
    { how: "locked", expect: { ok: false, error: "locked", slots: [] } },
    { how: "unreadable", expect: { ok: false, error: "unreadable", slots: [S3] } },
    { how: "copy_failed", expect: { ok: false, error: "copy_failed", slots: [S2] } },
  ] as const;
  for (const c of cases) {
    const t = setup();
    t.vault.serverMode = "device";
    t.vault.set(S1, "common app pw");
    t.vault.set(S2, "uc pw 123456");
    if (c.how === "conflict") await t.device.save(U, S2, "this device's uc");
    if (c.how === "unreadable") t.vault.set(S3, null);
    if (c.how === "copy_failed") t.vault.failReveal.add(S2);
    const r = await clearServerVault({ userId: U, open: c.how !== "locked", vault: t.vault, device: t.device });
    assert.deepEqual(r, c.expect, c.how);
    assert.ok(!t.log.includes("vault:reset"), c.how);
    if (c.how === "conflict") assert.equal(await shown(t.device, S2), "this device's uc");
  }
});

test("clear server vault: an empty vault is deleted without unlocking", async () => {
  const t = setup();
  assert.deepEqual(await clearServerVault({ userId: U, open: false, vault: t.vault, device: t.device }), { ok: true });
  assert.ok(t.log.includes("vault:reset"));
});

// ── this device -> vault ──

const MOVED = { kept: [], unreadable: [], notDeleted: [], notMoved: [], deviceUnavailable: false, setupNeeded: false };

test("to vault: the mode is written first (the server takes vault values only then), then moved, confirmed and deleted here", async () => {
  const t = setup();
  t.vault.serverMode = "device";
  await t.device.save(U, S1, "common app pw");
  await t.device.save(U, S2, "uc pw 123456");
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [S1, S2], ...MOVED });
  assert.ok(t.log.indexOf("mode:vault") < t.log.indexOf("vault:import"), t.log.join(" "));
  assert.equal(t.vault.rows.get(S1)?.password, "common app pw");
  assert.equal(t.vault.rows.get(S2)?.password, "uc pw 123456");
  assert.deepEqual(await t.device.slots(U), []);
});

test("to vault: no vault yet: the mode is written and everything stays here until one is set up", async () => {
  const t = setup();
  t.vault.serverMode = "device";
  await t.device.save(U, S1, "common app pw");
  const r = await moveToVault({ userId: U, vault: null, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [], ...MOVED, setupNeeded: true });
  assert.deepEqual(t.writes, ["vault"]);
  assert.equal(await shown(t.device, S1), "common app pw");
  // Set up (the fake vault simply exists now), then the leftovers move in vault mode without another mode write.
  const again = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: null });
  assert.deepEqual(again, { ok: true, moved: [S1], ...MOVED });
  assert.deepEqual(t.writes, ["vault"]);
});

test("to vault: a slot the vault holds with a different password stays on this device; the same password counts as moved", async () => {
  const t = setup();
  t.vault.set(S1, "the vault's own");
  t.vault.set(S2, "uc pw 123456");
  t.vault.set(S4, null); // a value this vault can't open
  await t.device.save(U, S1, "this device's own");
  await t.device.save(U, S2, "uc pw 123456");
  await t.device.save(U, S3, "fafsa pw 7890");
  await t.device.save(U, S4, "berkeley here");
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [S2, S3], ...MOVED, kept: [S1, S4] });
  assert.equal(t.vault.rows.get(S1)?.password, "the vault's own", "the vault's value is never replaced");
  assert.equal(await shown(t.device, S1), "this device's own");
  assert.equal(await shown(t.device, S4), "berkeley here");
  assert.equal(await shown(t.device, S2), "not_found");
});

test("to vault: a failed profile write changes nothing", async () => {
  const t = setup();
  t.vault.serverMode = "device";
  await t.device.save(U, S1, "common app pw");
  t.failWrites();
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "mode_not_saved", slots: [] });
  assert.ok(!t.log.includes("vault:import"));
  assert.equal(await shown(t.device, S1), "common app pw");
});

test("to vault: a password the vault didn't take stays here (notMoved); the rest move", async () => {
  for (const how of ["import refused", "read-back failed"] as const) {
    const t = setup();
    await t.device.save(U, S1, "common app pw");
    await t.device.save(U, S2, "uc pw 123456");
    if (how === "import refused") t.vault.importRefuses.add(S2);
    else t.vault.failReveal.add(S2);
    const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: true, moved: [S1], ...MOVED, notMoved: [S2] }, how);
    assert.equal(await shown(t.device, S1), "not_found");
    assert.equal(await shown(t.device, S2), "uc pw 123456");
  }
});

test("to vault: storage that fails just now stops it (nothing written); no storage at all has nothing to move", async () => {
  for (const op of ["listSlots", "getValue"] as const) {
    const t = setup();
    await t.device.save(U, S1, "common app pw");
    t.storage.failing = [{ op }];
    const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.equal(r.ok === false && r.error, "device_unavailable", op);
    assert.deepEqual(t.writes, [], `${op}: mode not written`);
    t.storage.failing = [];
    assert.equal(await shown(t.device, S1), "common app pw");
  }
  const t = setup();
  const r = await moveToVault({ userId: U, vault: t.vault, device: devicePasswords(null), writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [], ...MOVED, deviceUnavailable: true });
  assert.deepEqual(t.writes, ["vault"]);
});

test("to vault: a password that can't be opened here is left alone and reported", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  t.storage.values.get(U)!.set(S2, "d1.not-a-real-value-at-all-xxxxxxxxxxxxxxxxxxxxxx");
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [S1], ...MOVED, unreadable: [S2] });
  assert.deepEqual(await t.device.slots(U), [S2]);
});

test("to vault: a copy saved here again meanwhile is not deleted (compared and deleted in one step)", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  const importAll = t.vault.importAll.bind(t.vault);
  t.vault.importAll = async (entries) => {
    const left = await importAll(entries);
    await t.device.save(U, S1, "newer, typed in another tab");
    return left;
  };
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [], ...MOVED, notDeleted: [S1] });
  assert.equal(await shown(t.device, S1), "newer, typed in another tab");
});

// ── keeping one copy ──

test("resolve, vault mode: keep the vault's copy deletes this device's; keep this device's writes it into the vault, then deletes it here", async () => {
  let t = setup();
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  assert.equal(await resolveConflict({ userId: U, mode: "vault", slot: S1, keep: "vault", vault: t.vault, device: t.device }), null);
  assert.equal(await shown(t.device, S1), "not_found");
  assert.equal(t.vault.rows.get(S1)?.password, "vault B");

  t = setup();
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  assert.equal(await resolveConflict({ userId: U, mode: "vault", slot: S1, keep: "device", vault: t.vault, device: t.device }), null);
  assert.equal(t.vault.rows.get(S1)?.password, "device A");
  assert.equal(await shown(t.device, S1), "not_found");
});

test("resolve, vault mode: keep this device's copy is compare-and-set; a vault value changed meanwhile wins nothing and loses nothing", async () => {
  const t = setup();
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  const save = t.vault.save.bind(t.vault);
  t.vault.save = async (slot, password, expected) => {
    t.vault.set(S1, "vault C, saved elsewhere");
    return save(slot, password, expected);
  };
  assert.equal(await resolveConflict({ userId: U, mode: "vault", slot: S1, keep: "device", vault: t.vault, device: t.device }), "changed");
  assert.equal(t.vault.rows.get(S1)?.password, "vault C, saved elsewhere");
  assert.equal(await shown(t.device, S1), "device A");
});

test("resolve, device mode: keep the vault's copy saves it here; keep this device's deletes the vault's copy on the server", async () => {
  let t = setup();
  t.vault.serverMode = "device";
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  assert.equal(await resolveConflict({ userId: U, mode: "device", slot: S1, keep: "vault", vault: t.vault, device: t.device }), null);
  assert.equal(await shown(t.device, S1), "vault B");
  assert.equal(t.vault.rows.get(S1)?.password, "vault B");

  t = setup();
  t.vault.serverMode = "device";
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  assert.equal(await resolveConflict({ userId: U, mode: "device", slot: S1, keep: "device", vault: t.vault, device: t.device }), null);
  assert.equal(await shown(t.device, S1), "device A");
  assert.equal(t.vault.rows.has(S1), false);
  // Now the old vault can be cleared: nothing on it differs from this device.
  assert.deepEqual(await clearServerVault({ userId: U, open: true, vault: t.vault, device: t.device }), { ok: true });
});

test("resolve: a locked vault, or a side with nothing that opens, changes nothing", async () => {
  const t = setup();
  t.vault.set(S1, "vault B");
  await t.device.save(U, S1, "device A");
  t.vault.locked = true;
  for (const keep of ["vault", "device"] as const) assert.equal(await resolveConflict({ userId: U, mode: "vault", slot: S1, keep, vault: t.vault, device: t.device }), "locked");
  t.vault.locked = false;
  t.vault.set(S2, null);
  await t.device.save(U, S2, "device copy");
  assert.equal(await resolveConflict({ userId: U, mode: "vault", slot: S2, keep: "vault", vault: t.vault, device: t.device }), "changed", "the vault's copy can't be opened: keeping it would lose this one");
  assert.equal(await shown(t.device, S2), "device copy");
  assert.equal(await shown(t.device, S1), "device A");
  assert.equal(t.vault.rows.get(S1)?.password, "vault B");
});

// ── the sign-in merge's import in device mode ──

test("import into the device store: insert-only, the same password counts as stored, a different one is kept where it was", async () => {
  const t = setup();
  await t.device.save(U, S1, "already here");
  await t.device.save(U, S2, "same as browser");
  const left = await importToDevice(t.device, U, [
    { slot: S1, password: "older build's copy" },
    { slot: S2, password: "same as browser" },
    { slot: S3, password: "brand new one" },
    { slot: S3, password: "a duplicate slot: the first wins" },
    { slot: "not a slot", password: "whatever it is" },
  ]);
  assert.deepEqual(left, [
    { slot: S1, password: "older build's copy" },
    { slot: "not a slot", password: "whatever it is" },
  ]);
  assert.equal(await shown(t.device, S1), "already here", "the device's value is never replaced");
  assert.equal(await shown(t.device, S2), "same as browser");
  assert.equal(await shown(t.device, S3), "brand new one");

  const entries = [{ slot: S4, password: "berkeley portal" }];
  assert.deepEqual(await importToDevice(devicePasswords(null), U, entries), entries, "nothing stored: everything stays");
});
