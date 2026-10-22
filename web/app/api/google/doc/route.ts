import { cleanDocName, docUrl } from "@/lib/google-docs";
import { bearerUser, createGoogleDoc, deleteToken, fail, googleConfig, loadToken, refreshAccess } from "@/lib/google-server";

// POST /api/google/doc { title } (Authorization: Bearer <Supabase access token>) → { url } of a new Google Doc
// in the student's own Drive. Error codes the Essays page handles: not_configured, unauthorized,
// not_connected / reconnect (send the student through Connect again), google_error, server_error.
export async function POST(req: Request) {
  const cfg = googleConfig();
  if (!cfg) return fail("not_configured", 501);
  const userId = await bearerUser(req, cfg);
  if (!userId) return fail("unauthorized", 401);
  const body = (await req.json().catch(() => ({}))) as { title?: unknown };

  try {
    const refreshToken = await loadToken(cfg, userId);
    if (!refreshToken) return fail("not_connected", 409);

    const minted = await refreshAccess(cfg, refreshToken);
    if (!minted.ok || !minted.body.access_token) {
      // Revoked in the Google account, expired, or the client changed: the stored token is dead.
      if (minted.body.error === "invalid_grant") {
        await deleteToken(cfg, userId);
        return fail("reconnect", 409);
      }
      return fail("google_error", 502);
    }

    const file = await createGoogleDoc(minted.body.access_token, cleanDocName(body.title));
    const url = file && docUrl(file);
    return url ? Response.json({ url }) : fail("google_error", 502);
  } catch {
    return fail("server_error", 500);
  }
}
