import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from "node:crypto";

// Pure helpers for "create a Google Doc for an essay": key handling, AES-256-GCM sealing of refresh tokens
// and OAuth state, PKCE and the consent URL. Uses node:crypto, so server code only (see google-server.ts).

export const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const PRODUCTION_ORIGIN = "https://www.track-ur-college.com";
const DEV_ORIGIN = "http://localhost:3000";
export const STATE_TTL_MS = 10 * 60 * 1000;
export const CALLBACK_PATH = "/api/google/callback";
/** httpOnly cookie holding the state's nonce, so the callback only completes in the browser that started it. */
export const NONCE_COOKIE = "gdocs_oauth";

/** GOOGLE_TOKEN_ENCRYPTION_KEY is base64 for exactly 32 bytes; anything else counts as unset. */
export function parseKey(b64: string | undefined): Buffer | null {
  if (!b64) return null;
  const key = Buffer.from(b64.trim(), "base64");
  return key.length === 32 ? key : null;
}

// One env key, separate subkeys per purpose, so a sealed state can never be replayed as a token or vice versa.
function derive(master: Buffer, purpose: string) {
  return Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), `college-tracker google-docs ${purpose}`, 32));
}

const IV = 12;
const TAG = 16;

// AES-256-GCM: base64url(12-byte IV | 16-byte tag | ciphertext). Also used by portal-vault.ts, with its own subkey.
export function seal(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(IV);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** Null for anything that isn't a ciphertext of this key and AAD (wrong key, wrong AAD, tampered, garbled). */
export function unseal(key: Buffer, sealed: string, aad: string): string | null {
  try {
    const buf = Buffer.from(sealed, "base64url");
    if (buf.length <= IV + TAG) return null;
    const d = createDecipheriv("aes-256-gcm", key, buf.subarray(0, IV));
    d.setAAD(Buffer.from(aad, "utf8"));
    d.setAuthTag(buf.subarray(IV, IV + TAG));
    return Buffer.concat([d.update(buf.subarray(IV + TAG)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** The user id is bound in as associated data, so a ciphertext copied onto another user's row won't decrypt. */
export function encryptToken(master: Buffer, token: string, userId: string): string {
  return seal(derive(master, "refresh-token"), token, `user:${userId}`);
}

export function decryptToken(master: Buffer, sealed: string, userId: string): string | null {
  return unseal(derive(master, "refresh-token"), sealed, `user:${userId}`);
}

export type OAuthState = { userId: string; nonce: string; verifier: string; exp: number };

/** The callback is a plain redirect with no bearer token, so the state carries the user. It is encrypted
 *  (not just signed) because it also carries the PKCE verifier, and the state is visible in URLs. */
export function signState(master: Buffer, state: OAuthState): string {
  return seal(derive(master, "oauth-state"), JSON.stringify(state), "oauth-state");
}

export function verifyState(master: Buffer, raw: string, now = Date.now()): OAuthState | null {
  const json = unseal(derive(master, "oauth-state"), raw, "oauth-state");
  if (!json) return null;
  try {
    const s = JSON.parse(json) as Partial<OAuthState>;
    if (typeof s.userId !== "string" || typeof s.nonce !== "string" || typeof s.verifier !== "string" || typeof s.exp !== "number") return null;
    return s.exp > now ? (s as OAuthState) : null;
  } catch {
    return null;
  }
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** RFC 7636 S256: base64url(sha256(verifier)). A 32-byte random verifier encodes to 43 characters. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** The redirect URI must match a registered one exactly, so only the two registered origins are ever used. */
export function oauthOrigin(requestUrl: string): string {
  const origin = new URL(requestUrl).origin;
  return origin === DEV_ORIGIN ? DEV_ORIGIN : PRODUCTION_ORIGIN;
}

export function consentUrl(p: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.search = new URLSearchParams({
    client_id: p.clientId,
    redirect_uri: p.redirectUri,
    response_type: "code",
    scope: DRIVE_FILE_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: p.state,
    code_challenge: p.challenge,
    code_challenge_method: "S256",
  }).toString();
  return u.toString();
}

/** With granular consent the student can untick Drive access; then there's nothing to store. */
export function hasDriveScope(scope: string | undefined): boolean {
  return (scope ?? "").split(/\s+/).includes(DRIVE_FILE_SCOPE);
}

/** Google Doc names: trimmed, single-line, at most 200 characters. */
export function cleanDocName(title: unknown): string {
  const t = typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  return (t || "Essay").slice(0, 200);
}

export function docUrl(file: { id?: string; webViewLink?: string }): string | null {
  if (file.webViewLink && /^https:\/\//.test(file.webViewLink)) return file.webViewLink;
  return file.id ? `https://docs.google.com/document/d/${encodeURIComponent(file.id)}/edit` : null;
}
