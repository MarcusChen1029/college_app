import { consentUrl, NONCE_COOKIE, pkceChallenge, randomToken, signState, STATE_TTL_MS } from "@/lib/google-docs";
import { bearerUser, fail, googleConfig, redirectUri } from "@/lib/google-server";

// POST /api/google/start (Authorization: Bearer <Supabase access token>) → { url } of Google's consent page.
// The encrypted state carries the user and PKCE verifier to the callback; a matching httpOnly nonce cookie
// ties the flow to this browser, so nobody can send a victim through a flow bound to someone else's account.
export async function POST(req: Request) {
  const cfg = googleConfig();
  if (!cfg) return fail("not_configured", 501);
  const userId = await bearerUser(req, cfg);
  if (!userId) return fail("unauthorized", 401);

  const nonce = randomToken(16);
  const verifier = randomToken();
  const state = signState(cfg.key, { userId, nonce, verifier, exp: Date.now() + STATE_TTL_MS });
  const redirect = redirectUri(req.url);
  const url = consentUrl({ clientId: cfg.clientId, redirectUri: redirect, state, challenge: pkceChallenge(verifier) });

  const secure = redirect.startsWith("https:") ? "; Secure" : "";
  const res = Response.json({ url });
  res.headers.append("Set-Cookie", `${NONCE_COOKIE}=${nonce}; Path=/api/google; Max-Age=${STATE_TTL_MS / 1000}; HttpOnly; SameSite=Lax${secure}`);
  res.headers.set("Cache-Control", "no-store");
  return res;
}
