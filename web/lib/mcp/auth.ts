import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicOrigin } from "mcp-handler";
import { authFromClaims } from "./claims";

function env() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see .env.example)");
  return { url, key };
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;

/** Checks the bearer token's signature (asymmetric keys, verified locally against the JWKS) and that its session still exists. */
export async function verifyToken(req: Request, bearerToken?: string) {
  if (!bearerToken) return undefined;
  try {
    const { url, key } = env();
    const auth = createClient(url, key, { auth: NO_SESSION }).auth;
    const { data, error } = await auth.getClaims(bearerToken);
    if (error || !data) return undefined;
    // getClaims only checks the signature and expiry, so a token stays valid after "Disconnect" deletes its session.
    // getUser asks Supabase, which rejects a token whose session is gone. One extra request per call.
    const user = await auth.getUser(bearerToken);
    if (user.error || !user.data.user) return undefined;
    return authFromClaims(bearerToken, data.claims as Record<string, unknown>, getPublicOrigin(req));
  } catch {
    return undefined;
  }
}

/** A client that acts as the student: their token goes in every request, so row-level security does the isolation. No service-role key. */
export function userClient(token: string) {
  const { url, key } = env();
  return createClient(url, key, { auth: NO_SESSION, global: { headers: { Authorization: `Bearer ${token}` } } });
}
