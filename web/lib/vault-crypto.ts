// The cryptography of the browser-locked portal vault: keys from the vault passphrase or the recovery code, the vault key
// (VK) wrapped under each, and every saved portal password sealed under VK. Pure WebCrypto through
// globalThis.crypto.subtle (no node:crypto, no React, no Supabase), so the browser and the Node tests run the same code.
// The shapes of what it stores live in vault-format.ts. Nothing here logs, and no thrown error carries a secret.

import {
  b64u,
  e1Value,
  fromB64u,
  isKeyId,
  newKeyId,
  normalizeRecoveryCode,
  parseE1,
  parseVaultRecord,
  PBKDF2_MIN_ITERATIONS,
  RECOVERY_ALPHABET,
  RECOVERY_LENGTH,
  type VaultRecord,
} from "./vault-format.ts";

/** What a student types to open the vault: the passphrase, or the recovery code (any spelling the format accepts). */
export type Secret = { passphrase: string } | { recovery: string };

/** A vault just made: the record to store, the recovery code to show once (28 plain characters), and VK ready to use. */
export type NewVault = { record: VaultRecord; recoveryCode: string; key: CryptoKey };

const HKDF_INFO = "college-tracker vault e1 recovery";
const IV_BYTES = 12;
const SALT_BYTES = 16;
const VK_BYTES = 32;
const TAG_BYTES = 16;

type Bytes = Uint8Array<ArrayBuffer>;
type By = "passphrase" | "recovery";

// Read at call time, not import time: the module must load even where crypto.subtle is missing (an insecure page).
const subtle = () => globalThis.crypto.subtle;

// TypeScript types a plain Uint8Array as backed by any ArrayBufferLike, which subtle's parameters refuse; these always
// hand out ArrayBuffer-backed bytes.
const alloc = (n: number): Bytes => new Uint8Array(new ArrayBuffer(n));
const random = (n: number): Bytes => globalThis.crypto.getRandomValues(alloc(n));
const utf8 = (s: string): Bytes => new TextEncoder().encode(s);

function copy(b: Uint8Array): Bytes {
  const out = alloc(b.length);
  out.set(b);
  return out;
}

// Compared as bytes, never as text: fromB64u accepts several spellings of the same bytes.
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// Additional data: a wrap names the user, the vault key id and which secret wrapped it; a password also names its slot.
const wrapData = (userId: string, keyId: string, by: By): Bytes => utf8(`vault:e1|user:${userId}|key:${keyId}|by:${by}`);
const passwordData = (userId: string, keyId: string, slot: string): Bytes => utf8(`pw:e1|user:${userId}|key:${keyId}|slot:${slot}`);

/** 28 characters, each one random byte's low five bits (uniform: 256 is a multiple of 32). */
function newRecoveryCode(): string {
  const r = random(RECOVERY_LENGTH);
  let code = "";
  for (const b of r) code += RECOVERY_ALPHABET[b & 31];
  r.fill(0);
  return code;
}

// 512 derived bits are a 256-bit key-encryption key followed by a 256-bit check; only the SHA-256 of the check is stored.
type Derived = { kek: CryptoKey; check: Bytes };

async function split(bits: ArrayBuffer): Promise<Derived> {
  const all = new Uint8Array(bits);
  const checkBits = all.slice(32);
  try {
    const kek = await subtle().importKey("raw", all.subarray(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
    return { kek, check: new Uint8Array(await subtle().digest("SHA-256", checkBits)) };
  } finally {
    all.fill(0);
    checkBits.fill(0);
  }
}

async function fromPassphrase(passphrase: string, salt: Bytes, iterations: number): Promise<Derived> {
  const raw = utf8(passphrase.normalize("NFC")); // never trimmed
  try {
    const base = await subtle().importKey("raw", raw, "PBKDF2", false, ["deriveBits"]);
    return await split(await subtle().deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 512));
  } finally {
    raw.fill(0);
  }
}

async function fromRecovery(code: string, salt: Bytes): Promise<Derived> {
  const raw = utf8(code); // the 28 plain characters, no dashes
  try {
    const base = await subtle().importKey("raw", raw, "HKDF", false, ["deriveBits"]);
    return await split(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt, info: utf8(HKDF_INFO) }, base, 512));
  } finally {
    raw.fill(0);
  }
}

