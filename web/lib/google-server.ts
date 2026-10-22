import "server-only";
import { createClient } from "@supabase/supabase-js";
import { CALLBACK_PATH, decryptToken, encryptToken, oauthOrigin, parseKey } from "./google-docs";

// Server side of "create a Google Doc for an essay". The app has no cookie sessions, so the browser sends its
// Supabase access token as a bearer. The service-role key is used only here, for the google_tokens table.
// Never log tokens or Google responses that may contain them.

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export type GoogleConfig = { clientId: string; clientSecret: string; key: Buffer; supabaseUrl: string; publishableKey: string; serviceKey: string };

/** Null when any setting is missing; the Essays page then keeps the paste-a-link flow. */
export function googleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_DOCS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DOCS_CLIENT_SECRET;
  const key = parseKey(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!clientId || !clientSecret || !key || !supabaseUrl || !publishableKey || !serviceKey) return null;
  return { clientId, clientSecret, key, supabaseUrl, publishableKey, serviceKey };
}

/** Names (never values) of the settings that keep Google Docs off, so a bad deployment can be diagnosed. */
export function missingGoogleSettings(): string[] {
  const names = [
    "GOOGLE_DOCS_CLIENT_ID",
    "GOOGLE_DOCS_CLIENT_SECRET",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
  ].filter((n) => !process.env[n]);
  const key = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!key) names.push("GOOGLE_TOKEN_ENCRYPTION_KEY");
  else if (!parseKey(key)) names.push("GOOGLE_TOKEN_ENCRYPTION_KEY (set, but not base64 of exactly 32 bytes)");
  return names;
}

export function redirectUri(requestUrl: string) {
  return `${oauthOrigin(requestUrl)}${CALLBACK_PATH}`;
}

export function fail(code: string, status: number) {
  return Response.json({ error: code }, { status });
}

/** The signed-in student's id, checked with Supabase (rejects tokens whose session was signed out). */
export async function bearerUser(req: Request, cfg: GoogleConfig): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "");
  if (!m) return null;
  try {
    const { data, error } = await createClient(cfg.supabaseUrl, cfg.publishableKey, { auth: NO_SESSION }).auth.getUser(m[1]);
    return error || !data.user ? null : data.user.id;
  } catch {
    return null;
  }
}

function admin(cfg: GoogleConfig) {
  return createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: NO_SESSION });
}

export async function hasToken(cfg: GoogleConfig, userId: string): Promise<boolean> {
  const { data, error } = await admin(cfg).from("google_tokens").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("google_tokens read failed");
  return !!data;
}

export async function saveToken(cfg: GoogleConfig, userId: string, refreshToken: string) {
  const { error } = await admin(cfg)
    .from("google_tokens")
    .upsert({ user_id: userId, refresh_token_encrypted: encryptToken(cfg.key, refreshToken, userId), created_at: new Date().toISOString() });
  if (error) throw new Error("google_tokens write failed");
}

/** Null when there's no row, or the row can't be decrypted (key rotated): treat both as "not connected". */
export async function loadToken(cfg: GoogleConfig, userId: string): Promise<string | null> {
  const { data, error } = await admin(cfg).from("google_tokens").select("refresh_token_encrypted").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("google_tokens read failed");
  return data ? decryptToken(cfg.key, data.refresh_token_encrypted as string, userId) : null;
}

export async function deleteToken(cfg: GoogleConfig, userId: string) {
  await admin(cfg).from("google_tokens").delete().eq("user_id", userId);
}

type TokenResponse = { access_token?: string; refresh_token?: string; scope?: string; error?: string };

async function tokenRequest(params: Record<string, string>): Promise<{ ok: boolean; body: TokenResponse }> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as TokenResponse;
  return { ok: res.ok, body };
}

export function exchangeCode(cfg: GoogleConfig, code: string, verifier: string, redirect: string) {
  return tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirect, client_id: cfg.clientId, client_secret: cfg.clientSecret });
}

export function refreshAccess(cfg: GoogleConfig, refreshToken: string) {
  return tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret });
}

export async function createGoogleDoc(accessToken: string, name: string): Promise<{ id?: string; webViewLink?: string } | null> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id,webViewLink", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.document" }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as { id?: string; webViewLink?: string };
}
