import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createVault,
  openE1,
  rewrapPassphrase,
  rewrapRecovery,
  sealE1,
  unlockVault,
  type NewVault,
  type Secret,
} from "./vault-crypto.ts";
import {
  b64u,
  formatRecoveryCode,
  fromB64u,
  isKeyId,
  newKeyId,
  normalizeRecoveryCode,
  parseE1,
  parseVaultRecord,
  PBKDF2_MIN_ITERATIONS,
  RECOVERY_ALPHABET,
  type VaultRecord,
} from "./vault-format.ts";

const USER = "11111111-2222-4333-8444-555555555555";
const OTHER_USER = "99999999-2222-4333-8444-555555555555";
const PASS = "correct horse battery staple";
const SLOT = "commonapp";

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();

// Creating a vault costs one real 600,000-round derivation, so tests that only read it share one.
let shared: Promise<NewVault> | undefined;
const sharedVault = () => (shared ??= createVault(USER, PASS));

function asKey(r: CryptoKey | string): CryptoKey {
  if (typeof r === "string") assert.fail(`expected a key, got "${r}"`);
  return r;
}

function asRecord<T extends object>(r: T | string): T {
  if (typeof r === "string") assert.fail(`expected a result, got "${r}"`);
  return r;
}

// Fresh ArrayBuffer-backed bytes from a stored base64url string.
function decode(s: string): Uint8Array<ArrayBuffer> {
  const b = fromB64u(s);
  assert.ok(b, "valid base64url");
  return b.slice();
}

// The same derivations written out again with plain WebCrypto, so the tests do not only agree with themselves.
async function handBits(secret: { passphrase: string } | { recovery: string }, saltText: string, iterations: number) {
  const salt = decode(saltText);
  if ("recovery" in secret) {
    const base = await subtle.importKey("raw", enc.encode(secret.recovery), "HKDF", false, ["deriveBits"]);
    const info = enc.encode("college-tracker vault e1 recovery");
    return new Uint8Array(await subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, base, 512));
  }
  const base = await subtle.importKey("raw", enc.encode(secret.passphrase.normalize("NFC")), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, base, 512));
}

async function handCheck(bits: Uint8Array<ArrayBuffer>): Promise<string> {
  return b64u(new Uint8Array(await subtle.digest("SHA-256", bits.slice(32))));
}

async function handUnwrap(bits: Uint8Array<ArrayBuffer>, wrapped: string, aad: string): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["decrypt"]);
  const w = decode(wrapped);
  assert.equal(w.length, 60, "12 byte IV, 32 byte key, 16 byte tag");
  const vk = await subtle.decrypt({ name: "AES-GCM", iv: w.slice(0, 12), additionalData: enc.encode(aad) }, kek, w.slice(12));
  return new Uint8Array(vk);
}

// A wrap of `vk` under the first half of `bits`, laid out as the vault stores it: IV, then ciphertext and tag.
async function handWrap(bits: Uint8Array<ArrayBuffer>, vk: Uint8Array<ArrayBuffer>, aad: string): Promise<string> {
  const kek = await subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt"]);
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(aad) }, kek, vk));
  const out = new Uint8Array(new ArrayBuffer(12 + ct.length));
  out.set(iv);
  out.set(ct, 12);
  return b64u(out);
}

const recAad = (keyId: string) => `vault:e1|user:${USER}|key:${keyId}|by:recovery`;
const passAad = (keyId: string) => `vault:e1|user:${USER}|key:${keyId}|by:passphrase`;

