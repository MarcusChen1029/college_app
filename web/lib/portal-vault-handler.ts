// POST /api/portal-passwords, minus the HTTP plumbing: who is asking, whether this deployment's key is the store's
// key, then the action. Database work comes in through `deps`, so the order of these checks can be tested
// (portal-vault-handler.test.ts). Nothing here logs, and replies carry codes or counts, never another user's data.

import type { SlotPassword } from "./portal-slots.ts";
import { parseVaultRequest } from "./portal-slots.ts";
import { tokenSource } from "./portal-vault.ts";

export type KeyStatus = "ok" | "mismatch" | "unclaimed";

export type VaultDeps = {
  /** The user the website session token belongs to (checked with Supabase), or null. */
  verifyUser(token: string): Promise<string | null>;
  /** Whether this deployment's key is the one the store was claimed with (portal_vault_meta). */
  keyStatus(): Promise<KeyStatus>;
  list(userId: string): Promise<string[]>;
  reveal(userId: string, slot: string): Promise<{ password: string } | { missing: "missing" | "unreadable" }>;
  set(userId: string, slot: string, password: string): Promise<"ok" | "too_many">;
  remove(userId: string, slot: string): Promise<void>;
  importPasswords(userId: string, entries: SlotPassword[]): Promise<{ imported: number; kept: number; failed: string[] }>;
  migrate(userId: string): Promise<{ migrated: number; kept: number; failed: number }>;
};

export type VaultReply = { status: number; body: Record<string, unknown> };

/**
 * The checks, in order: a token (401), not an AI connection's (403), a live session (401), a well-formed body (400),
 * then this deployment's key (503 key_mismatch / key_unclaimed: a deployment holding another key, e.g. a preview or
 * a laptop pointed at the production database, must neither read nor write a single row). Only then the action.
 */
export async function handleVault(token: string | null, body: unknown, deps: VaultDeps): Promise<VaultReply> {
  const reply = (status: number, b: Record<string, unknown>): VaultReply => ({ status, body: b });
  if (!token) return reply(401, { error: "unauthorized" });
  const source = tokenSource(token);
  if (source === "ai_client") return reply(403, { error: "forbidden" });
  if (source !== "website") return reply(401, { error: "unauthorized" });
  try {
    const userId = await deps.verifyUser(token);
    if (!userId) return reply(401, { error: "unauthorized" });
    const parsed = parseVaultRequest(body);
    if (!parsed.ok) return reply(400, { error: parsed.error });
    const key = await deps.keyStatus();
    if (key !== "ok") return reply(503, { error: key === "mismatch" ? "key_mismatch" : "key_unclaimed" });
    const r = parsed.req;
    switch (r.action) {
      case "list":
        return reply(200, { slots: await deps.list(userId) });
      case "reveal": {
        const found = await deps.reveal(userId, r.slot);
        if ("password" in found) return reply(200, { password: found.password });
        return found.missing === "missing" ? reply(404, { error: "not_found" }) : reply(409, { error: "unreadable" });
      }
      case "set":
        return (await deps.set(userId, r.slot, r.password)) === "ok" ? reply(200, { ok: true }) : reply(409, { error: "too_many" });
      case "delete":
        await deps.remove(userId, r.slot);
        return reply(200, { ok: true });
      case "import":
        return reply(200, await deps.importPasswords(userId, r.entries));
      case "migrate":
        return reply(200, await deps.migrate(userId));
    }
  } catch {
    return reply(500, { error: "server_error" });
  }
}
