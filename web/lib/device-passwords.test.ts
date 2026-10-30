import assert from "node:assert/strict";
import { test } from "node:test";
import { idbDeviceStorage } from "./device-passwords-idb.ts";
import { DEVICE_VALUE_PREFIX, devicePasswords, newDeviceKey, openDevice, sealDevice, type DevicePasswords } from "./device-passwords.ts";
import { MemoryDeviceStorage } from "./fixtures/memory-device-storage.ts";
import { PASSWORD_MAX } from "./portal-slots.ts";

// The device store runs with real WebCrypto (globalThis.crypto.subtle) over an in-memory storage that follows the
// IndexedDB adapter's contract.

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const SLOT = "system:commonapp";
const OTHER_SLOT = "system:uc";
const PW = "correct horse battery staple";

function setup() {
  const storage = new MemoryDeviceStorage();
  return { storage, device: devicePasswords(storage) };
}

test("device store: save, list, reveal, replace, delete one, delete all", async () => {
  const { storage, device } = setup();
  assert.deepEqual(await device.slots(A), []);
  assert.deepEqual(await device.reveal(A, SLOT), { error: "not_found" });

  assert.equal(await device.save(A, SLOT, PW), null);
  assert.equal(await device.save(A, OTHER_SLOT, "second one!"), null);
  assert.deepEqual((await device.slots(A)) as string[], [SLOT, OTHER_SLOT]);
  assert.deepEqual(await device.reveal(A, SLOT), { password: PW });

  // What is stored is a d1 value, not the password.
  const stored = storage.values.get(A)!.get(SLOT)!;
  assert.ok(stored.startsWith(DEVICE_VALUE_PREFIX));
  assert.ok(!stored.includes(PW));

  assert.equal(await device.save(A, SLOT, "a new password"), null);
  assert.deepEqual(await device.reveal(A, SLOT), { password: "a new password" });

  assert.equal(await device.remove(A, SLOT), null);
  assert.deepEqual(await device.reveal(A, SLOT), { error: "not_found" });
  assert.deepEqual(await device.slots(A), [OTHER_SLOT]);
  assert.equal(await device.remove(A, SLOT), null); // nothing there: still fine

  assert.equal(await device.removeAll(A), null);
  assert.deepEqual(await device.slots(A), []);
  assert.equal(storage.keys.has(A), false, "the key goes with the passwords");
});

test("device store: one non-extractable AES-GCM key per account, made on first save and never replaced", async () => {
  const { storage, device } = setup();
  assert.equal(storage.keys.size, 0);
  await device.reveal(A, SLOT); // reading never makes a key
  assert.equal(storage.keys.size, 0);
  await device.save(A, SLOT, PW);
  const key = storage.keys.get(A)!;
  assert.equal(key.extractable, false);
  assert.equal(key.algorithm.name, "AES-GCM");
  assert.equal((key.algorithm as AesKeyAlgorithm).length, 256);
  await assert.rejects(globalThis.crypto.subtle.exportKey("raw", key));
  await device.save(A, OTHER_SLOT, PW);
  assert.equal(storage.keys.get(A), key, "the second save uses the same key");
});

test("device store: saves racing for the first key both end up readable", async () => {
  const { device } = setup();
  const results = await Promise.all([device.save(A, SLOT, "first racer"), device.save(A, OTHER_SLOT, "second racer")]);
  assert.deepEqual(results, [null, null]);
  assert.deepEqual(await device.reveal(A, SLOT), { password: "first racer" });
  assert.deepEqual(await device.reveal(A, OTHER_SLOT), { password: "second racer" });
});

