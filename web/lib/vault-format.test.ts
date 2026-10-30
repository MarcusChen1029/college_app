import assert from "node:assert/strict";
import { test } from "node:test";
import {
  b64u,
  e1Value,
  formatRecoveryCode,
  fromB64u,
  isKeyId,
  newKeyId,
  normalizeRecoveryCode,
  parseE1,
  parseVaultRecord,
  passphraseProblem,
  PBKDF2_MIN_ITERATIONS,
  RECOVERY_ALPHABET,
  RECOVERY_GROUPS,
  RECOVERY_LENGTH,
  recoveryGroup,
  type VaultRecord,
} from "./vault-format.ts";

// Predictable bytes, so a failing test prints the same thing every run.
const bytes = (n: number, seed = 1) => Uint8Array.from({ length: n }, (_, i) => (i * 7 + seed) & 255);
const KEY_ID = "AAAAAAAAAAAAAAAA";

function record(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: "e1",
    key_id: KEY_ID,
    pass_salt: b64u(bytes(16, 1)),
    pass_iterations: 600_000,
    pass_check: b64u(bytes(32, 2)),
    pass_wrapped: b64u(bytes(60, 3)),
    rec_salt: b64u(bytes(16, 4)),
    rec_check: b64u(bytes(32, 5)),
    rec_wrapped: b64u(bytes(60, 6)),
    ...over,
  };
}

test("constants", () => {
  assert.equal(PBKDF2_MIN_ITERATIONS, 600_000);
  assert.equal(RECOVERY_LENGTH, 28);
  assert.equal(RECOVERY_GROUPS, 7);
  assert.equal(RECOVERY_ALPHABET, "0123456789ABCDEFGHJKMNPQRSTVWXYZ");
});

test("b64u round trip and strict rejects", () => {
  for (let n = 0; n <= 70; n++) {
    const b = bytes(n, n + 1);
    const s = b64u(b);
    assert.match(s, /^[A-Za-z0-9_-]*$/, "URL alphabet, no padding");
    assert.deepEqual(fromB64u(s), b, `length ${n}`);
  }
  // The URL alphabet: 0xfb 0xff is "+/8=" in plain base64.
  assert.equal(b64u(Uint8Array.of(0xfb, 0xff)), "-_8");
  assert.deepEqual(fromB64u("-_8"), Uint8Array.of(0xfb, 0xff));
  // Sizes the database column checks rely on (0047): 16, 32 and 60 bytes.
  assert.equal(b64u(bytes(16)).length, 22);
  assert.equal(b64u(bytes(32)).length, 43);
  assert.equal(b64u(bytes(60)).length, 80);

  assert.equal(fromB64u("ab+c"), null, "plain-base64 plus");
  assert.equal(fromB64u("ab/c"), null, "plain-base64 slash");
  assert.equal(fromB64u("ab="), null, "padding");
  assert.equal(fromB64u("abc="), null, "padding");
  assert.equal(fromB64u("a"), null, "one leftover character cannot be a byte");
  assert.equal(fromB64u("abcde"), null, "one leftover character cannot be a byte");
  assert.equal(fromB64u("ab cd"), null, "whitespace");
  assert.equal(fromB64u("ab\ncd"), null, "newline");
  assert.equal(fromB64u("abé"), null, "non-ASCII");
});

test("key ids", () => {
  assert.ok(isKeyId(KEY_ID));
  assert.ok(isKeyId("abcXYZ019_-abcde"));
  for (const bad of ["", "short", "A".repeat(15), "A".repeat(17), "AAAAAAAAAAAAAAA+", "AAAAAAAAAAAAAAA.", "AAAAAAAAAAAAAAAé", 16, null, undefined, {}])
    assert.ok(!isKeyId(bad), String(bad));
  const a = newKeyId();
  const b = newKeyId();
  assert.ok(isKeyId(a));
  assert.equal(a.length, 16);
  assert.notEqual(a, b, "random");
});

test("e1 values: build and parse", () => {
  const body = bytes(29);
  const v = e1Value(KEY_ID, body);
  assert.equal(v, `e1.${KEY_ID}.${b64u(body)}`);
  assert.deepEqual(parseE1(v), { keyId: KEY_ID, body });
  // A real-sized value: 12 byte iv + 8 byte plaintext + 16 byte tag.
  const real = parseE1(e1Value(newKeyId(), bytes(36)));
  assert.equal(real?.body.length, 36);
});

