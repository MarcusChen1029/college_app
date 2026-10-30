// The shapes of everything the browser-locked portal vault stores or shows: the sealed password value, the vault
// record (salts, checks, wrapped keys), the recovery code and the passphrase rules. Pure (no React, no Supabase, no
// node:crypto): the server imports it to check what it stores, the browser imports it to build and read those values.
// The key derivation and sealing themselves live in vault-crypto.ts.

export const PBKDF2_MIN_ITERATIONS = 600_000;
const PBKDF2_MAX_ITERATIONS = 10_000_000;
export const RECOVERY_LENGTH = 28; // characters, without dashes
export const RECOVERY_GROUPS = 7; // shown as 7 groups of 4
export const PASSPHRASE_MIN = 10; // characters, counted as code points

/** Crockford base32: no I, L, O or U, so a code read off paper has fewer wrong guesses. */
export const RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const B64U = /^[A-Za-z0-9_-]*$/;
const KEY_ID = /^[A-Za-z0-9_-]{16}$/;
const E1_VALUE = /^e1\.([A-Za-z0-9_-]{16})\.([A-Za-z0-9_-]*)$/;
const E1_MIN_BODY = 12 + 16 + 1; // iv, then the tag, then at least one byte of password

/** Bytes to unpadded base64url. */
export function b64u(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Unpadded base64url back to bytes; null for anything outside the alphabet (padding, spaces, "+", "/"). */
export function fromB64u(s: string): Uint8Array | null {
  if (typeof s !== "string" || !B64U.test(s) || s.length % 4 === 1) return null;
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A key id names one vault key, so an old sealed value is never read with a newer key. */
export function isKeyId(v: unknown): v is string {
  return typeof v === "string" && KEY_ID.test(v);
}

/** A fresh random key id: 12 random bytes as 16 characters. */
export function newKeyId(): string {
  return b64u(globalThis.crypto.getRandomValues(new Uint8Array(12)));
}

export type E1Parts = { keyId: string; body: Uint8Array };

/** A sealed password is "e1.<key id>.<base64url of iv, ciphertext and tag>". Null for anything else, a bare password included. */
export function parseE1(sealed: unknown): E1Parts | null {
  if (typeof sealed !== "string") return null;
  const m = E1_VALUE.exec(sealed);
  if (!m) return null;
  const body = fromB64u(m[2]);
  return body && body.length >= E1_MIN_BODY ? { keyId: m[1], body } : null;
}

export function e1Value(keyId: string, body: Uint8Array): string {
  return `e1.${keyId}.${b64u(body)}`;
}

/** One row of the vault table, as the browser sends it and the server stores it (lengths match migration 0047). */
export type VaultRecord = {
  version: "e1";
  key_id: string;
  pass_salt: string; // 16 bytes
  pass_iterations: number;
  pass_check: string; // 32 bytes
  pass_wrapped: string; // 60 bytes: iv, the wrapped vault key, tag
  rec_salt: string; // 16 bytes
  rec_check: string; // 32 bytes
  rec_wrapped: string; // 60 bytes
};

const RECORD_KEYS = ["version", "key_id", "pass_salt", "pass_iterations", "pass_check", "pass_wrapped", "rec_salt", "rec_check", "rec_wrapped"];

// The string itself when it is base64url of exactly `size` bytes.
function sized(v: unknown, size: number): string | null {
  return typeof v === "string" && fromB64u(v)?.length === size ? v : null;
}

/** The record with exactly these keys, each the right kind and size; a fresh object, or null. */
export function parseVaultRecord(v: unknown): VaultRecord | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const keys = Object.keys(v);
  if (keys.length !== RECORD_KEYS.length || !RECORD_KEYS.every((k) => Object.hasOwn(v, k))) return null;
  const r = v as Record<string, unknown>;
  const pass_iterations = r.pass_iterations;
  if (r.version !== "e1" || !isKeyId(r.key_id)) return null;
  if (typeof pass_iterations !== "number" || !Number.isInteger(pass_iterations)) return null;
  if (pass_iterations < PBKDF2_MIN_ITERATIONS || pass_iterations > PBKDF2_MAX_ITERATIONS) return null;
  const pass_salt = sized(r.pass_salt, 16);
  const pass_check = sized(r.pass_check, 32);
  const pass_wrapped = sized(r.pass_wrapped, 60);
  const rec_salt = sized(r.rec_salt, 16);
  const rec_check = sized(r.rec_check, 32);
  const rec_wrapped = sized(r.rec_wrapped, 60);
  if (!pass_salt || !pass_check || !pass_wrapped || !rec_salt || !rec_check || !rec_wrapped) return null;
  return { version: "e1", key_id: r.key_id, pass_salt, pass_iterations, pass_check, pass_wrapped, rec_salt, rec_check, rec_wrapped };
}

const RECOVERY_CODE = new RegExp(`^[${RECOVERY_ALPHABET}]{${RECOVERY_LENGTH}}$`);

/**
 * A typed or pasted recovery code as its 28 plain characters, or null. Case, whitespace and dashes are ignored; I and L
 * read as 1 and O as 0 (the alphabet has none of them). Only ASCII letters are upper-cased, so look-alikes such as a
 * dotless i never fold into the alphabet.
 */
export function normalizeRecoveryCode(input: string): string | null {
  const code = input
    .replace(/[\s\-‐-―−]/g, "") // spaces, hyphens, and the dashes a word processor swaps in
    .replace(/[a-z]/g, (c) => c.toUpperCase())
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
  return RECOVERY_CODE.test(code) ? code : null;
}

/** The code as shown to the student: groups of four joined by dashes. */
export function formatRecoveryCode(code: string): string {
  const groups: string[] = [];
  for (let i = 0; i < code.length; i += 4) groups.push(code.slice(i, i + 4));
  return groups.join("-");
}

/** One group of the code, 1-based (the "type groups 2, 5 and 7 back" check); empty for a group that does not exist. */
export function recoveryGroup(code: string, n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > RECOVERY_GROUPS) return "";
  return code.slice((n - 1) * 4, n * 4);
}

/**
 * Why a passphrase is not allowed, or null. At least 10 characters, counted as code points after NFC (so an emoji or an
 * accented letter is one), and not the account's own email. The passphrase is never trimmed; only the email
 * comparison ignores case and surrounding spaces.
 */
export function passphraseProblem(passphrase: string, email: string | null): "too_short" | "is_email" | null {
  const p = passphrase.normalize("NFC");
  if ([...p].length < PASSPHRASE_MIN) return "too_short";
  const e = email?.normalize("NFC").trim().toLowerCase();
  if (e && p.trim().toLowerCase() === e) return "is_email";
  return null;
}
