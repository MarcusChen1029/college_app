import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePasswords } from "./device-passwords.ts";
import { MemoryDeviceStorage } from "./fixtures/memory-device-storage.ts";
import { importToDevice, moveToDevice, moveToVault, type VaultSide, type WriteMode } from "./password-mode.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { FlowError } from "./vault-flows.ts";

// The switching flows with the real device store (real WebCrypto over memory storage) and a fake vault side that keeps
// a log, so each test can check what happened, what didn't, and in which order.

const U = "11111111-1111-4111-8111-111111111111";
const S1 = "system:commonapp";
const S2 = "system:uc";
const S3 = "custom:fafsa-login";
const S4 = "campus:uc:UC Berkeley";

/** The account's vault as the server would hold it: password null = a value this vault can't open (kind "other"). */
class FakeVault implements VaultSide {
  rows = new Map<string, { password: string | null; updated_at: string }>();
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
    if (this.failReveal.has(slot)) return { error: "failed" };
    const r = this.rows.get(slot);
    if (!r) return { error: "not_found" };
    return r.password === null ? { error: "other_vault" } : { password: r.password };
  }
  async importAll(entries: readonly SlotPassword[]) {
    this.log.push("vault:import");
    const left: SlotPassword[] = [];
    for (const e of entries) {
      if (this.importRefuses.has(e.slot) || this.rows.has(e.slot)) left.push(e);
      else this.set(e.slot, e.password);
    }
    return left;
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
    return writeOk;
  };
  return { log, storage, device, vault, writeMode, writes, failWrites: () => (writeOk = false) };
}

const shown = async (device: ReturnType<typeof devicePasswords>, slot: string) => {
  const r = await device.reveal(U, slot);
  return "password" in r ? r.password : r.error;
};

// ── vault -> this device ──

test("to device: every password copied and read back, then the mode written, then the vault deleted", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.set(S3, "fafsa pw 7890");
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, serverLeft: 0, resetError: null, replaced: [] });
  assert.equal(await shown(t.device, S1), "common app pw");
  assert.equal(await shown(t.device, S2), "uc pw 123456");
  assert.equal(await shown(t.device, S3), "fafsa pw 7890");
  assert.deepEqual(t.writes, ["device"]);
  assert.ok(t.log.indexOf("mode:device") < t.log.indexOf("vault:reset"), t.log.join(" "));
  assert.ok(t.log.lastIndexOf("vault:list") < t.log.indexOf("mode:device"), "the list was checked again before the switch");
  assert.equal(t.vault.rows.size, 0);
});

test("to device: a copy that fails changes nothing on the server, keeps the mode, and takes back the copies", async () => {
  for (const how of ["device write", "vault read"] as const) {
    const t = setup();
    t.vault.set(S1, "common app pw");
    t.vault.set(S2, "uc pw 123456");
    await t.device.save(U, S3, "kept on this device"); // unrelated, must survive
    await t.device.save(U, S1, "older copy here"); // overwritten by the copy, then put back
    if (how === "device write") t.storage.failing = [{ op: "putValue", slot: S2 }];
    else t.vault.failReveal.add(S2);
    const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: false, error: "copy_failed", slots: [S2] }, how);
    assert.deepEqual(t.writes, [], "mode never written");
    assert.ok(!t.log.includes("vault:reset"), "server untouched");
    assert.equal(t.vault.rows.size, 2);
    t.storage.failing = [];
    assert.equal(await shown(t.device, S1), "older copy here", "the slot's earlier value is back");
    assert.equal(await shown(t.device, S2), "not_found");
    assert.equal(await shown(t.device, S3), "kept on this device");
  }
});

test("to device: a copy that doesn't read back the same stops the switch", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  const put = t.storage.putValue.bind(t.storage);
  t.storage.putValue = (userId, slot, value) => put(userId, slot, value.slice(0, -3) + "AAA");
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.equal(r.ok, false);
  assert.deepEqual(t.writes, []);
  assert.equal(t.vault.rows.size, 1);
});

test("to device: a failed reset leaves the account in device mode and reports what the server still holds", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, "uc pw 123456");
  t.vault.failReset = true;
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, serverLeft: 2, resetError: "failed", replaced: [] });
  assert.deepEqual(t.writes, ["device"]);
  assert.ok(t.log.indexOf("mode:device") < t.log.indexOf("vault:reset"));
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

test("to device: a password the vault can't open stops it before anything is copied", async () => {
  const t = setup();
  t.vault.set(S1, "common app pw");
  t.vault.set(S2, null);
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "unreadable", slots: [S2] });
  assert.deepEqual(await t.device.slots(U), []);
  assert.deepEqual(t.writes, []);
  assert.equal(t.vault.rows.size, 2);
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
  assert.equal(t.vault.lists, 3);
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
  assert.deepEqual(r, { ok: true, serverLeft: 0, resetError: null, replaced: [] });
  assert.deepEqual(t.writes, ["device"]);
  assert.ok(!t.log.includes("vault:reset"));
});

