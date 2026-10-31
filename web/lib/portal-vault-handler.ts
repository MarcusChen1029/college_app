// POST /api/portal-passwords, minus the HTTP plumbing: who is asking, then the action. Database work comes in
// through `deps`, so the order of the checks and the reply for every result can be tested
// (portal-vault-handler.test.ts). The store holds only values sealed in the student's browser ("e1.", vault-format.ts),
// which this server can't open: they come in through set/import and leave only through get. Nothing here logs, and
// replies carry codes, counts, slot states or the caller's own stored strings, never another user's data.

import type { SealedEntry } from "./portal-slots.ts";
import { parseVaultRequest } from "./portal-slots.ts";
import { tokenSource } from "./request-token.ts";
import { parseE1, type VaultRecord } from "./vault-format.ts";

/** One stored password, without its value (see slotKind); updated_at exactly as the database returned it. */
export type SlotState = { slot: string; kind: "e1" | "other"; updated_at: string };

/**
 * How "list" reports a stored value: e1 = sealed under the account's vault (key id `keyId`), other = anything nobody
 * can open here: an e1 value of a vault that was replaced or is gone, or a malformed value.
 */
export function slotKind(sealed: string, keyId: string | null): SlotState["kind"] {
  const e1 = parseE1(sealed);
  return e1 && e1.keyId === keyId ? "e1" : "other";
}

export type PutResult = "ok" | "no_vault" | "wrong_vault" | "changed" | "occupied" | "too_many";

export type VaultDeps = {
  /** The user the website session token belongs to (checked with Supabase), or null. */
  verifyUser(token: string): Promise<string | null>;
  /** The account's vault record, with updated_at exactly as the database returned it, or null when there is none. */
  vault(userId: string): Promise<(VaultRecord & { updated_at: string }) | null>;
  createVault(userId: string, r: VaultRecord): Promise<"ok" | "exists" | "orphans">;
  /**
   * Replaces the passphrase / recovery-code wrappers if the row still has `expected` as updated_at and the same key id.
   * "wrong_vault" = the stored vault has another key id (another tab started over).
   */
  updateVault(userId: string, r: VaultRecord, expected: string): Promise<{ updated_at: string } | "changed" | "no_vault" | "wrong_vault">;
  list(userId: string): Promise<SlotState[]>;
  /** The stored string, never opened. */
  get(userId: string, slot: string): Promise<string | null>;
  /** portal_vault_put (0047): `expected` = compare-and-set on updated_at, `insertOnly` = never overwrite ("occupied"). */
  put(userId: string, e: SealedEntry, expected: string | null, insertOnly: boolean): Promise<PutResult>;
  remove(userId: string, slot: string): Promise<void>;
  reset(userId: string): Promise<void>;
  /**
   * Where the account keeps its passwords (student_profiles.password_storage, 0049): "vault" also when it has no profile
   * row, or the database has no such column yet. In "device" mode the vault takes no new passwords (see handleVault).
   */
  mode(userId: string): Promise<"vault" | "device">;
};

export type VaultReply = { status: number; body: Record<string, unknown> };

/** The checks, in order: a token (401), not an AI connection's (403), a live session (401), a well-formed body (400). Only then the action. */
export async function handleVault(token: string | null, body: unknown, deps: VaultDeps): Promise<VaultReply> {
  const reply = (status: number, b: Record<string, unknown>): VaultReply => ({ status, body: b });
  const error = (status: number, code: string) => reply(status, { error: code });
  if (!token) return error(401, "unauthorized");
  const source = tokenSource(token);
  if (source === "ai_client") return error(403, "forbidden");
  if (source !== "website") return error(401, "unauthorized");
  try {
    const userId = await deps.verifyUser(token);
    if (!userId) return error(401, "unauthorized");
    const parsed = parseVaultRequest(body);
    if (!parsed.ok) return error(400, parsed.error);
    const r = parsed.req;
    // An account that keeps its passwords on its device (0049) gets no new vault and no new value in the old one: a
    // switch to this device copies what the vault holds and then deletes it, and a save from a tab that hasn't noticed
    // the switch must not land in between (it would be deleted without ever reaching the device). Reads, deletes and
    // the reset stay open, so the switch can finish and the student can clean up.
    const deviceMode = async () => (await deps.mode(userId)) === "device";
    switch (r.action) {
      case "vault":
        return reply(200, { vault: await deps.vault(userId) });
      case "vault_create": {
        if (await deviceMode()) return error(409, "device_mode");
        const result = await deps.createVault(userId, r.record);
        return result === "ok" ? reply(200, { ok: true }) : error(409, result);
      }
      case "vault_update": {
        const result = await deps.updateVault(userId, r.record, r.expected);
        if (typeof result === "object") return reply(200, { ok: true, updated_at: result.updated_at });
        return error(result === "no_vault" ? 404 : 409, result);
      }
      case "list":
        return reply(200, { slots: await deps.list(userId) });
      case "get": {
        const sealed = await deps.get(userId, r.slot);
        return sealed === null ? error(404, "not_found") : reply(200, { sealed });
      }
      case "set": {
        if (await deviceMode()) return error(409, "device_mode");
        const result = await deps.put(userId, { slot: r.slot, sealed: r.sealed }, r.expected, false);
        if (result === "ok") return reply(200, { ok: true });
        return error(result === "no_vault" ? 404 : 409, result);
      }
      case "delete":
        await deps.remove(userId, r.slot);
        return reply(200, { ok: true });
      case "import":
        if (await deviceMode()) return error(409, "device_mode");
        return reply(200, await importEntries(deps, userId, r.entries));
      case "reset":
        await deps.reset(userId);
        return reply(200, { ok: true });
    }
  } catch {
    return error(500, "server_error");
  }
}

/**
 * Passwords a browser sealed before sign-in, saved one at a time and insert-only (an import never replaces the
 * account's own value). Every entry that wasn't stored is listed in `failed`, so the browser keeps exactly those. One at
 * a time keeps the 500-slot cap exact. A put that throws (the database is unreachable) ends the import there: it and
 * the rest are failed, and the ones already stored are still confirmed.
 */
async function importEntries(deps: VaultDeps, userId: string, entries: readonly SealedEntry[]): Promise<{ imported: number; failed: string[] }> {
  let imported = 0;
  const failed: string[] = [];
  for (const [i, e] of entries.entries()) {
    let result: PutResult;
    try {
      result = await deps.put(userId, e, null, true);
    } catch {
      failed.push(...entries.slice(i).map((x) => x.slot));
      break;
    }
    if (result === "ok") imported++;
    else failed.push(e.slot);
  }
  return { imported, failed };
}