test("e1 values: anything else is rejected", () => {
  const good = e1Value(KEY_ID, bytes(29));
  assert.notEqual(parseE1(good), null);
  for (const bad of [
    "hunter2",
    "",
    "e1.short.abc",
    "v1." + good.slice(3),
    "E1." + good.slice(3),
    "e1" + good.slice(2).replace(".", "-"),
    `e1.${KEY_ID}.${b64u(bytes(28))}`, // one byte short of iv + tag + 1
    `e1.${KEY_ID}.`,
    `e1.${KEY_ID}`,
    `e1.${KEY_ID}x.${b64u(bytes(29))}`, // 17 character key id
    `e1.${KEY_ID.slice(1)}.${b64u(bytes(29))}`, // 15 character key id
    `${good}.extra`,
    ` ${good}`,
    `${good}\n`,
    `e1.${KEY_ID}.${b64u(bytes(29))}=`,
    `e1.${KEY_ID}.${b64u(bytes(29)).replace(/.$/, "+")}`,
    null,
    undefined,
    29,
    {},
    [good],
    new String(good),
  ])
    assert.equal(parseE1(bad), null, String(bad));
});

test("vault record: a good one is accepted and copied", () => {
  const r = record();
  const parsed = parseVaultRecord(r);
  assert.deepEqual(parsed, r);
  assert.notEqual(parsed, r, "a fresh object, not the caller's");
  const typed: VaultRecord | null = parsed;
  assert.equal(typed?.version, "e1");
  // The two ends of the iteration range.
  assert.equal(parseVaultRecord(record({ pass_iterations: 600_000 }))?.pass_iterations, 600_000);
  assert.equal(parseVaultRecord(record({ pass_iterations: 10_000_000 }))?.pass_iterations, 10_000_000);
  // What comes back from JSON.parse works too.
  assert.deepEqual(parseVaultRecord(JSON.parse(JSON.stringify(r))), r);
});

test("vault record: bad iterations", () => {
  for (const bad of [599_999, 10_000_001, 0, -1, 600_000.5, NaN, Infinity, "600000", null, undefined, 1e12])
    assert.equal(parseVaultRecord(record({ pass_iterations: bad })), null, String(bad));
});

test("vault record: exact keys only", () => {
  assert.equal(parseVaultRecord(record({ extra: "x" })), null, "an extra key");
  assert.equal(parseVaultRecord(record({ user_id: "u" })), null, "an extra key");
  for (const key of Object.keys(record())) {
    const r = record();
    delete r[key];
    assert.equal(parseVaultRecord(r), null, `missing ${key}`);
  }
  for (const bad of [null, undefined, "", "e1", 5, [], [record()], true])
    assert.equal(parseVaultRecord(bad), null, String(bad));
});

test("vault record: field sizes and encodings", () => {
  assert.equal(parseVaultRecord(record({ version: "e2" })), null);
  assert.equal(parseVaultRecord(record({ version: "E1" })), null);
  assert.equal(parseVaultRecord(record({ key_id: "short" })), null);
  assert.equal(parseVaultRecord(record({ key_id: 5 })), null);
  // Salts are 16 bytes, checks 32, wrapped keys 60.
  for (const [field, size] of [["pass_salt", 16], ["rec_salt", 16], ["pass_check", 32], ["rec_check", 32], ["pass_wrapped", 60], ["rec_wrapped", 60]] as const) {
    assert.notEqual(parseVaultRecord(record({ [field]: b64u(bytes(size)) })), null, `${field} ${size}`);
    assert.equal(parseVaultRecord(record({ [field]: b64u(bytes(size - 1)) })), null, `${field} ${size - 1}`);
    assert.equal(parseVaultRecord(record({ [field]: b64u(bytes(size + 1)) })), null, `${field} ${size + 1}`);
    assert.equal(parseVaultRecord(record({ [field]: b64u(bytes(size)) + "=" })), null, `${field} padded`);
    assert.equal(parseVaultRecord(record({ [field]: bytes(size) })), null, `${field} not a string`);
    assert.equal(parseVaultRecord(record({ [field]: null })), null, `${field} null`);
  }
  assert.equal(parseVaultRecord(record({ pass_salt: b64u(bytes(15)) })), null, "a 15 byte salt");
});

