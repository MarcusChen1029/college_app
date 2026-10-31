import assert from "node:assert/strict";
import { test } from "node:test";
import { devicePasswords } from "./device-passwords.ts";
import { MemoryDeviceStorage } from "./fixtures/memory-device-storage.ts";
import { canLock, LOCK_IDLE_MS, oneAtATime, passwordLockName, type Locks } from "./one-at-a-time.ts";
import { fencedDevice, fencedVault, fencedWrite, moveToDevice, type ToDeviceResult, type VaultSide } from "./password-mode.ts";
import type { SlotPassword } from "./portal-slots.ts";
import type { SlotState } from "./portal-vault-handler.ts";
import type { FlowError } from "./vault-flows.ts";

// The lock the password client takes around every switch, move, delete of the old vault, conflict choice and Start over,
// with Node's own Web Locks (navigator.locks): two tabs of one browser share it the same way.

const U = "11111111-1111-4111-8111-111111111111";
const S1 = "system:commonapp";
const S2 = "system:uc";
const NO_LOCK: ToDeviceResult = { ok: false, error: "no_locks", slots: [] };
const TIMED_OUT: ToDeviceResult = { ok: false, error: "timeout", slots: [] };
const LOCK_RESULTS = { noLock: NO_LOCK, timedOut: TIMED_OUT };
const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