test("round trip: create, unlock with the passphrase, seal and open", async () => {
  const v = await sharedVault();
  assert.ok(parseVaultRecord(v.record), "the record passes the format check");
  assert.ok(isKeyId(v.record.key_id));
  assert.equal(v.record.pass_iterations, PBKDF2_MIN_ITERATIONS);
  assert.match(v.recoveryCode, new RegExp(`^[${RECOVERY_ALPHABET}]{28}$`));
  assert.equal(normalizeRecoveryCode(v.recoveryCode), v.recoveryCode, "the plain code normalizes to itself");

  // The key is the vault key but can never be exported.
  assert.equal(v.key.extractable, false);
  assert.equal(v.key.algorithm.name, "AES-GCM");
  assert.deepEqual([...v.key.usages].sort(), ["decrypt", "encrypt"]);
  await assert.rejects(subtle.exportKey("raw", v.key));

  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "p@ss w0rd ✓");
  assert.equal(parseE1(sealed)?.keyId, v.record.key_id);
  assert.equal(await openE1(v.key, v.record.key_id, USER, SLOT, sealed), "p@ss w0rd ✓");

  // The key a later unlock returns opens what the creating key sealed, and the other way round.
  const unlocked = asKey(await unlockVault(USER, v.record, { passphrase: PASS }));
  assert.equal(unlocked.extractable, false);
  assert.equal(unlocked.algorithm.name, "AES-GCM");
  assert.equal((unlocked.algorithm as AesKeyAlgorithm).length, 256);
  assert.deepEqual([...unlocked.usages].sort(), ["decrypt", "encrypt"], "unwrapKey is not a usage of the vault key");
  assert.equal(await openE1(unlocked, v.record.key_id, USER, SLOT, sealed), "p@ss w0rd ✓");
  const sealed2 = await sealE1(unlocked, v.record.key_id, USER, SLOT, "second");
  assert.equal(await openE1(v.key, v.record.key_id, USER, SLOT, sealed2), "second");

  // A fresh random IV every time.
  assert.notEqual(await sealE1(v.key, v.record.key_id, USER, SLOT, "same"), await sealE1(v.key, v.record.key_id, USER, SLOT, "same"));
});

test("passwords of any shape come back exactly", async () => {
  const v = await sharedVault();
  const samples = ["﻿starts with a byte order mark", "密碼 🔐 ünï", "x".repeat(512), "  spaces kept  ", "a"];
  for (const pw of samples) {
    const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, pw);
    assert.equal(await openE1(v.key, v.record.key_id, USER, SLOT, sealed), pw);
  }
});

test("sealE1 refuses what could never be opened again, without echoing the password", async () => {
  const v = await sharedVault();
  // An empty password is shorter than the smallest value the format accepts.
  await assert.rejects(sealE1(v.key, v.record.key_id, USER, SLOT, ""));
  await assert.rejects(sealE1(v.key, "not a key id", USER, SLOT, "hunter2-secret"), (e: Error) => !e.message.includes("hunter2-secret"));
});

test("sealE1 refuses a lone surrogate, which would silently come back as U+FFFD", async () => {
  const v = await sharedVault();
  for (const pw of ["ab\uD800cd", "\uDC00", "tail\uD83D", "swapped\uDE00\uD83D"]) {
    await assert.rejects(sealE1(v.key, v.record.key_id, USER, SLOT, pw), { message: "seal_input_invalid" }, JSON.stringify(pw));
  }
  // A proper pair (one emoji) is fine and comes back exactly.
  const ok = "pair 🔐 ok";
  assert.equal(await openE1(v.key, v.record.key_id, USER, SLOT, await sealE1(v.key, v.record.key_id, USER, SLOT, ok)), ok);
});

test("a secret that is not an object is \"wrong\" and never throws", async () => {
  const v = await sharedVault();
  // A bare string used to reach `"recovery" in secret`, whose TypeError message quotes the string.
  for (const secret of ["hunter2-secret-string", "", null, undefined, 42]) {
    const s = secret as unknown as Secret;
    assert.equal(await unlockVault(USER, v.record, s), "wrong", `unlock with ${JSON.stringify(secret)}`);
    assert.equal(await rewrapPassphrase(USER, v.record, s, "a new passphrase"), "wrong", `rewrap with ${JSON.stringify(secret)}`);
  }
  // Objects of the wrong shape.
  for (const secret of [{}, { passphrase: 5 }, { recovery: 5 }, { passphrase: null }]) {
    assert.equal(await unlockVault(USER, v.record, secret as unknown as Secret), "wrong", JSON.stringify(secret));
  }
});

