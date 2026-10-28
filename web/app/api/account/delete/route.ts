import { accountConfig, DELETE_CONFIRMATION, deleteAccount, websiteUser } from "@/lib/account-server";

// POST /api/account/delete { confirm: "DELETE" } (Authorization: Bearer <the website's Supabase access token>) -> { ok }.
// Connected AI apps' tokens are refused. Bearer auth only (no cookies), so another site can't trigger it.

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const cfg = accountConfig();
  if (!cfg) return reply({ error: "not_configured" }, 503);
  const userId = await websiteUser(cfg, req.headers.get("authorization"));
  if (!userId) return reply({ error: "unauthorized" }, 401);
  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null;
  if (body?.confirm !== DELETE_CONFIRMATION) return reply({ error: "confirm" }, 400);
  try {
    return (await deleteAccount(cfg, userId)) ? reply({ ok: true }) : reply({ error: "server_error" }, 500);
  } catch {
    return reply({ error: "server_error" }, 500);
  }
}