// A minimal shared vault; every call is logged with the tab that made it. `hang` holds a list until it is released.
function sharedVault() {
  const rows = new Map<string, { password: string; updated_at: string }>();
  const log: string[] = [];
  let n = 0;
  let mode: "vault" | "device" = "vault";
  let hang: { at: (tab: string) => boolean; until: Promise<void> } | null = null;
  const set = (slot: string, password: string) => rows.set(slot, { password, updated_at: `2026-10-30T09:00:00.${String(++n).padStart(6, "0")}+00:00` });
  const side = (tab: string): VaultSide => ({
    list: async (): Promise<SlotState[] | { error: FlowError }> => {
      log.push(`${tab}:list`);
      if (hang?.at(tab)) await hang.until;
      await tick(); // let the other tab run if nothing holds it back
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
  const hangAt = (at: (tab: string) => boolean) => {
    let release: () => void = () => {};
    hang = { at, until: new Promise<void>((r) => (release = r)) };
    return () => {
      hang = null;
      release();
    };
  };
  return { rows, log, set, side, writeMode, hangAt, mode: () => mode };
}

test("Node has Web Locks, so this test exercises the real API", () => {
  assert.equal(typeof (globalThis as { navigator?: { locks?: Locks } }).navigator?.locks?.request, "function");
  assert.equal(canLock(), true);
  assert.equal(passwordLockName(U), `trakur-passwords:${U}`);
  assert.equal(LOCK_IDLE_MS, 60_000);
});

test("two tabs starting a switch at once run one after the other, and every password ends up on this device", async () => {
  const v = sharedVault();
  v.set(S1, "common app pw");
  v.set(S2, "uc pw 123456");
  const device = devicePasswords(new MemoryDeviceStorage()); // one browser: both tabs share its storage
  const run = (tab: string) => oneAtATime(U, () => moveToDevice({ userId: U, hasVault: true, vault: v.side(tab), device, writeMode: v.writeMode(tab) }), LOCK_RESULTS);
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

test("another account's lock doesn't wait; without Web Locks (or when they refuse) the step never runs unserialized", async () => {
  let release: () => void = () => {};
  const held = oneAtATime(U, () => new Promise<number>((r) => (release = () => r(0))), { noLock: -1, timedOut: -2 });
  let other = false;
  await oneAtATime(
    "22222222-2222-4222-8222-222222222222",
    async () => {
      other = true;
      return 0;
    },
    { noLock: -1, timedOut: -2 },
  );
  assert.equal(other, true);
  release();
  await held;

  let runs = 0;
  const results = { noLock: -1, timedOut: -2 };
  assert.equal(await oneAtATime(U, async () => ++runs, results, { locks: null }), -1, "no API: the noLock result");
  const refusing: Locks = { request: () => Promise.reject(new Error("SecurityError")) };
  assert.equal(await oneAtATime(U, async () => ++runs, results, { locks: refusing }), -1, "an API that refuses: the same");
  assert.equal(runs, 0, "the step ran neither time");
  const failingStep = oneAtATime(
    U,
    async () => {
      runs++;
      throw new Error("step failed");
    },
    results,
  );
  await assert.rejects(failingStep, /step failed/);
  assert.equal(runs, 1, "a step that fails inside the lock is not run a second time");
});

test("without Web Locks a whole switch changes nothing (the data loss two unserialized tabs caused can't start)", async () => {
  const v = sharedVault();
  v.set(S1, "common app pw");
  v.set(S2, "uc pw 123456");
  const device = devicePasswords(new MemoryDeviceStorage());
  const run = (tab: string) => oneAtATime(U, () => moveToDevice({ userId: U, hasVault: true, vault: v.side(tab), device, writeMode: v.writeMode(tab) }), LOCK_RESULTS, { locks: null });
  assert.deepEqual(await Promise.all([run("A"), run("B")]), [NO_LOCK, NO_LOCK]);
  assert.deepEqual(v.log, [], "nothing was asked of the vault");
  assert.equal(v.rows.size, 2);
  assert.deepEqual(await device.slots(U), []);
  assert.equal(v.mode(), "vault");
});

test("a step with no progress for the time limit is given up: its signal aborts and the lock is free again", async () => {
  let signal: AbortSignal | null = null;
  const hung = await oneAtATime(
    U,
    (hold) => {
      signal = hold.signal;
      return new Promise<number>(() => {}); // a request that never answers
    },
    { noLock: -1, timedOut: -2 },
    { idleMs: 20 },
  );
  assert.equal(hung, -2);
  assert.equal((signal as AbortSignal | null)?.aborted, true);
  assert.equal(await oneAtATime(U, async () => 7, { noLock: -1, timedOut: -2 }, { idleMs: 20 }), 7, "the next step gets the lock");

  // A long step that keeps making progress is never cut off, however long it runs in total.
  const long = await oneAtATime(
    U,
    async (hold) => {
      for (let i = 0; i < 6; i++) {
        await tick(10);
        hold.progress();
      }
      return 1;
    },
    { noLock: -1, timedOut: -2 },
    { idleMs: 25 },
  );
  assert.equal(long, 1);
});

test("a switch given up while a request hung deletes nothing afterwards, and the next try still works", async () => {
  const v = sharedVault();
  v.set(S1, "common app pw");
  v.set(S2, "uc pw 123456");
  const device = devicePasswords(new MemoryDeviceStorage());
  // The list right after the mode write hangs (A's 3rd list: two passes, then the one after the switch).
  let lists = 0;
  const release = v.hangAt((tab) => tab === "A" && ++lists === 3);
  let finished: Promise<ToDeviceResult> | null = null;
  const r = await oneAtATime(
    U,
    (hold) => {
      finished = moveToDevice({ userId: U, hasVault: true, vault: fencedVault(v.side("A"), hold), device: fencedDevice(device, hold), writeMode: fencedWrite(v.writeMode("A"), hold) });
      return finished;
    },
    LOCK_RESULTS,
    { idleMs: 30 },
  );
  assert.deepEqual(r, TIMED_OUT);
  release(); // the hung list answers at last; the flow goes on, but every further call is refused
  const late = await (finished as Promise<ToDeviceResult> | null);
  assert.equal(late?.ok, true, "the mode had been written before the hang");
  assert.ok(late?.ok && late.resetError !== null, "...so the late flow ends holding the vault");
  assert.ok(!v.log.includes("A:reset"), `nothing deleted after the time-out: ${v.log.join(" ")}`);
  assert.equal(v.rows.size, 2, "the old vault still holds both");
  for (const [slot, pw] of [[S1, "common app pw"], [S2, "uc pw 123456"]]) {
    const got = await device.reveal(U, slot);
    assert.ok("password" in got && got.password === pw, `${slot} copied here and kept`);
  }
});