test("device store: another account, another slot, another key or a changed value don't open", async () => {
  const { storage, device } = setup();
  await device.save(A, SLOT, PW);
  await device.save(B, SLOT, "b's own password");
  const sealed = storage.values.get(A)!.get(SLOT)!;

  // Another account: B can't see A's passwords, and A's value put under B doesn't open with B's key...
  assert.deepEqual(await device.slots(B), [SLOT]);
  storage.values.get(B)!.set(SLOT, sealed);
  assert.deepEqual(await device.reveal(B, SLOT), { error: "damaged" });
  // ...nor with A's own key copied over to B (the additional data names the account).
  storage.keys.set(B, storage.keys.get(A)!);
  assert.deepEqual(await device.reveal(B, SLOT), { error: "damaged" });

  // Another slot of the same account.
  storage.values.get(A)!.set(OTHER_SLOT, sealed);
  assert.deepEqual(await device.reveal(A, OTHER_SLOT), { error: "damaged" });

  // A changed value (each body character flipped in turn would be slow; one in the middle, one in the tag).
  for (const i of [DEVICE_VALUE_PREFIX.length + 5, sealed.length - 2]) {
    const c = sealed[i] === "A" ? "B" : "A";
    storage.values.get(A)!.set(SLOT, sealed.slice(0, i) + c + sealed.slice(i + 1));
    assert.deepEqual(await device.reveal(A, SLOT), { error: "damaged" });
  }
  for (const junk of ["", "d1.", "d1.AAAA", `e1.${"K".repeat(16)}.${sealed.slice(3)}`, PW]) {
    storage.values.get(A)!.set(SLOT, junk);
    assert.deepEqual(await device.reveal(A, SLOT), { error: "damaged" }, junk);
  }

  // A value whose account key is gone can't be opened either.
  storage.values.get(A)!.set(SLOT, sealed);
  assert.deepEqual(await device.reveal(A, SLOT), { password: PW });
  storage.keys.delete(A);
  assert.deepEqual(await device.reveal(A, SLOT), { error: "damaged" });
});

test("device store: the sealing functions bind account and slot, and refuse bad input", async () => {
  const key = await newDeviceKey();
  const sealed = await sealDevice(key, A, SLOT, PW);
  assert.equal(await openDevice(key, A, SLOT, sealed), PW);
  assert.equal(await openDevice(key, B, SLOT, sealed), null);
  assert.equal(await openDevice(key, A, OTHER_SLOT, sealed), null);
  assert.equal(await openDevice(await newDeviceKey(), A, SLOT, sealed), null);
  assert.notEqual(await sealDevice(key, A, SLOT, PW), sealed, "a fresh IV every time");
  for (const [user, slot, pw] of [
    [A, SLOT, ""],
    [A, SLOT, "x".repeat(PASSWORD_MAX + 1)],
    [A, SLOT, "lone \ud800 surrogate"],
    [A, "not a slot", PW],
    ["", SLOT, PW],
    ["a|b", SLOT, PW],
  ])
    await assert.rejects(sealDevice(key, user, slot, pw));
  // Edge texts survive the round trip.
  for (const pw of ["x".repeat(PASSWORD_MAX), "﻿leading BOM", "emoji 🔐 and 中文"]) assert.equal(await openDevice(key, A, SLOT, await sealDevice(key, A, SLOT, pw)), pw);
});

test("device store: bad input is refused and nothing is stored", async () => {
  const { storage, device } = setup();
  assert.equal(await device.save(A, SLOT, ""), "bad_input");
  assert.equal(await device.save(A, SLOT, "x".repeat(PASSWORD_MAX + 1)), "bad_input");
  assert.equal(await device.save(A, "system:Not Valid", PW), "bad_input");
  assert.equal(await device.save("", SLOT, PW), "bad_input");
  assert.equal(await device.add(A, "nope", PW), "bad_input");
  assert.deepEqual(await device.reveal(A, "nope"), { error: "bad_input" });
  assert.equal(storage.values.size + storage.keys.size, 0);
  assert.equal(await device.save(A, SLOT, "x".repeat(PASSWORD_MAX)), null);
});

test("device store: add is insert-only (same password = stored, different = occupied and kept)", async () => {
  const { device } = setup();
  assert.equal(await device.add(A, SLOT, PW), null);
  assert.deepEqual(await device.reveal(A, SLOT), { password: PW });
  assert.equal(await device.add(A, SLOT, PW), null, "already holds this very password");
  assert.equal(await device.add(A, SLOT, "something else"), "occupied");
  assert.deepEqual(await device.reveal(A, SLOT), { password: PW }, "the stored one is kept");
});

test("device store: removing all of one account leaves the other account alone", async () => {
  const { device } = setup();
  await device.save(A, SLOT, PW);
  await device.save(B, SLOT, "b's password");
  assert.equal(await device.removeAll(A), null);
  assert.deepEqual(await device.slots(A), []);
  assert.deepEqual(await device.reveal(B, SLOT), { password: "b's password" });
});

