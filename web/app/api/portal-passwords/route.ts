import { bearerToken } from "@/lib/portal-vault";
import { handleVault } from "@/lib/portal-vault-handler";
import { vaultConfig, vaultDeps } from "@/lib/portal-vault-server";

// POST /api/portal-passwords (Authorization: Bearer <the website's Supabase access token>), JSON body { action, ... }.
// Passwords are sealed in the student's browser ("e1.<key id>.<...>", lib/vault-format.ts); the server stores and
// returns those strings and can't open them. `expected` = an updated_at string from an earlier reply, sent back as is.
//   vault                             -> { vault: record + updated_at | null }
//   vault_create { record }           -> { ok }                409 exists | orphans
//   vault_update { record, expected } -> { ok, updated_at }    404 no_vault, 409 changed | wrong_vault (new wrappers, same key id)
//   list                              -> { slots: [{ slot, kind: e1 | v1 | other, updated_at }] }   never the values
//   get { slot }                      -> { sealed }            404 not_found
//   set { slot, sealed, expected? }   -> { ok }                404 no_vault, 409 wrong_vault | changed | too_many
//   delete { slot }                   -> { ok }
//   import { entries }                -> { imported, failed }  <= 300 { slot, sealed }, insert only; failed = slots not stored
//   handover { slot }                 -> { password, updated_at }   opens an old server-sealed v1 row once so the browser
//                                        can lock it again; 404 not_found, 409 not_legacy | unreadable,
//                                        503 key_mismatch | key_unclaimed | no_key (this deployment's key isn't the store's)
//   reset                             -> { ok }                "start over": deletes the vault and every stored password
// A sealed value that isn't e1 (a bare password included) is 400 bad_value. AI-connection tokens (they carry client_id)
// get 403 whatever they ask (lib/portal-vault-handler.ts). 503 { configured: false } = a Supabase setting is missing.
// Other methods get 405 from Next. Every reply is no-store and has no CORS headers; error bodies are codes only;
// nothing here is logged.

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
