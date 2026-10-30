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

// False when the string holds a lone surrogate, which UTF-8 encoding would silently turn into U+FFFD. String iteration
// yields a proper pair as one code point, so any surrogate it yields is unpaired. (Not String.isWellFormed: that is 2023+.)
function isWellFormed(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0xd800 && c <= 0xdfff) return false;
  }
  return true;
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
// The key-encryption key can encrypt (wrap), decrypt (re-wrap) and unwrapKey (unlock, which never sees VK as bytes).
type Derived = { kek: CryptoKey; check: Bytes };

async function split(bits: ArrayBuffer): Promise<Derived> {
  const all = new Uint8Array(bits);
  const checkBits = all.slice(32);
  try {
    const kek = await subtle().importKey("raw", all.subarray(0, 32), "AES-GCM", false, ["encrypt", "decrypt", "unwrapKey"]);
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

// VK as the key everything else uses: it cannot be exported, so nothing outside this file can ever read it back.
const importVk = (vk: Bytes): Promise<CryptoKey> => subtle().importKey("raw", vk, "AES-GCM", false, ["encrypt", "decrypt"]);

// A record this file just built has to pass the same check the server and every later read apply; failing means a bug here.
function checked(record: VaultRecord): VaultRecord {
  const parsed = parseVaultRecord(record);
  if (!parsed) throw new Error("vault_record_invalid");
  return parsed;
}

// A secret that matched its check: the validated record, the key-encryption key, and the wrapped VK it guards (not yet opened).
type Verified = { record: VaultRecord; by: By; kek: CryptoKey; wrapped: Bytes };

/**
 * The shared first half of unlock and both re-wraps: re-validate the record (the iteration floor included), derive from
 * the secret and compare the check hash. Nothing is decrypted here, so one attempt tests exactly one secret even if
 * someone planted a crafted wrapped key.
 */
async function verifySecret(input: VaultRecord, secret: Secret): Promise<Verified | "wrong" | "bad_record"> {
  // A bare string (or null) is not a secret object; `in` on it would throw an error that quotes the string.
  if (!secret || typeof secret !== "object") return "wrong";
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
  const wrapped = fromB64u(wrappedText);
  if (!wrapped || wrapped.length !== IV_BYTES + VK_BYTES + TAG_BYTES) return "bad_record";
  return { record, by, kek: derived.kek, wrapped: copy(wrapped) };
}

// The wrapped VK decrypts with the user, key id and wrapping secret as additional data, so a blob moved here does not open.
const aadOf = (userId: string, v: Verified): Bytes => wrapData(userId, v.record.key_id, v.by);

/**
 * Unlock: AES-GCM unwrapKey turns the wrapped VK straight into a non-extractable key, so the raw bytes never exist in
 * this code. Null when the blob does not authenticate (the check matched, so the row is damaged or planted).
 */
async function unwrapToKey(userId: string, v: Verified): Promise<CryptoKey | null> {
  const how = { name: "AES-GCM", iv: v.wrapped.subarray(0, IV_BYTES), additionalData: aadOf(userId, v) };
  try {
    return await subtle().unwrapKey("raw", v.wrapped.subarray(IV_BYTES), v.kek, how, "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

type Opened = { record: VaultRecord; vk: Bytes };

/**
 * The re-wraps need VK's raw bytes to encrypt them again: verify, then decrypt. Like create, the caller zeroes `vk`.
 */
async function openRaw(userId: string, input: VaultRecord, secret: Secret): Promise<Opened | "wrong" | "bad_record"> {
  const v = await verifySecret(input, secret);
  if (typeof v === "string") return v;
  try {
    const iv = v.wrapped.subarray(0, IV_BYTES);
    const vk = new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aadOf(userId, v) }, v.kek, v.wrapped.subarray(IV_BYTES)));
    return { record: v.record, vk };
  } catch {
    return "bad_record";
  }
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
 * that fails the format check (an iteration count under the floor included) or whose wrapped key will not open. VK goes
 * from the wrapped blob into a non-extractable key without ever being raw bytes here.
 */
export async function unlockVault(userId: string, record: VaultRecord, secret: Secret): Promise<CryptoKey | "wrong" | "bad_record"> {
  const verified = await verifySecret(record, secret);
  if (typeof verified === "string") return verified;
  return (await unwrapToKey(userId, verified)) ?? "bad_record";
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
  const opened = await openRaw(userId, record, secret);
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
  const opened = await openRaw(userId, record, { passphrase });
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
  // An empty password would be a value the format itself refuses to read back, and a lone surrogate would come back as U+FFFD.
  if (!isKeyId(keyId) || typeof password !== "string" || password.length === 0 || !isWellFormed(password)) throw new Error("seal_input_invalid");
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