async function everyCall(device: DevicePasswords) {
  return {
    slots: await device.slots(A),
    reveal: await device.reveal(A, SLOT),
    save: await device.save(A, SLOT, PW),
    add: await device.add(A, SLOT, PW),
    remove: await device.remove(A, SLOT),
    removeIfSame: await device.removeIfSame(A, SLOT, PW),
    removeAll: await device.removeAll(A),
  };
}
const ALL_UNAVAILABLE = {
  slots: "unavailable",
  reveal: { error: "unavailable" },
  save: "unavailable",
  add: "unavailable",
  remove: "unavailable",
  removeIfSame: "unavailable",
  removeAll: "unavailable",
};

test("device store: no storage at all (no IndexedDB, as in Node) reports unavailable, deletes nothing that can't exist, never throws", async () => {
  assert.equal(idbDeviceStorage(), null, "Node has no indexedDB");
  // Nothing can have been saved without storage, so the deletes say done; everything else says unavailable.
  const none = { ...ALL_UNAVAILABLE, remove: null, removeIfSame: null, removeAll: null };
  assert.deepEqual(await everyCall(devicePasswords(null)), none);
  assert.deepEqual(await everyCall(devicePasswords(idbDeviceStorage())), none);
  assert.equal(devicePasswords(null).present, false);
  assert.equal(devicePasswords(new MemoryDeviceStorage()).present, true);
});

test("device store: removeIfSame deletes only while the value is still the one given", async () => {
  const { storage, device } = setup();
  await device.save(A, SLOT, PW);
  assert.equal(await device.removeIfSame(A, SLOT, "not the stored one"), "changed");
  assert.deepEqual(await device.reveal(A, SLOT), { password: PW });
  assert.equal(await device.removeIfSame(A, SLOT, PW), null);
  assert.deepEqual(await device.reveal(A, SLOT), { error: "not_found" });
  assert.equal(await device.removeIfSame(A, SLOT, PW), null, "already gone");
  // Another tab saves a new value between the read and the delete: the compare inside the storage step keeps it.
  await device.save(A, SLOT, PW);
  const getValue = storage.getValue.bind(storage);
  storage.getValue = async (userId, slot) => {
    const v = await getValue(userId, slot);
    storage.getValue = getValue;
    await device.save(A, SLOT, "typed in another tab");
    return v;
  };
  assert.equal(await device.removeIfSame(A, SLOT, PW), "changed");
  assert.deepEqual(await device.reveal(A, SLOT), { password: "typed in another tab" });
});

test("device store: a storage that rejects, or even throws, reports unavailable and never throws", async () => {
  for (const throwSync of [false, true]) {
    const storage = new MemoryDeviceStorage();
    storage.throwSync = throwSync;
    storage.failing = (["getKey", "addKey", "getValue", "putValue", "addValue", "deleteValue", "deleteValueIf", "listSlots", "deleteAccount"] as const).map((op) => ({ op }));
    assert.deepEqual(await everyCall(devicePasswords(storage)), ALL_UNAVAILABLE, `throwSync=${throwSync}`);
  }
  // A write that fails after the key exists: unavailable, and nothing half-stored is reported as saved.
  const storage = new MemoryDeviceStorage();
  const device = devicePasswords(storage);
  await device.save(A, OTHER_SLOT, PW);
  storage.failing = [{ op: "putValue", slot: SLOT }];
  assert.equal(await device.save(A, SLOT, PW), "unavailable");
  assert.deepEqual(await device.reveal(A, SLOT), { error: "not_found" });
  assert.deepEqual(await device.reveal(A, OTHER_SLOT), { password: PW });
});

test("device store: a write that doesn't read back is not reported as saved", async () => {
  const storage = new MemoryDeviceStorage();
  const device = devicePasswords(storage);
  const put = storage.putValue.bind(storage);
  storage.putValue = (userId, slot, value) => put(userId, slot, value.slice(0, -2) + (value.endsWith("AA") ? "BB" : "AA"));
  assert.equal(await device.save(A, SLOT, PW), "failed");
});