test("wrong passphrase is \"wrong\", and the passphrase is never trimmed", async () => {
  const v = await sharedVault();
  assert.equal(await unlockVault(USER, v.record, { passphrase: "not the passphrase" }), "wrong");
  assert.equal(await unlockVault(USER, v.record, { passphrase: `${PASS} ` }), "wrong");
  assert.equal(await unlockVault(USER, v.record, { passphrase: "" }), "wrong");
});

test("recovery code unlocks, however it was typed", async () => {
  const v = await sharedVault();
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "from the first key");
  const code = v.recoveryCode;
  const shown = formatRecoveryCode(code);
  const typed = [code, shown, shown.toLowerCase(), shown.toLowerCase().replaceAll("-", " "), ` ${code.slice(0, 14)}  ${code.slice(14)} `];
  for (const recovery of typed) {
    const key = asKey(await unlockVault(USER, v.record, { recovery }));
    assert.equal(await openE1(key, v.record.key_id, USER, SLOT, sealed), "from the first key");
  }
  // A well-formed code that is not this vault's, and things that are not codes at all.
  assert.equal(await unlockVault(USER, v.record, { recovery: "0".repeat(28) }), "wrong");
  assert.equal(await unlockVault(USER, v.record, { recovery: code.slice(1) }), "wrong");
  assert.equal(await unlockVault(USER, v.record, { recovery: "" }), "wrong");
  assert.equal(await unlockVault(USER, v.record, { recovery: PASS }), "wrong");
});

test("rewrapPassphrase with the recovery code: the new passphrase unlocks, the old one does not", async () => {
  const v = await sharedVault();
  const before = JSON.stringify(v.record);
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "keeps working");
  const NEW = "a brand new passphrase ✓";

  const r = asRecord(await rewrapPassphrase(USER, v.record, { recovery: v.recoveryCode }, NEW));
  assert.ok(parseVaultRecord(r));
  assert.equal(JSON.stringify(v.record), before, "the old record is not modified");
  assert.equal(r.key_id, v.record.key_id, "same vault key id");
  assert.equal(r.rec_salt, v.record.rec_salt);
  assert.equal(r.rec_check, v.record.rec_check);
  assert.equal(r.rec_wrapped, v.record.rec_wrapped, "the recovery wrap is left alone");
  assert.notEqual(r.pass_salt, v.record.pass_salt, "a new salt");
  assert.notEqual(r.pass_check, v.record.pass_check);
  assert.notEqual(r.pass_wrapped, v.record.pass_wrapped);
  assert.equal(r.pass_iterations, PBKDF2_MIN_ITERATIONS);

  const key = asKey(await unlockVault(USER, r, { passphrase: NEW }));
  assert.equal(await openE1(key, r.key_id, USER, SLOT, sealed), "keeps working", "still the same vault key");
  assert.equal(await unlockVault(USER, r, { passphrase: PASS }), "wrong", "the old passphrase no longer works");
  asKey(await unlockVault(USER, r, { recovery: v.recoveryCode })); // the code still works
});

test("rewrapPassphrase with the current passphrase, and with a wrong secret", async () => {
  const v = await sharedVault();
  const NEW = "yet another passphrase";
  const r = asRecord(await rewrapPassphrase(USER, v.record, { passphrase: PASS }, NEW));
  asKey(await unlockVault(USER, r, { passphrase: NEW }));
  assert.equal(await rewrapPassphrase(USER, v.record, { passphrase: "nope nope nope" }, NEW), "wrong");
  assert.equal(await rewrapPassphrase(USER, v.record, { recovery: "0".repeat(28) }, NEW), "wrong");
  await assert.rejects(rewrapPassphrase(USER, v.record, { passphrase: PASS }, ""));
});

