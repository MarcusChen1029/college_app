// An in-memory DeviceStorage for the Node tests (device-passwords.test.ts, password-mode.test.ts): the same contract as
// the IndexedDB adapter (device-passwords-idb.ts), with switches to make a call fail. Never used by the site.

import type { DeviceStorage } from "../device-passwords.ts";

type Op = keyof DeviceStorage;

export class MemoryDeviceStorage implements DeviceStorage {
  keys = new Map<string, CryptoKey>();
  values = new Map<string, Map<string, string>>(); // user id -> slot -> stored value
  /** Every call that fails: by operation, optionally only for one slot. */
  failing: { op: Op; slot?: string }[] = [];
  /** Throw synchronously instead of rejecting (a storage that breaks the contract must still not reach callers). */
  throwSync = false;

  private check(op: Op, slot?: string) {
    if (this.failing.some((f) => f.op === op && (f.slot === undefined || f.slot === slot))) {
      if (this.throwSync) throw new Error("storage broke");
      return Promise.reject(new Error("storage broke"));
    }
    return null;
  }

  private of(userId: string) {
    let m = this.values.get(userId);
    if (!m) this.values.set(userId, (m = new Map()));
    return m;
  }

  getKey(userId: string) {
    return this.check("getKey") ?? Promise.resolve(this.keys.get(userId) ?? null);
  }
  addKey(userId: string, key: CryptoKey) {
    const failed = this.check("addKey");
    if (failed) return failed;
    if (this.keys.has(userId)) return Promise.resolve(false);
    this.keys.set(userId, key);
    return Promise.resolve(true);
  }
  getValue(userId: string, slot: string) {
    return this.check("getValue", slot) ?? Promise.resolve(this.values.get(userId)?.get(slot) ?? null);
  }
  putValue(userId: string, slot: string, value: string) {
    const failed = this.check("putValue", slot);
    if (failed) return failed;
    this.of(userId).set(slot, value);
    return Promise.resolve();
  }
  addValue(userId: string, slot: string, value: string) {
    const failed = this.check("addValue", slot);
    if (failed) return failed;
    const m = this.of(userId);
    if (m.has(slot)) return Promise.resolve(false);
    m.set(slot, value);
    return Promise.resolve(true);
  }
  deleteValue(userId: string, slot: string) {
    const failed = this.check("deleteValue", slot);
    if (failed) return failed;
    this.values.get(userId)?.delete(slot);
    return Promise.resolve();
  }
  listSlots(userId: string) {
    return this.check("listSlots") ?? Promise.resolve([...(this.values.get(userId)?.keys() ?? [])]);
  }
  deleteAccount(userId: string) {
    const failed = this.check("deleteAccount");
    if (failed) return failed;
    this.values.delete(userId);
    this.keys.delete(userId);
    return Promise.resolve();
  }
}