/** IV, then VK encrypted: 12 + 32 + 16 = 60 bytes, as base64url. */
async function wrap(vk: Bytes, kek: CryptoKey, additionalData: Bytes): Promise<string> {
  const iv = random(IV_BYTES);
  const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData }, kek, vk));
  const out = alloc(IV_BYTES + sealed.length);
  out.set(iv);
  out.set(sealed, IV_BYTES);
  return b64u(out);
}

/** VK's 32 raw bytes, or null when the blob has the wrong size or does not authenticate. */
async function unwrap(wrapped: string, kek: CryptoKey, additionalData: Bytes): Promise<Bytes | null> {
  const w = fromB64u(wrapped);
  if (!w || w.length !== IV_BYTES + VK_BYTES + TAG_BYTES) return null;
  try {
    const iv = copy(w.subarray(0, IV_BYTES));
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData }, kek, copy(w.subarray(IV_BYTES))));
  } catch {
    return null;
  }
}

// VK as the key everything else uses: it cannot be exported, so nothing outside this file can ever read it back.
const importVk = (vk: Bytes): Promise<CryptoKey> => subtle().importKey("raw", vk, "AES-GCM", false, ["encrypt", "decrypt"]);

// A record this file just built has to pass the same check the server and every later read apply; failing means a bug here.
function checked(record: VaultRecord): VaultRecord {
  const parsed = parseVaultRecord(record);
  if (!parsed) throw new Error("vault_record_invalid");
  return parsed;
}

type Opened = { record: VaultRecord; vk: Bytes };

/**
 * The shared first half of unlock and both re-wraps: re-validate the record (the iteration floor included), derive from
 * the secret, compare the check hash, and only then decrypt the wrapped VK, so one attempt tests exactly one secret even
 * if someone planted a crafted wrapped key. The caller zeroes `vk`.
 */
async function openVk(userId: string, input: VaultRecord, secret: Secret): Promise<Opened | "wrong" | "bad_record"> {
  const record = parseVaultRecord(input);
  if (!record) return "bad_record";

  let by: By;
  let checkText: string;
  let wrappedText: string;
  let derived: Derived;
  if ("recovery" in secret) {
    const code = typeof secret.recovery === "string" ? normalizeRecoveryCode(secret.recovery) : null;
    if (!code) return "wrong";
    const salt = fromB64u(record.rec_salt);
    if (!salt) return "bad_record";
    by = "recovery";
    checkText = record.rec_check;
    wrappedText = record.rec_wrapped;
    derived = await fromRecovery(code, copy(salt));
  } else {
    if (typeof secret.passphrase !== "string" || secret.passphrase.length === 0) return "wrong";
    const salt = fromB64u(record.pass_salt);
    if (!salt) return "bad_record";
    by = "passphrase";
    checkText = record.pass_check;
    wrappedText = record.pass_wrapped;
    derived = await fromPassphrase(secret.passphrase, copy(salt), record.pass_iterations);
  }

  const stored = fromB64u(checkText);
  if (!stored || !sameBytes(derived.check, stored)) return "wrong";
  const vk = await unwrap(wrappedText, derived.kek, wrapData(userId, record.key_id, by));
  return vk ? { record, vk } : "bad_record"; // the check matched but the blob did not open: the row is damaged or planted
}

/**
 * A brand-new vault for this account: a random VK and key id, wrapped once under the passphrase (600,000 PBKDF2 rounds)
 * and once under a fresh recovery code. Throws on an empty passphrase; every other rule about passphrases is the caller's.
 */
export async function createVault(userId: string, passphrase: string): Promise<NewVault> {
  if (typeof passphrase !== "string" || passphrase.length === 0) throw new Error("passphrase_empty");
  const vk = random(VK_BYTES);
  try {
    const keyId = newKeyId();
    const recoveryCode = newRecoveryCode();
    const passSalt = random(SALT_BYTES);
    const recSalt = random(SALT_BYTES);
    const pass = await fromPassphrase(passphrase, passSalt, PBKDF2_MIN_ITERATIONS);
    const rec = await fromRecovery(recoveryCode, recSalt);
    const record = checked({
      version: "e1",
      key_id: keyId,
      pass_salt: b64u(passSalt),
      pass_iterations: PBKDF2_MIN_ITERATIONS,
      pass_check: b64u(pass.check),
      pass_wrapped: await wrap(vk, pass.kek, wrapData(userId, keyId, "passphrase")),
      rec_salt: b64u(recSalt),
      rec_check: b64u(rec.check),
      rec_wrapped: await wrap(vk, rec.kek, wrapData(userId, keyId, "recovery")),
    });
    return { record, recoveryCode, key: await importVk(vk) };
  } finally {
    vk.fill(0);
  }
}

