// "This device only" portal passwords (design: docs/superpowers/specs/2026-10-30-device-only-passwords-design.md): the
// passwords of an account in device mode, kept in this browser and nowhere else. Pure (no React, no Supabase, no
// node:crypto): the logic runs against an injected DeviceStorage, so Node tests use real WebCrypto over an in-memory
// store (fixtures/memory-device-storage.ts) and the browser uses IndexedDB (device-passwords-idb.ts).
// - Per account one AES-256-GCM key, made here on first use as a NON-extractable CryptoKey: it is stored as the key
//   object itself (IndexedDB keeps it as such), so its bytes can't be read out by any script, ours included.
// - Per (account, slot) one value "d1.<base64url(iv | ciphertext + tag)>", additional data
//   "device|user:<id>|slot:<slot>", so a value moved to another slot or account (or put under another key) won't open.
// - Nothing from here is ever sent in a request, logged, or put in localStorage or a URL. Every storage failure (no
//   IndexedDB in this window, a refused write, a broken database) is reported as "unavailable"; nothing here throws.

import { isPortalSlot, PASSWORD_MAX } from "./portal-slots.ts";
import { isWellFormed } from "./vault-crypto.ts";
import { b64u, fromB64u } from "./vault-format.ts";

/**
 * Where the device store keeps its keys and values. Methods may reject, or even throw, on any failure; the functions
 * below turn that into "unavailable". Values are opaque strings to it; keys are CryptoKey objects, stored as they are.
 */
export interface DeviceStorage {
  getKey(userId: string): Promise<CryptoKey | null>;
  /** Stores the account's key unless one is there already: false = one was there (it is kept, never replaced). */
  addKey(userId: string, key: CryptoKey): Promise<boolean>;
  getValue(userId: string, slot: string): Promise<string | null>;
  putValue(userId: string, slot: string, value: string): Promise<void>;
  /** Insert-only: false when the slot already holds a value (it is kept). */
  addValue(userId: string, slot: string, value: string): Promise<boolean>;
  deleteValue(userId: string, slot: string): Promise<void>;
  /** Deletes the slot's value only if it is exactly `value`, read and deleted in one step: false when it differs or is gone. */
  deleteValueIf(userId: string, slot: string, value: string): Promise<boolean>;
  listSlots(userId: string): Promise<string[]>;
  /** Every value of this account, and its key. */
  deleteAccount(userId: string): Promise<void>;
}

/** not_found = nothing saved for that slot; damaged = a value is there but doesn't open here (only Clear helps). */
export type DeviceRevealError = "not_found" | "damaged" | "unavailable" | "bad_input";
/** bad_input = not a portal slot, or a password that is empty, over PASSWORD_MAX or not well-formed text. */
export type DeviceSaveError = "bad_input" | "unavailable" | "failed";

/** The device store of one browser, for any account in it. Each call names the account; none of them throws. */
export type DevicePasswords = {
  /**
   * False when this browser has no storage at all (no IndexedDB): then nothing can ever have been saved here. True
   * otherwise, even while the storage fails ("unavailable" from a call then means "couldn't read", not "nothing here").
   */
  present: boolean;
  /** The account's saved slots on this device, or "unavailable" when this browser can't keep passwords. */
  slots(userId: string): Promise<string[] | "unavailable">;
  reveal(userId: string, slot: string): Promise<{ password: string } | { error: DeviceRevealError }>;
  /** Saves (or replaces) one password, then reads it back: null only when the stored value opens to this password. */
  save(userId: string, slot: string, password: string): Promise<DeviceSaveError | null>;
  /**
   * Insert-only save: never replaces a value. null = the slot now holds this password (just stored and read back, or
   * it already did); "occupied" = it holds a different password, or one that doesn't open here (kept as it is).
   */
  add(userId: string, slot: string, password: string): Promise<DeviceSaveError | "occupied" | null>;
  /** Deletes one password (null also when there was none, or this browser has no storage at all). */
  remove(userId: string, slot: string): Promise<"unavailable" | null>;
  /**
   * Deletes one password only while it is still `password` (compared and deleted in one storage step, so a newer value
   * saved by another tab meanwhile stays). null = deleted, or nothing there; "changed" = it holds something else now.
   */
  removeIfSame(userId: string, slot: string, password: string): Promise<"changed" | "unavailable" | null>;
  /** Deletes every password of the account on this device, and its key (null when this browser has no storage at all). */
  removeAll(userId: string): Promise<"unavailable" | null>;
};

