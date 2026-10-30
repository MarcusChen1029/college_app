import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePasswords } from "./device-passwords.ts";
import { MemoryDeviceStorage } from "./fixtures/memory-device-storage.ts";
import { oneAtATime, passwordLockName, type Locks } from "./one-at-a-time.ts";
import { moveToDevice, type VaultSide } from "./password-mode.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { FlowError } from "./vault-flows.ts";

// The lock the password client takes around every switch, move, delete of the old vault and conflict choice, with Node's
// own Web Locks (navigator.locks): two tabs of one browser share it the same way.

const U = "11111111-1111-4111-8111-111111111111";
const S1 = "system:commonapp";
const S2 = "system:uc";

// A minimal shared vault; every call is logged with the tab that made it.
function sharedVault() {
  const rows = new Map<string, { password: string; updated_at: string }>();
  const log: string[] = [];
  let tick = 0;
  let mode: "vault" | "device" = "vault";
  const set = (slot: string, password: string) => rows.set(slot, { password, updated_at: `2026-10-30T09:00:00.${String(++tick).padStart(6, "0")}+00:00` });
  const side = (tab: string): VaultSide => ({
    list: async (): Promise<SlotState[] | { error: FlowError }> => {
      log.push(`${tab}:list`);
      await new Promise((r) => setTimeout(r, 1)); // let the other tab run if nothing holds it back
      return [...rows].map(([slot, r]) => ({ slot, kind: "e1", updated_at: r.updated_at }));
    },
    reveal: async (slot) => {
      const r = rows.get(slot);
      return r ? { password: r.password } : { error: "not_found" };
    },
    importAll: async (entries: readonly SlotPassword[]) => [...entries],
    save: async () => (mode === "device" ? "device_mode" : null),
    remove: async (slot) => {
      rows.delete(slot);
      return null;
    },
    reset: async () => {
      log.push(`${tab}:reset`);
      rows.clear();
      return null;
    },
  });
  const writeMode = (tab: string) => async (m: "vault" | "device") => {
    log.push(`${tab}:mode`);
    mode = m;
    return true;
  };
  return { rows, log, set, side, writeMode };
}

test("Node has Web Locks, so this test exercises the real API", () => {
  assert.equal(typeof (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks?.request, "function");
  assert.equal(passwordLockName(U), `trakur-passwords:${U}`);
});

test("two tabs starting a switch at once run one after the other, and every password ends up on this device", async () => {
  const v = sharedVault();
  v.set(S1, "common app pw");
  v.set(S2, "uc pw 123456");
  const device = devicePasswords(new MemoryDeviceStorage()); // one browser: both tabs share its storage
  const run = (tab: string) => oneAtATime(U, () => moveToDevice({ userId: U, hasVault: true, vault: v.side(tab), device, writeMode: v.writeMode(tab) }));
  const [a, b] = await Promise.all([run("A"), run("B")]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  // No interleaving: every step of the first tab comes before the second tab's first step.
  const firstB = v.log.findIndex((e) => e.startsWith("B:"));
  assert.ok(v.log.slice(firstB).every((e) => e.startsWith("B:")), v.log.join(" "));
  assert.equal(v.rows.size, 0);
  for (const [slot, pw] of [[S1, "common app pw"], [S2, "uc pw 123456"]]) {
    const r = await device.reveal(U, slot);
    assert.ok("password" in r && r.password === pw, `${slot} still on this device`);
  }
});

test("another account's lock doesn't wait; without the API (or when it refuses) the step simply runs once", async () => {
  let release: () => void = () => {};
  const held = oneAtATime(U, () => new Promise<void>((r) => (release = r)));
  let other = false;
  await oneAtATime("22222222-2222-4222-8222-222222222222", async () => {
    other = true;
  });
  assert.equal(other, true);
  release();
  await held;

  let runs = 0;
  assert.equal(await oneAtATime(U, async () => ++runs, null), 1);
  const refusing: Locks = { request: () => Promise.reject(new Error("SecurityError")) };
  assert.equal(await oneAtATime(U, async () => ++runs, refusing), 2);
  const failingStep = oneAtATime(U, async () => {
    runs++;
    throw new Error("step failed");
  });
  await assert.rejects(failingStep, /step failed/);
  assert.equal(runs, 3, "a step that fails inside the lock is not run a second time");
});