test("rewrapPassphrase never lowers the iteration count", async () => {
  const v = await sharedVault();
  // A vault whose passphrase wrap uses more rounds than the floor, built by hand from the real vault key.
  const vk = await handUnwrap(await handBits({ recovery: v.recoveryCode }, v.record.rec_salt, 0), v.record.rec_wrapped, recAad(v.record.key_id));
  const iterations = 650_000;
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const bits = await handBits({ passphrase: PASS }, b64u(salt), iterations);
  const pass_wrapped = await handWrap(bits, vk, passAad(v.record.key_id));
  const high: VaultRecord = { ...v.record, pass_salt: b64u(salt), pass_iterations: iterations, pass_check: await handCheck(bits), pass_wrapped };

  asKey(await unlockVault(USER, high, { passphrase: PASS })); // the hand-built record is valid
  const r = asRecord(await rewrapPassphrase(USER, high, { passphrase: PASS }, "the next passphrase"));
  assert.equal(r.pass_iterations, iterations);
  asKey(await unlockVault(USER, r, { passphrase: "the next passphrase" }));
});

test("rewrapRecovery invalidates the old code", async () => {
  const v = await sharedVault();
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "survives a new code");

  const out = asRecord(await rewrapRecovery(USER, v.record, PASS));
  const { record: r, recoveryCode } = out;
  assert.ok(parseVaultRecord(r));
  assert.match(recoveryCode, new RegExp(`^[${RECOVERY_ALPHABET}]{28}$`));
  assert.notEqual(recoveryCode, v.recoveryCode);
  assert.equal(r.key_id, v.record.key_id);
  assert.equal(r.pass_salt, v.record.pass_salt);
  assert.equal(r.pass_iterations, v.record.pass_iterations);
  assert.equal(r.pass_check, v.record.pass_check);
  assert.equal(r.pass_wrapped, v.record.pass_wrapped, "the passphrase wrap is left alone");
  assert.notEqual(r.rec_salt, v.record.rec_salt);
  assert.notEqual(r.rec_check, v.record.rec_check);
  assert.notEqual(r.rec_wrapped, v.record.rec_wrapped);

  assert.equal(await unlockVault(USER, r, { recovery: v.recoveryCode }), "wrong", "the old code is dead");
  const key = asKey(await unlockVault(USER, r, { recovery: recoveryCode }));
  assert.equal(await openE1(key, r.key_id, USER, SLOT, sealed), "survives a new code");
  asKey(await unlockVault(USER, r, { passphrase: PASS })); // the passphrase is unchanged

  assert.equal(await rewrapRecovery(USER, v.record, "not the passphrase"), "wrong");
});

test("moved ciphertext fails: another slot, user, key id, key, or a tampered value", async () => {
  const v = await sharedVault();
  const other = await createVault(USER, "some other passphrase");
  const keyId = v.record.key_id;
  const sealed = await sealE1(v.key, keyId, USER, SLOT, "secret-pw");
  assert.equal(await openE1(v.key, keyId, USER, SLOT, sealed), "secret-pw");

  assert.equal(await openE1(v.key, keyId, USER, "uc", sealed), null, "another slot");
  assert.equal(await openE1(v.key, keyId, OTHER_USER, SLOT, sealed), null, "another user");
  const otherId = newKeyId();
  assert.equal(await openE1(v.key, otherId, USER, SLOT, sealed), null, "the value names a different key id");
  // The same bytes relabelled with another key id fail on the additional data, not just on the label.
  const relabelled = sealed.replace(`e1.${keyId}.`, `e1.${otherId}.`);
  assert.notEqual(relabelled, sealed);
  assert.equal(await openE1(v.key, otherId, USER, SLOT, relabelled), null, "relabelled to another key id");
  assert.equal(await openE1(other.key, keyId, USER, SLOT, sealed), null, "another vault's key");

  // One changed character in the middle of the body (the very last one may only touch spare bits), and a cut-off tail.
  const i = sealed.length - 12;
  const flipped = sealed.slice(0, i) + (sealed[i] === "A" ? "B" : "A") + sealed.slice(i + 1);
  assert.equal(await openE1(v.key, keyId, USER, SLOT, flipped), null, "tampered");
  assert.equal(await openE1(v.key, keyId, USER, SLOT, sealed.slice(0, -4)), null, "truncated");
  for (const junk of ["", "hunter2", "v1.abc", `e1.${keyId}.`, `e1.${keyId}.AAAA`]) {
    assert.equal(await openE1(v.key, keyId, USER, SLOT, junk), null, `not a sealed value: "${junk}"`);
  }
});

