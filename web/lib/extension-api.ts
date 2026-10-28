"use client";

// The Chrome extension (college application filler) signs in through /extension/connect and gets a token that reads
// only the transcript and the activities and honors (migrations 0031, 0039). These are the page's helpers and typed RPC wrappers.
// The token is only ever put in the URL fragment of the extension's own address, never stored or logged.

import { browserSupabase } from "./supabase-browser.ts";

const db = () => browserSupabase();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/**
 * Where to send the browser once a token exists: `https://<extensionId>.chromiumapp.org/#token=<token>`.
 * Only that exact address is accepted (a missing redirectUri means it); anything else returns null.
 */
export function extensionRedirect(redirectUri: string | null, extensionId: string, token: string): string | null {
  if (!extensionId || !token) return null;
  const allowed = `https://${extensionId}.chromiumapp.org/`;
  const uri = redirectUri ?? allowed;
  return uri === allowed ? `${uri}#token=${token}` : null;
}

/** Where Cancel sends the browser: the same exact extension address, with no token. Null when the redirect is not allowed. */
export function extensionDenyRedirect(redirectUri: string | null, extensionId: string): string | null {
  if (!extensionId) return null;
  const allowed = `https://${extensionId}.chromiumapp.org/`;
  return (redirectUri ?? allowed) === allowed ? `${allowed}#error=access_denied` : null;
}

export type ExtensionScope = "transcript" | "activities";

/** What /extension/connect asks for: tokens made before migration 0039 hold only "transcript" and must reconnect for activities. */
export const EXTENSION_SCOPES: readonly ExtensionScope[] = ["transcript", "activities"];

/** The create_extension_token arguments (p_label only when given). */
export function extensionTokenArgs(label?: string, scopes: readonly ExtensionScope[] = EXTENSION_SCOPES): { p_label?: string; p_scopes: ExtensionScope[] } {
  return { ...(label ? { p_label: label } : {}), p_scopes: [...scopes] };
}

/** Creates a token for the signed-in student that can read `scopes` (the server requires "transcript"). The only time it exists in clear. */
export async function createExtensionToken(label?: string, scopes: readonly ExtensionScope[] = EXTENSION_SCOPES): Promise<string> {
  const res = await db().rpc("create_extension_token", extensionTokenArgs(label, scopes));
  return check(res) as string;
}

export type ExtensionToken = {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string;
  revokedAt: string | null;
};

export async function listExtensionTokens(): Promise<ExtensionToken[]> {
  const rows = check(
    await db()
      .from("extension_tokens")
      .select("id, label, created_at, last_used_at, expires_at, revoked_at")
      .order("created_at", { ascending: false }),
  ) as { id: string; label: string; created_at: string; last_used_at: string | null; expires_at: string; revoked_at: string | null }[];
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    createdAt: r.created_at,
    lastUsedAt: r.last_used_at,
    expiresAt: r.expires_at,
    revokedAt: r.revoked_at,
  }));
}

export async function revokeExtensionToken(id: string): Promise<void> {
  check(await db().rpc("revoke_extension_token", { p_id: id }));
}
