import { createHmac, hkdfSync } from "node:crypto";
import { parseKey, seal, unseal } from "./google-docs.ts";

// The OLD server-side sealing of saved portal passwords ("v1." values in portal_passwords, migration 0040) and the
// token check that keeps AI connections away from the password route. Since the browser-locked vault (migration 0045,
// "e1." values, lib/vault-*.ts) this file only serves the temporary `handover` of old v1 rows (portal-vault-server.ts),
// which re-locks them into the student's vault. It will be removed after the handover (keep tokenSource/bearerToken
// when you do: the vault route still uses them). Pure (node:crypto only, no Supabase). Never log a password or a sealed value.

/** Prefix of every sealed value. A future format gets a new prefix (and HKDF info), so old rows keep opening. */
export const VAULT_VERSION = "v1";
const PREFIX = `${VAULT_VERSION}.`;
// Its own HKDF info string: a Google refresh token or OAuth state sealed under the same master key can't pass as a password.
const INFO = "college-tracker portal-password v1";

/**
 * The master key: PORTAL_ENCRYPTION_KEY when set, else GOOGLE_TOKEN_ENCRYPTION_KEY (so production needs no new
 * variable). Both are base64 for exactly 32 bytes. A set-but-invalid PORTAL_ENCRYPTION_KEY counts as missing rather
 * than falling back to the other key. Pick one and keep it: passwords sealed under one key don't open under the other.
 */
export function vaultKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const own = env.PORTAL_ENCRYPTION_KEY;
  if (own !== undefined && own.trim() !== "") return parseKey(own);
  return parseKey(env.GOOGLE_TOKEN_ENCRYPTION_KEY);
}

const subkey = (master: Buffer) => Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), INFO, 32));

/**
 * A short public fingerprint of the key (16 base64url characters, an HMAC of a fixed label under the subkey; it reveals
 * nothing about the key). Stored once in portal_vault_meta (migration 0040) and inside every sealed value, so a
 * deployment running another key refuses to act, and a row sealed under another key is recognised as foreign.
 */
export function vaultKeyId(master: Buffer): string {
  return createHmac("sha256", subkey(master)).update("college-tracker portal-vault key-id").digest("base64url").slice(0, 16);
}

/** Associated data: a ciphertext copied onto another user's row, or into another slot, won't open. */
export const vaultAad = (userId: string, slot: string) => `user:${userId}|slot:${slot}`;

/** "v1.<key id>." + base64url(IV | tag | AES-256-GCM ciphertext); a fresh IV every time. */
export function sealPassword(master: Buffer, userId: string, slot: string, password: string): string {
  return `${PREFIX}${vaultKeyId(master)}.${seal(subkey(master), password, vaultAad(userId, slot))}`;
}

/** The key id a sealed value names, or null when it isn't in the "v1.<key id>.<body>" form. */
export function sealedKeyId(sealed: string): string | null {
  if (typeof sealed !== "string" || !sealed.startsWith(PREFIX)) return null;
  const rest = sealed.slice(PREFIX.length);
  const dot = rest.indexOf(".");
  return dot > 0 ? rest.slice(0, dot) : null;
}

/** True when the value was sealed under this key (whether or not it then opens). */
export const sealedWithKey = (master: Buffer, sealed: string) => sealedKeyId(sealed) === vaultKeyId(master);

/**
 * The password, or null when it can't be opened: sealed under another key (another key id), wrong user or slot,
 * tampered, garbled, or an unknown version.
 */
export function openPassword(master: Buffer, userId: string, slot: string, sealed: string): string | null {
  if (!sealedWithKey(master, sealed)) return null;
  return unseal(subkey(master), sealed.slice(PREFIX.length + vaultKeyId(master).length + 1), vaultAad(userId, slot));
}

/**
 * What a deployment may do, given the key id stored in portal_vault_meta (null: no row yet), its own key id, and
 * whether it may claim the store (production only). "claim": insert its own id, then decide again on what was stored.
 * Anything but "ok" means every vault action answers 503 and touches nothing.
 */
export function keyDecision(stored: string | null, mine: string, mayClaim: boolean): "ok" | "claim" | "mismatch" | "unclaimed" {
  if (stored === null) return mayClaim ? "claim" : "unclaimed";
  return stored === mine ? "ok" : "mismatch";
}

/** The token of an "Authorization: Bearer <token>" header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? "");
  return m ? m[1] : null;
}

/**
 * Who a Supabase access token was issued to, read from its payload. Tokens the OAuth server mints for an AI connection
 * (Connect AI / MCP) carry a `client_id` claim (see mcp/claims.ts); the website's own session tokens never do. Any
 * token with that claim, whatever its value, is "ai_client" and gets no access to passwords; an unreadable one is
 * "invalid". The signature and session are checked separately (auth.getUser), so editing the payload gains nothing.
 */
export function tokenSource(token: string): "website" | "ai_client" | "invalid" {
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return "invalid";
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) return "invalid";
    return Object.hasOwn(claims, "client_id") ? "ai_client" : "website";
  } catch {
    return "invalid";
  }
}
