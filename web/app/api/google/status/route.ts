import { bearerUser, googleConfig, hasToken, missingGoogleSettings } from "@/lib/google-server";

// POST /api/google/status (Authorization: Bearer <Supabase access token>) → { configured, connected }.
// Unconfigured deployments answer { configured: false } to anyone, so the Essays page keeps its paste-a-link flow.
export async function POST(req: Request) {
  const cfg = googleConfig();
  // Which server secrets are unset is setup help, not something to tell anonymous callers in production.
  if (!cfg) return Response.json({ configured: false, connected: false, ...(process.env.NODE_ENV !== "production" && { missing: missingGoogleSettings() }) });
  const userId = await bearerUser(req, cfg);
  if (!userId) return Response.json({ configured: true, connected: false }, { status: 401 });
  try {
    return Response.json({ configured: true, connected: await hasToken(cfg, userId) });
  } catch {
    return Response.json({ configured: true, connected: false, error: "server_error" }, { status: 500 });
  }
}
