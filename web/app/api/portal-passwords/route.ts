import { parseVaultRequest } from "@/lib/portal-slots";
import { bearerToken, tokenSource } from "@/lib/portal-vault";
import { deletePassword, importPasswords, listSlots, migratePlaintext, revealPassword, setPassword, vaultConfig, verifiedUser } from "@/lib/portal-vault-server";

// POST /api/portal-passwords (Authorization: Bearer <the website's Supabase access token>), JSON body { action, ... }:
//   list                       -> { slots }                     which slots hold a password (never the values)
//   reveal { slot }            -> { password }                  404 not_found, 409 unreadable
//   set { slot, password }     -> { ok }                        password <= 512 chars; "" deletes; 409 too_many
//   delete { slot }            -> { ok }
//   import { entries }         -> { imported, kept, failed }    <= 300 { slot, password }; failed = slots not safely stored
//   migrate                    -> { migrated, kept, failed }    moves this student's plaintext passwords (counts only)
// AI-connection tokens (they carry client_id) get 403 whatever they ask. Other methods get 405 from Next.
// Every reply is no-store and has no CORS headers; error bodies are codes only; nothing here is logged.

const MAX_BODY = 256 * 1024;

function reply(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const cfg = vaultConfig();
  if (!cfg) return reply({ configured: false }, 503);

  const token = bearerToken(req.headers.get("authorization"));
  if (!token) return reply({ error: "unauthorized" }, 401);
  const source = tokenSource(token);
  if (source === "ai_client") return reply({ error: "forbidden" }, 403);
  if (source !== "website") return reply({ error: "unauthorized" }, 401);
  const userId = await verifiedUser(cfg, token);
  if (!userId) return reply({ error: "unauthorized" }, 401);

  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) return reply({ error: "too_large" }, 413);
  const text = await req.text().catch(() => null);
  if (text === null) return reply({ error: "bad_request" }, 400);
  if (text.length > MAX_BODY) return reply({ error: "too_large" }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return reply({ error: "bad_request" }, 400);
  }
  const parsed = parseVaultRequest(body);
  if (!parsed.ok) return reply({ error: parsed.error }, 400);
  const r = parsed.req;

  try {
    switch (r.action) {
      case "list":
        return reply({ slots: await listSlots(cfg, userId) });
      case "reveal": {
        const found = await revealPassword(cfg, userId, r.slot);
        if ("password" in found) return reply({ password: found.password });
        return found.missing === "missing" ? reply({ error: "not_found" }, 404) : reply({ error: "unreadable" }, 409);
      }
      case "set":
        return (await setPassword(cfg, userId, r.slot, r.password)) === "ok" ? reply({ ok: true }) : reply({ error: "too_many" }, 409);
      case "delete":
        await deletePassword(cfg, userId, r.slot);
        return reply({ ok: true });
      case "import":
        return reply(await importPasswords(cfg, userId, r.entries));
      case "migrate":
        return reply(await migratePlaintext(cfg, userId));
    }
  } catch {
    return reply({ error: "server_error" }, 500);
  }
}