export const DEVICE_VALUE_PREFIX = "d1.";
const VALUE = /^d1\.([A-Za-z0-9_-]+)$/;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const MIN_BODY = IV_BYTES + TAG_BYTES + 1; // iv, tag, at least one byte of password
// Account ids are UUIDs; anything with a "|" could blur the additional data, so it is refused.
const USER_ID = /^[A-Za-z0-9-]{1,64}$/;

type Bytes = Uint8Array<ArrayBuffer>;

// Read at call time, not import time: the module must load even where crypto.subtle is missing (an insecure page).
const subtle = () => globalThis.crypto.subtle;
const alloc = (n: number): Bytes => new Uint8Array(new ArrayBuffer(n));
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);
function copy(b: Uint8Array): Bytes {
  const out = alloc(b.length);
  out.set(b);
  return out;
}

const additionalData = (userId: string, slot: string): Bytes => utf8(`device|user:${userId}|slot:${slot}`);

const isUserId = (v: unknown): v is string => typeof v === "string" && USER_ID.test(v);
const isPassword = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= PASSWORD_MAX && isWellFormed(v);

// What the storage handed back as a key is only used when it is an AES-GCM secret key.
const isAesKey = (k: unknown): k is CryptoKey =>
  !!k && typeof k === "object" && (k as CryptoKey).type === "secret" && (k as CryptoKey).algorithm?.name === "AES-GCM";

/** A new account key: AES-256-GCM, non-extractable, for encrypt and decrypt only. */
export function newDeviceKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

/** One password as "d1.<base64url(iv | ciphertext + tag)>", bound to this account and slot. Throws on bad input. */
export async function sealDevice(key: CryptoKey, userId: string, slot: string, password: string): Promise<string> {
  if (!isUserId(userId) || !isPortalSlot(slot) || !isPassword(password)) throw new Error("seal_input_invalid");
  const iv = globalThis.crypto.getRandomValues(alloc(IV_BYTES));
  const plain = utf8(password);
  try {
    const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: additionalData(userId, slot) }, key, plain));
    const body = alloc(IV_BYTES + sealed.length);
    body.set(iv);
    body.set(sealed, IV_BYTES);
    return `${DEVICE_VALUE_PREFIX}${b64u(body)}`;
  } finally {
    plain.fill(0);
  }
}

/** The password, or null for anything that doesn't open: another key, account or slot, a changed value, not a d1 value. */
export async function openDevice(key: CryptoKey, userId: string, slot: string, value: unknown): Promise<string | null> {
  if (typeof value !== "string" || !isUserId(userId)) return null;
  const m = VALUE.exec(value);
  const body = m ? fromB64u(m[1]) : null;
  if (!body || body.length < MIN_BODY) return null;
  let plain: Bytes | null = null;
  try {
    const iv = copy(body.subarray(0, IV_BYTES));
    const data = copy(body.subarray(IV_BYTES));
    plain = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: additionalData(userId, slot) }, key, data));
    // ignoreBOM keeps a leading U+FEFF that is part of the password; fatal refuses bytes that are not UTF-8.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(plain);
  } catch {
    return null;
  } finally {
    plain?.fill(0);
  }
}

// A storage call that failed in any way (threw, rejected, or there is no storage at all).
const FAIL: unique symbol = Symbol("unavailable");
type Fail = typeof FAIL;
async function guard<T>(f: () => Promise<T>): Promise<T | Fail> {
  try {
    return await f();
  } catch {
    return FAIL;
  }
}

