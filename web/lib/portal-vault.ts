import { hkdfSync } from "node:crypto";
import { parseKey, seal, unseal } from "./google-docs.ts";

// Encryption for saved portal passwords (table portal_passwords, migration 0040) and the token check that keeps AI
// connections away from them. Pure (node:crypto only, no Supabase), so the server (portal-vault-server.ts), its tests
// and scripts/backfill-portal-passwords.mjs all share one format. Never log a password or a sealed value.

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

/** Associated data: a ciphertext copied onto another user's row, or into another slot, won't open. */
export const vaultAad = (userId: string, slot: string) => `user:${userId}|slot:${slot}`;

/** "v1." + base64url(IV | tag | AES-256-GCM ciphertext); a fresh IV every time. */
export function sealPassword(master: Buffer, userId: string, slot: string, password: string): string {
  return PREFIX + seal(subkey(master), password, vaultAad(userId, slot));
}

/** The password, or null when it can't be opened (wrong user, slot or key; tampered; garbled; unknown version). */
export function openPassword(master: Buffer, userId: string, slot: string, sealed: string): string | null {
  if (typeof sealed !== "string" || !sealed.startsWith(PREFIX)) return null;
  return unseal(subkey(master), sealed.slice(PREFIX.length), vaultAad(userId, slot));
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