test("NFD passphrase unlocks a vault made with the NFC form", async () => {
  const nfc = "Café-密碼-123".normalize("NFC");
  const nfd = nfc.normalize("NFD");
  assert.notEqual(nfc, nfd, "the two spellings differ in code points");
  const v = await createVault(USER, nfc);
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "composed");
  const key = asKey(await unlockVault(USER, v.record, { passphrase: nfd }));
  assert.equal(await openE1(key, v.record.key_id, USER, SLOT, sealed), "composed");
  asKey(await unlockVault(USER, v.record, { passphrase: nfc }));
});

test("planted wrapped key never unlocks", async () => {
  const a = await sharedVault();
  const otherPass = "another long passphrase 2";
  const b = await createVault(USER, otherPass);

  // Another vault's wrapped keys dropped into this record: its own check still matches, but the blob does not open.
  const planted: VaultRecord = { ...a.record, pass_wrapped: b.record.pass_wrapped, rec_wrapped: b.record.rec_wrapped };
  assert.equal(await unlockVault(USER, planted, { passphrase: PASS }), "bad_record");
  assert.equal(await unlockVault(USER, planted, { recovery: a.recoveryCode }), "bad_record");
  // The other vault's secrets are not tested against its blob either: this record's check hashes come first.
  assert.equal(await unlockVault(USER, planted, { passphrase: otherPass }), "wrong");
  assert.equal(await unlockVault(USER, planted, { recovery: b.recoveryCode }), "wrong");

  // A wrap moved to the other field of the same vault names the wrong secret in its additional data.
  const crossed: VaultRecord = { ...a.record, pass_wrapped: a.record.rec_wrapped };
  assert.equal(await unlockVault(USER, crossed, { passphrase: PASS }), "bad_record");

  // The same record read as another account, or under another key id.
  assert.equal(await unlockVault(OTHER_USER, a.record, { recovery: a.recoveryCode }), "bad_record");
  assert.equal(await unlockVault(USER, { ...a.record, key_id: newKeyId() }, { recovery: a.recoveryCode }), "bad_record");
});

test("the check is compared before the wrapped key is opened", async () => {
  const a = await sharedVault();
  const x = "a different passphrase, X";
  // This record's own salt and check, but a wrapped key that is a perfectly valid wrap of a random vault key under the key
  // derived from X, with the real additional data. A build that opened the blob before comparing the check would accept X.
  const bitsX = await handBits({ passphrase: x }, a.record.pass_salt, a.record.pass_iterations);
  const randomVk = globalThis.crypto.getRandomValues(new Uint8Array(new ArrayBuffer(32)));
  const planted: VaultRecord = { ...a.record, pass_wrapped: await handWrap(bitsX, randomVk, passAad(a.record.key_id)) };
  assert.deepEqual(await handUnwrap(bitsX, planted.pass_wrapped, passAad(a.record.key_id)), randomVk, "the planted blob opens under X's key");

  assert.equal(await unlockVault(USER, planted, { passphrase: x }), "wrong");
  assert.equal(await rewrapPassphrase(USER, planted, { passphrase: x }, "some new passphrase"), "wrong");
  assert.equal(await rewrapRecovery(USER, planted, x), "wrong");
});