/** The device store over `storage`; with null (no IndexedDB in this browser) every call reports "unavailable". */
export function devicePasswords(storage: DeviceStorage | null): DevicePasswords {
  const call = <T>(f: (s: DeviceStorage) => Promise<T>): Promise<T | Fail> => (storage ? guard(() => f(storage)) : Promise.resolve(FAIL));

  // The account's key; with `create`, made and stored first when there is none. Whatever ends up stored is the key: two
  // tabs (or two saves) making one at once both read back the one that was stored first, so no value is sealed under a
  // key that isn't kept. null = no usable key (only without `create`).
  async function keyFor(userId: string, create: boolean): Promise<CryptoKey | null | Fail> {
    const have = await call((s) => s.getKey(userId));
    if (have === FAIL) return FAIL;
    if (have !== null) return isAesKey(have) ? have : create ? FAIL : null;
    if (!create) return null;
    const made = await guard(() => newDeviceKey()); // no WebCrypto here: this browser can't keep passwords
    if (made === FAIL) return FAIL;
    if ((await call((s) => s.addKey(userId, made))) === FAIL) return FAIL;
    const stored = await call((s) => s.getKey(userId));
    return stored !== FAIL && isAesKey(stored) ? stored : FAIL;
  }

  // Sealed, and opened again before it may be stored.
  async function sealChecked(key: CryptoKey, userId: string, slot: string, password: string): Promise<string | null> {
    try {
      const sealed = await sealDevice(key, userId, slot, password);
      return (await openDevice(key, userId, slot, sealed)) === password ? sealed : null;
    } catch {
      return null;
    }
  }

  async function reveal(userId: string, slot: string): Promise<{ password: string } | { error: DeviceRevealError }> {
    if (!isUserId(userId) || !isPortalSlot(slot)) return { error: "bad_input" };
    const value = await call((s) => s.getValue(userId, slot));
    if (value === FAIL) return { error: "unavailable" };
    if (value === null || value === undefined) return { error: "not_found" };
    const key = await keyFor(userId, false);
    if (key === FAIL) return { error: "unavailable" };
    const password = key === null ? null : await openDevice(key, userId, slot, value);
    return password === null ? { error: "damaged" } : { password };
  }

  // Whether the slot's stored value is this password: "none" when nothing is stored.
  async function compare(userId: string, slot: string, password: string): Promise<"same" | "different" | "none" | Fail> {
    const r = await reveal(userId, slot);
    if ("password" in r) return r.password === password ? "same" : "different";
    if (r.error === "not_found") return "none";
    return r.error === "damaged" ? "different" : FAIL;
  }

  return {
    present: storage !== null,

    async slots(userId) {
      if (!isUserId(userId)) return "unavailable";
      const listed = await call((s) => s.listSlots(userId));
      if (listed === FAIL || !Array.isArray(listed)) return "unavailable";
      return [...new Set(listed.filter(isPortalSlot))];
    },

    reveal,

    async save(userId, slot, password) {
      if (!isUserId(userId) || !isPortalSlot(slot) || !isPassword(password)) return "bad_input";
      const key = await keyFor(userId, true);
      if (key === FAIL || key === null) return "unavailable";
      const sealed = await sealChecked(key, userId, slot, password);
      if (sealed === null) return "failed";
      if ((await call((s) => s.putValue(userId, slot, sealed))) === FAIL) return "unavailable";
      const back = await call((s) => s.getValue(userId, slot));
      if (back === FAIL) return "unavailable";
      return back === sealed ? null : "failed";
    },

    async add(userId, slot, password) {
      if (!isUserId(userId) || !isPortalSlot(slot) || !isPassword(password)) return "bad_input";
      const before = await compare(userId, slot, password);
      if (before === FAIL) return "unavailable";
      if (before !== "none") return before === "same" ? null : "occupied";
      const key = await keyFor(userId, true);
      if (key === FAIL || key === null) return "unavailable";
      const sealed = await sealChecked(key, userId, slot, password);
      if (sealed === null) return "failed";
      const added = await call((s) => s.addValue(userId, slot, sealed));
      if (added === FAIL) return "unavailable";
      // Stored by us, or by someone else in between: either way the read-back decides.
      const after = await compare(userId, slot, password);
      if (after === FAIL) return "unavailable";
      return after === "same" ? null : after === "different" ? "occupied" : "failed";
    },

    async remove(userId, slot) {
      // Nothing like that can have been saved, and nothing at all without storage.
      if (!storage || !isUserId(userId) || !isPortalSlot(slot)) return null;
      return (await call((s) => s.deleteValue(userId, slot))) === FAIL ? "unavailable" : null;
    },

    async removeIfSame(userId, slot, password) {
      if (!storage || !isUserId(userId) || !isPortalSlot(slot)) return null;
      const value = await call((s) => s.getValue(userId, slot));
      if (value === FAIL) return "unavailable";
      if (value === null || value === undefined) return null;
      const key = await keyFor(userId, false);
      if (key === FAIL) return "unavailable";
      if (key === null || (await openDevice(key, userId, slot, value)) !== password) return "changed";
      // The stored string decides inside one storage step: a value saved after the read above is not deleted.
      const deleted = await call((s) => s.deleteValueIf(userId, slot, value));
      if (deleted === FAIL) return "unavailable";
      return deleted ? null : "changed";
    },

    async removeAll(userId) {
      if (!storage || !isUserId(userId)) return null;
      return (await call((s) => s.deleteAccount(userId))) === FAIL ? "unavailable" : null;
    },
  };
}