/**
 * Open the vault with the passphrase or the recovery code. "wrong" is a secret that does not match; "bad_record" is a row
 * that fails the format check (an iteration count under the floor included) or whose wrapped key will not open.
 */
export async function unlockVault(userId: string, record: VaultRecord, secret: Secret): Promise<CryptoKey | "wrong" | "bad_record"> {
  const opened = await openVk(userId, record, secret);
  if (typeof opened === "string") return opened;
  try {
    return await importVk(opened.vk);
  } finally {
    opened.vk.fill(0);
  }
}

/**
 * The same vault under a new passphrase: same key id and recovery wrap, a new salt, never fewer iterations than the
 * record had or than the floor. The student proves they hold a secret (the old passphrase, or the recovery code) first.
 */
export async function rewrapPassphrase(
  userId: string,
  record: VaultRecord,
  secret: Secret,
  newPassphrase: string,
): Promise<VaultRecord | "wrong" | "bad_record"> {
  if (typeof newPassphrase !== "string" || newPassphrase.length === 0) throw new Error("passphrase_empty");
  const opened = await openVk(userId, record, secret);
  if (typeof opened === "string") return opened;
  const { record: current, vk } = opened;
  try {
    const salt = random(SALT_BYTES);
    const iterations = Math.max(current.pass_iterations, PBKDF2_MIN_ITERATIONS);
    const pass = await fromPassphrase(newPassphrase, salt, iterations);
    return checked({
      ...current,
      pass_salt: b64u(salt),
      pass_iterations: iterations,
      pass_check: b64u(pass.check),
      pass_wrapped: await wrap(vk, pass.kek, wrapData(userId, current.key_id, "passphrase")),
    });
  } finally {
    vk.fill(0);
  }
}

/** A new recovery code for the same vault (the old one stops working once this record is stored); needs the passphrase. */
export async function rewrapRecovery(
  userId: string,
  record: VaultRecord,
  passphrase: string,
): Promise<{ record: VaultRecord; recoveryCode: string } | "wrong" | "bad_record"> {
  const opened = await openVk(userId, record, { passphrase });
  if (typeof opened === "string") return opened;
  const { record: current, vk } = opened;
  try {
    const recoveryCode = newRecoveryCode();
    const salt = random(SALT_BYTES);
    const rec = await fromRecovery(recoveryCode, salt);
    const next = checked({
      ...current,
      rec_salt: b64u(salt),
      rec_check: b64u(rec.check),
      rec_wrapped: await wrap(vk, rec.kek, wrapData(userId, current.key_id, "recovery")),
    });
    return { record: next, recoveryCode };
  } finally {
    vk.fill(0);
  }
}

/** One password as "e1.<key id>.<base64url of iv, ciphertext and tag>", bound to this user, vault key id and slot. */
export async function sealE1(key: CryptoKey, keyId: string, userId: string, slot: string, password: string): Promise<string> {
  // An empty password would be a value the format itself refuses to read back.
  if (!isKeyId(keyId) || typeof password !== "string" || password.length === 0) throw new Error("seal_input_invalid");
  const iv = random(IV_BYTES);
  const plain = utf8(password);
  try {
    const sealed = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: passwordData(userId, keyId, slot) }, key, plain));
    const body = alloc(IV_BYTES + sealed.length);
    body.set(iv);
    body.set(sealed, IV_BYTES);
    return e1Value(keyId, body);
  } finally {
    plain.fill(0);
  }
}

/** The password, or null for anything that does not open: another key id, key, user or slot, a changed value, not an e1 value. */
export async function openE1(key: CryptoKey, keyId: string, userId: string, slot: string, sealed: string): Promise<string | null> {
  const parts = parseE1(sealed);
  if (!parts || parts.keyId !== keyId) return null;
  let plain: Bytes | null = null;
  try {
    const iv = copy(parts.body.subarray(0, IV_BYTES));
    const data = copy(parts.body.subarray(IV_BYTES));
    plain = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: passwordData(userId, keyId, slot) }, key, data));
    // ignoreBOM keeps a leading U+FEFF that is part of the password; fatal refuses bytes that are not UTF-8.
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(plain);
  } catch {
    return null;
  } finally {
    plain?.fill(0);
  }
}