test("unlock never holds the vault key as raw bytes: the wrapped key goes straight into a non-extractable key", async () => {
  const v = await sharedVault();
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, "spy target");
  const { decrypt, unwrapKey } = subtle;
  let decrypts = 0;
  let unwraps = 0;
  subtle.decrypt = (...args: Parameters<typeof decrypt>) => {
    decrypts++;
    return decrypt.apply(subtle, args);
  };
  subtle.unwrapKey = (...args: Parameters<typeof unwrapKey>) => {
    unwraps++;
    return unwrapKey.apply(subtle, args);
  };
  try {
    const key = asKey(await unlockVault(USER, v.record, { recovery: v.recoveryCode }));
    assert.equal(decrypts, 0, "no decrypt of the wrapped key to bytes");
    assert.equal(unwraps, 1, "one unwrapKey into a key object");
    // The spy is live: opening a password is a decrypt, and the unlocked key does it.
    assert.equal(await openE1(key, v.record.key_id, USER, SLOT, sealed), "spy target");
    assert.equal(decrypts, 1);
  } finally {
    subtle.decrypt = decrypt;
    subtle.unwrapKey = unwrapKey;
  }
});

test("iterations below the floor, and records that are not records, are bad_record", async () => {
  const v = await sharedVault();
  const low: VaultRecord = { ...v.record, pass_iterations: PBKDF2_MIN_ITERATIONS - 1 };
  assert.equal(await unlockVault(USER, low, { passphrase: PASS }), "bad_record");
  assert.equal(await unlockVault(USER, low, { recovery: v.recoveryCode }), "bad_record", "the whole record is refused");
  assert.equal(await rewrapPassphrase(USER, low, { passphrase: PASS }, "a new passphrase"), "bad_record");
  assert.equal(await rewrapRecovery(USER, low, PASS), "bad_record");
  for (const junk of [null, {}, { ...v.record, version: "e2" }, { ...v.record, rec_salt: "short" }, "text"]) {
    assert.equal(await unlockVault(USER, junk as unknown as VaultRecord, { recovery: v.recoveryCode }), "bad_record");
  }
});

test("the stored layout matches an independent derivation", async () => {
  const v = await sharedVault();
  const r = v.record;
  const sealed = await sealE1(v.key, r.key_id, USER, SLOT, "layout-check");

  // Recovery: HKDF-SHA-256 with the fixed info string; the second half hashes to the stored check.
  const recBits = await handBits({ recovery: v.recoveryCode }, r.rec_salt, 0);
  assert.equal(await handCheck(recBits), r.rec_check);
  const vkFromRecovery = await handUnwrap(recBits, r.rec_wrapped, recAad(r.key_id));
  assert.equal(vkFromRecovery.length, 32);

  // Passphrase: PBKDF2-HMAC-SHA-256, 600,000 rounds, and it wraps the very same vault key.
  const passBits = await handBits({ passphrase: PASS }, r.pass_salt, r.pass_iterations);
  assert.equal(await handCheck(passBits), r.pass_check);
  assert.deepEqual(await handUnwrap(passBits, r.pass_wrapped, passAad(r.key_id)), vkFromRecovery);

  // A password: IV, then ciphertext and tag, with the user, key id and slot as additional data.
  const vk = await subtle.importKey("raw", vkFromRecovery, "AES-GCM", false, ["decrypt"]);
  const parts = parseE1(sealed);
  assert.ok(parts);
  const body = parts.body.slice();
  assert.equal(body.length, 12 + "layout-check".length + 16);
  const aad = enc.encode(`pw:e1|user:${USER}|key:${r.key_id}|slot:${SLOT}`);
  const plain = await subtle.decrypt({ name: "AES-GCM", iv: body.slice(0, 12), additionalData: aad }, vk, body.slice(12));
  assert.equal(new TextDecoder().decode(plain), "layout-check");
});

test("record bytes carry no plaintext", async () => {
  const v = await sharedVault();
  const password = "Sup3r-Secret-Portal-Pw!";
  const sealed = await sealE1(v.key, v.record.key_id, USER, SLOT, password);
  const everything = JSON.stringify(v.record) + sealed;
  const secrets = [PASS, password, v.recoveryCode, formatRecoveryCode(v.recoveryCode), v.recoveryCode.toLowerCase(), b64u(enc.encode(password)), b64u(enc.encode(PASS))];
  for (const s of secrets) assert.ok(!everything.includes(s), "a secret leaked into the stored text");
});
