import { bearerToken } from "@/lib/portal-vault";
import { handleVault } from "@/lib/portal-vault-handler";
import { vaultConfig, vaultDeps } from "@/lib/portal-vault-server";

// POST /api/portal-passwords (Authorization: Bearer <the website's Supabase access token>), JSON body { action, ... }:
//   list                       -> { slots }                     which slots hold a password (never the values)
//   reveal { slot }            -> { password }                  404 not_found, 409 unreadable
//   set { slot, password }     -> { ok }                        password <= 512 chars; "" deletes; 409 too_many
//   delete { slot }            -> { ok }
//   import { entries }         -> { imported, kept, failed }    <= 300 { slot, password }; failed = slots not safely stored
//   migrate                    -> { migrated, kept, failed }    moves this student's plaintext passwords (counts only)
// AI-connection tokens (they carry client_id) get 403 whatever they ask; a deployment whose key isn't the store's
// gets 503 key_mismatch / key_unclaimed for everything (lib/portal-vault-handler.ts). Other methods get 405 from Next.
// Every reply is no-store and has no CORS headers; error bodies are codes only; nothing here is logged.

const MAX_BODY = 256 * 1024;

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const cfg = vaultConfig();
  if (!cfg) return reply({ configured: false }, 503);
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply({ error: "too_large" }, 413);
  const text = await req.text().catch(() => null);
  if (text === null) return reply({ error: "bad_request" }, 400);
  if (text.length > MAX_BODY) return reply({ error: "too_large" }, 413);
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null; // handleVault answers 400 after the token checks
  }
  const r = await handleVault(bearerToken(req.headers.get("authorization")), body, vaultDeps(cfg));
  return reply(r.body, r.status);
}