test("recovery code: parsing", () => {
  const n = normalizeRecoveryCode("abcd efgh-ijkl-mnop-qrst-vwxy-z01o");
  assert.equal(n, "ABCDEFGH1JK1MN0PQRSTVWXYZ010", "I and L read as 1, O as 0");
  assert.equal(n?.length, 28);
  // Case, spaces and dashes are ignored; so is any other whitespace from a paste.
  const plain = "0123456789ABCDEFGHJKMNPQRSTV";
  assert.equal(normalizeRecoveryCode(plain), plain);
  assert.equal(normalizeRecoveryCode(plain.toLowerCase()), plain);
  assert.equal(normalizeRecoveryCode("0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV"), plain);
  assert.equal(normalizeRecoveryCode("  0123 4567 89ab\tcdef\ngh-jk-mnpq rstv  "), plain);
  assert.equal(normalizeRecoveryCode("0123–4567–89AB–CDEF–GHJK–MNPQ–RSTV"), plain, "en dashes from a word processor");
  // Every character of the alphabet is accepted on its own.
  assert.equal(normalizeRecoveryCode(RECOVERY_ALPHABET.slice(0, 28)), RECOVERY_ALPHABET.slice(0, 28));
  assert.equal(normalizeRecoveryCode(RECOVERY_ALPHABET.slice(4)), RECOVERY_ALPHABET.slice(4));
});

test("recovery code: rejects", () => {
  assert.equal(normalizeRecoveryCode("U".repeat(28)), null, "U is not in the alphabet");
  assert.equal(normalizeRecoveryCode("u".repeat(28)), null);
  assert.equal(normalizeRecoveryCode("0".repeat(27)), null, "27 characters");
  assert.equal(normalizeRecoveryCode("0".repeat(29)), null, "29 characters");
  assert.equal(normalizeRecoveryCode(""), null);
  assert.equal(normalizeRecoveryCode("-- --"), null);
  assert.equal(normalizeRecoveryCode("0".repeat(27) + "U"), null, "one bad character at the end");
  assert.equal(normalizeRecoveryCode("0".repeat(27) + "!"), null);
  assert.equal(normalizeRecoveryCode("0".repeat(27) + "_"), null);
  // Non-ASCII look-alikes must not fold into the alphabet: dotless i, long s, sharp s, full-width digits.
  assert.equal(normalizeRecoveryCode("ı".repeat(28)), null);
  assert.equal(normalizeRecoveryCode("ſ".repeat(28)), null);
  assert.equal(normalizeRecoveryCode("ß".repeat(14)), null);
  assert.equal(normalizeRecoveryCode("０".repeat(28)), null);
});

test("recovery code: display", () => {
  const code = "0123456789ABCDEFGHJKMNPQRSTV";
  const shown = formatRecoveryCode(code);
  assert.equal(shown, "0123-4567-89AB-CDEF-GHJK-MNPQ-RSTV");
  assert.equal(shown.split("-").length, RECOVERY_GROUPS);
  assert.ok(shown.split("-").every((g) => g.length === 4));
  assert.equal(normalizeRecoveryCode(shown), code, "what is shown can be typed back");
  assert.equal(recoveryGroup(code, 1), "0123");
  assert.equal(recoveryGroup(code, 5), code.slice(16, 20));
  assert.equal(recoveryGroup(code, 5), "GHJK");
  assert.equal(recoveryGroup(code, 7), "RSTV");
  for (const n of [0, -1, 8, 1.5, NaN]) assert.equal(recoveryGroup(code, n), "", String(n));
});

test("passphrase: length counts code points after NFC", () => {
  assert.equal(passphraseProblem("123456789", null), "too_short");
  assert.equal(passphraseProblem("1234567890", null), null);
  assert.equal(passphraseProblem("", null), "too_short");
  assert.equal(passphraseProblem("我的護照密碼很長很長", null), null, "10 code points");
  assert.equal(passphraseProblem("我的護照密碼很長很", null), "too_short", "9 code points");
  // An emoji is one character even though JavaScript's .length says two.
  assert.equal(passphraseProblem("😀".repeat(10), null), null);
  assert.equal(passphraseProblem("😀".repeat(5), null), "too_short");
  // "e" + a combining accent is one character after NFC, so five of them are 5, not 10.
  assert.equal(passphraseProblem("é".repeat(5), null), "too_short");
  assert.equal(passphraseProblem("é".repeat(10), null), null);
  // It is never trimmed: spaces count.
  assert.equal(passphraseProblem(" ".repeat(9) + "a", null), null);
  assert.equal(passphraseProblem(" ".repeat(10), null), null);
});

test("passphrase: not the account email", () => {
  assert.equal(passphraseProblem(" Me@X.com ", "me@x.com"), "is_email");
  assert.equal(passphraseProblem("student@example.com", "student@example.com"), "is_email");
  assert.equal(passphraseProblem("STUDENT@EXAMPLE.COM", " student@example.com "), "is_email");
  assert.equal(passphraseProblem("student@example.com", "other@example.com"), null);
  assert.equal(passphraseProblem("student@example.com", null), null, "no email to compare with");
  assert.equal(passphraseProblem("student@example.com", ""), null);
  // The email check does not change the length rule.
  assert.equal(passphraseProblem("a@b.c", "a@b.c"), "too_short");
});
