import "server-only";
import { createClient } from "@supabase/supabase-js";
import { googleConfig, loadToken, revokeAtGoogle } from "./google-server";
import { tokenSource } from "./portal-vault";

// Account deletion (Settings > Delete account). Deleting the auth user removes every row the student or teacher owns:
// all public tables reference auth.users with ON DELETE CASCADE (checked 2026-10-28), portal_passwords and
// google_tokens included. The service-role key is used only for that one admin call.

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

export type AccountConfig = { supabaseUrl: string; publishableKey: string; serviceKey: string };

export function accountConfig(): AccountConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return supabaseUrl && publishableKey && serviceKey ? { supabaseUrl, publishableKey, serviceKey } : null;
}

/** The website session's user id; AI-connection tokens (client_id) and signed-out sessions get null. */
export async function websiteUser(cfg: AccountConfig, authorization: string | null): Promise<string | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!m || tokenSource(m[1]) !== "website") return null;
  try {
    const { data, error } = await createClient(cfg.supabaseUrl, cfg.publishableKey, { auth: NO_SESSION }).auth.getUser(m[1]);
    return error || !data.user ? null : data.user.id;
  } catch {
    return null;
  }
}

/** Revokes the Google Docs grant (best effort), then deletes the user; the database cascade removes the rest. */
export async function deleteAccount(cfg: AccountConfig, userId: string): Promise<boolean> {
  const google = googleConfig();
  if (google) {
    const refresh = await loadToken(google, userId).catch(() => null);
    if (refresh) await revokeAtGoogle(refresh);
  }
  const admin = createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: NO_SESSION });
  const { error } = await admin.auth.admin.deleteUser(userId);
  return !error;
}

/** The phrase the student types to confirm; checked on the server too, so a stray request can't delete an account. */
export const DELETE_CONFIRMATION = "DELETE";
