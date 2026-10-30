// POST /api/portal-passwords, minus the HTTP plumbing: who is asking, then the action. Database work comes in
// through `deps`, so the order of the checks and the reply for every result can be tested
// (portal-vault-handler.test.ts). The store holds only values sealed in the student's browser ("e1.", vault-format.ts),
// which this server can't open: they come in through set/import and leave only through get. The one exception is
// handover, which opens an old server-sealed ("v1.") row once so the browser can lock it again; it alone needs this
// deployment's key to be the store's key. Nothing here logs, and replies carry codes, counts, slot states or the
// caller's own stored strings, never another user's data.

import type { SealedEntry } from "./portal-slots.ts";
import { parseVaultRequest } from "./portal-slots.ts";
import { tokenSource, VAULT_VERSION } from "./portal-vault.ts";
import { parseE1, type VaultRecord } from "./vault-format.ts";

export type KeyStatus = "ok" | "mismatch" | "unclaimed";

/** One stored password, without its value (see slotKind); updated_at exactly as the database returned it. */
export type SlotState = { slot: string; kind: "e1" | "v1" | "other"; updated_at: string };

/**
 * How "list" reports a stored value: e1 = sealed under the account's vault (key id `vaultKeyId`), v1 = sealed by the
 * server before the browser vault (handover opens it once), other = anything nobody can open here: an e1 value of a
 * vault that was replaced or is gone, or a malformed value.
 */
export function slotKind(sealed: string, vaultKeyId: string | null): SlotState["kind"] {
  const e1 = parseE1(sealed);
  if (e1) return e1.keyId === vaultKeyId ? "e1" : "other";
  return sealed.startsWith(`${VAULT_VERSION}.`) ? "v1" : "other";
}

export type PutResult = "ok" | "no_vault" | "wrong_vault" | "changed" | "occupied" | "too_many";

export type VaultDeps = {
  /** The user the website session token belongs to (checked with Supabase), or null. */
  verifyUser(token: string): Promise<string | null>;
  /** Whether this deployment's key is the one the store was claimed with (portal_vault_meta); only handover asks. */
  keyStatus(): Promise<KeyStatus | "no_key">;
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
  /** Opens one v1 row with this deployment's key: its password and the updated_at to compare against when re-locking it. */
  handover(userId: string, slot: string): Promise<{ password: string; updated_at: string } | "missing" | "not_legacy" | "unreadable">;
  reset(userId: string): Promise<void>;
};

export type VaultReply = { status: number; body: Record<string, unknown> };

const KEY_ERRORS = { mismatch: "key_mismatch", unclaimed: "key_unclaimed", no_key: "no_key" } as const;

/**
 * The checks, in order: a token (401), not an AI connection's (403), a live session (401), a well-formed body (400).
 * Only then the action. handover first checks this deployment's key (503 key_mismatch / key_unclaimed / no_key: a
 * deployment holding another key, e.g. a preview or a laptop pointed at the production database, must not open a row).
 */
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
    switch (r.action) {
      case "vault":
        return reply(200, { vault: await deps.vault(userId) });
      case "vault_create": {
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
        const result = await deps.put(userId, { slot: r.slot, sealed: r.sealed }, r.expected, false);
        if (result === "ok") return reply(200, { ok: true });
        return error(result === "no_vault" ? 404 : 409, result);
      }
      case "delete":
        await deps.remove(userId, r.slot);
        return reply(200, { ok: true });
      case "import":
        return reply(200, await importEntries(deps, userId, r.entries));
      case "handover": {
        const key = await deps.keyStatus();
        if (key !== "ok") return error(503, KEY_ERRORS[key]);
        const found = await deps.handover(userId, r.slot);
        if (typeof found === "object") return reply(200, { password: found.password, updated_at: found.updated_at });
        return found === "missing" ? error(404, "not_found") : error(409, found);
      }
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