test("to device: an older, different copy on this device is replaced by the vault's and reported", async () => {
  const t = setup();
  await t.device.save(U, S1, "stale device copy");
  t.vault.set(S1, "the vault's value");
  t.vault.set(S2, "uc pw 123456");
  await t.device.save(U, S2, "uc pw 123456"); // same value: not a replacement
  const r = await moveToDevice({ userId: U, hasVault: true, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, serverLeft: 0, resetError: null, replaced: [S1] });
  assert.equal(await shown(t.device, S1), "the vault's value");
});

// ── this device -> vault ──

test("to vault: moved and confirmed in the vault, then the mode written, then deleted here", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  await t.device.save(U, S2, "uc pw 123456");
  const writeMode: WriteMode = async (mode) => {
    t.log.push(`mode:${mode}`);
    assert.deepEqual(((await t.device.slots(U)) as string[]).sort(), [S1, S2].sort(), "nothing deleted here before the mode is written");
    return true;
  };
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode });
  assert.deepEqual(r, { ok: true, moved: [S1, S2], kept: [], unreadable: [], notDeleted: [], deviceUnavailable: false });
  assert.equal(t.vault.rows.get(S1)?.password, "common app pw");
  assert.equal(t.vault.rows.get(S2)?.password, "uc pw 123456");
  assert.ok(t.log.indexOf("vault:import") < t.log.indexOf("mode:vault"));
  assert.deepEqual(await t.device.slots(U), []);
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
  assert.deepEqual(r, { ok: true, moved: [S2, S3], kept: [S1, S4], unreadable: [], notDeleted: [], deviceUnavailable: false });
  assert.equal(t.vault.rows.get(S1)?.password, "the vault's own", "the vault's value is never replaced");
  assert.equal(await shown(t.device, S1), "this device's own");
  assert.equal(await shown(t.device, S4), "berkeley here");
  assert.equal(await shown(t.device, S2), "not_found");
  assert.equal(await shown(t.device, S3), "not_found");
  assert.deepEqual(t.writes, ["vault"]);
});

test("to vault: a failed profile write deletes nothing here", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  await t.device.save(U, S2, "uc pw 123456");
  t.failWrites();
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: false, error: "mode_not_saved", slots: [] });
  assert.equal(await shown(t.device, S1), "common app pw");
  assert.equal(await shown(t.device, S2), "uc pw 123456");
  // Trying again once the write works: the passwords are already in the vault, so they count as moved.
  const again = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: async () => true });
  assert.deepEqual(again, { ok: true, moved: [S1, S2], kept: [], unreadable: [], notDeleted: [], deviceUnavailable: false });
});

test("to vault: a password the vault didn't confirm stops it: nothing deleted, mode unchanged", async () => {
  for (const how of ["import refused", "read-back failed"] as const) {
    const t = setup();
    await t.device.save(U, S1, "common app pw");
    await t.device.save(U, S2, "uc pw 123456");
    if (how === "import refused") t.vault.importRefuses.add(S2);
    else t.vault.failReveal.add(S2);
    const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
    assert.deepEqual(r, { ok: false, error: "move_failed", slots: [S2] }, how);
    assert.deepEqual(t.writes, []);
    assert.equal(await shown(t.device, S1), "common app pw");
    assert.equal(await shown(t.device, S2), "uc pw 123456");
  }
});

test("to vault: a password that can't be read here is left alone; a read that fails stops it", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  t.storage.values.get(U)!.set(S2, "d1.not-a-real-value-at-all-xxxxxxxxxxxxxxxxxxxxxx");
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [S1], kept: [], unreadable: [S2], notDeleted: [], deviceUnavailable: false });
  assert.deepEqual(await t.device.slots(U), [S2]);
  assert.equal(t.vault.rows.has(S2), false);

  const u = setup();
  await u.device.save(U, S1, "common app pw");
  u.storage.failing = [{ op: "getValue", slot: S1 }];
  assert.deepEqual(await moveToVault({ userId: U, vault: u.vault, device: u.device, writeMode: u.writeMode }), { ok: false, error: "move_failed", slots: [S1] });
  assert.deepEqual(u.writes, []);
});

test("to vault: a browser that can't keep passwords has nothing to move; the mode is still written", async () => {
  const t = setup();
  const r = await moveToVault({ userId: U, vault: t.vault, device: devicePasswords(null), writeMode: t.writeMode });
  assert.deepEqual(r, { ok: true, moved: [], kept: [], unreadable: [], notDeleted: [], deviceUnavailable: true });
  assert.deepEqual(t.writes, ["vault"]);
});

test("to vault: a copy saved here again meanwhile is not deleted", async () => {
  const t = setup();
  await t.device.save(U, S1, "common app pw");
  const writeMode: WriteMode = async () => {
    await t.device.save(U, S1, "newer, typed in another tab");
    return true;
  };
  const r = await moveToVault({ userId: U, vault: t.vault, device: t.device, writeMode });
  assert.equal(r.ok && r.notDeleted.join(), S1);
  assert.equal(await shown(t.device, S1), "newer, typed in another tab");
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
