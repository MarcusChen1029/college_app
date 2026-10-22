import { timingSafeEqual } from "node:crypto";
import { hasDriveScope, NONCE_COOKIE, oauthOrigin, verifyState } from "@/lib/google-docs";
import { exchangeCode, googleConfig, redirectUri, saveToken } from "@/lib/google-server";

// GET /api/google/callback: Google sends the browser here after consent. No bearer token on a redirect, so the
// user comes from the encrypted state, checked against the nonce cookie set by /api/google/start.
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Back to the Essays page either way; the nonce cookie is single-use.
  const back = (result: "connected" | "error") =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${oauthOrigin(req.url)}/application/essays?google=${result}`,
        "Set-Cookie": `${NONCE_COOKIE}=; Path=/api/google; Max-Age=0; HttpOnly; SameSite=Lax`,
        "Cache-Control": "no-store",
      },
    });

  const cfg = googleConfig();
  const code = url.searchParams.get("code");
  const rawState = url.searchParams.get("state");
  if (!cfg || !code || !rawState) return back("error");

  const state = verifyState(cfg.key, rawState);
  const cookie = new RegExp(`(?:^|;\\s*)${NONCE_COOKIE}=([^;]+)`).exec(req.headers.get("cookie") ?? "")?.[1] ?? "";
  if (!state || !sameString(cookie, state.nonce)) return back("error");

  try {
    const { ok, body } = await exchangeCode(cfg, code, state.verifier, redirectUri(req.url));
    if (!ok || !body.refresh_token || !hasDriveScope(body.scope)) return back("error");
    await saveToken(cfg, state.userId, body.refresh_token);
    return back("connected");
  } catch {
    return back("error");
  }
}

function sameString(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
