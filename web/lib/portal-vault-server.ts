import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SealedEntry } from "./portal-slots";
import { keyDecision, openPassword, VAULT_VERSION, vaultKey, vaultKeyId } from "./portal-vault";
import { slotKind, type KeyStatus, type PutResult, type SlotState, type VaultDeps } from "./portal-vault-handler";
import { parseVaultRecord, type VaultRecord } from "./vault-format";

// Server side of the saved portal passwords (POST /api/portal-passwords). The tables (portal_passwords, 0040;
// portal_vaults, 0047) have no policies and no grants for anon/authenticated, so only this file, with the
// service-role key, reads or writes them, always filtered to the one verified user. Passwords are sealed in the
// student's browser ("e1.", vault-format.ts) and this server can't open them: it stores the strings through the 0047
// functions, says which slots hold one (never the values) and hands a value back only through "get". The one thing it
// still opens is an old server-sealed "v1." row, once, for "handover" (lib/portal-vault.ts, with PORTAL_ENCRYPTION_KEY).
// Never log a password, a sealed value or a token; thrown errors carry no row data. Sealed values travel to the
// database only in request bodies (rpc), never in a URL filter. updated_at strings go back to the browser exactly as
// PostgREST returned them, and come back from it the same way (compare-and-set needs the microseconds).

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;
const TABLE = "portal_passwords";
const VAULTS = "portal_vaults";
const RECORD_COLUMNS = "version, key_id, pass_salt, pass_iterations, pass_check, pass_wrapped, rec_salt, rec_check, rec_wrapped";
/** Most passwords one account may keep (every system, campus, custom portal and listed college fits many times over). Also in portal_vault_put (0047). */
export const MAX_SLOTS_PER_USER = 500;

/** key = this deployment's PORTAL_ENCRYPTION_KEY, needed only to hand over old v1 rows (null: handover answers no_key). */
export type VaultConfig = { key: Buffer | null; supabaseUrl: string; publishableKey: string; serviceKey: string };

/** Null when a Supabase setting is missing; the route then answers 503 { configured: false }. */
export function vaultConfig(): VaultConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !publishableKey || !serviceKey) return null;
  return { key: vaultKey(), supabaseUrl, publishableKey, serviceKey };
}

/** The user the token belongs to, checked with Supabase (rejects bad signatures and signed-out sessions). */
async function verifiedUser(cfg: VaultConfig, token: string): Promise<string | null> {
  try {
    const { data, error } = await createClient(cfg.supabaseUrl, cfg.publishableKey, { auth: NO_SESSION }).auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  } catch {
    return null;
  }
}

const admin = (cfg: VaultConfig) => createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: NO_SESSION });

// ── which key owns the old v1 rows (handover only) ──

/**
 * Only the production deployment may claim an unclaimed store with its key (VERCEL_ENV=production, or
 * PORTAL_VAULT_CLAIM=1 on another host). A preview or a laptop pointed at the same database never claims it first.
 */
const mayClaim = () => process.env.VERCEL_ENV === "production" || process.env.PORTAL_VAULT_CLAIM === "1";

let keyCheck: { kid: string; status: Promise<KeyStatus> } | null = null;

/**
 * Compares this deployment's key id with the one stored in portal_vault_meta (migration 0040), once per process; an
 * unclaimed store is claimed by production (insert, on conflict nothing, then read again). A failed read is not cached.
 * No key at all = "no_key". Only handover asks: every other action stores or returns strings this server can't open.
 */
function keyStatus(cfg: VaultConfig): Promise<KeyStatus | "no_key"> {
  const key = cfg.key;
  if (!key) return Promise.resolve("no_key");
  const kid = vaultKeyId(key);
  if (keyCheck?.kid === kid) return keyCheck.status;
  const status = (async (): Promise<KeyStatus> => {
    const read = async () => {
      const { data, error } = await admin(cfg).from("portal_vault_meta").select("key_id").eq("id", true).maybeSingle();
      if (error) throw new Error("portal_vault_meta read failed");
      return (data?.key_id as string | undefined) ?? null;
    };
    const first = keyDecision(await read(), kid, mayClaim());
    if (first !== "claim") return first;
    const { error } = await admin(cfg).from("portal_vault_meta").upsert({ id: true, key_id: kid }, { onConflict: "id", ignoreDuplicates: true });
    if (error) throw new Error("portal_vault_meta write failed");
    const again = keyDecision(await read(), kid, false);
    return again === "ok" ? "ok" : "mismatch";
  })();
  keyCheck = { kid, status };
  status.catch(() => {
    if (keyCheck?.status === status) keyCheck = null;
  });
  return status;
}

// ── the vault record ──

/** The account's vault record as stored (checked again on the way out), or null. */
async function readVault(cfg: VaultConfig, userId: string): Promise<(VaultRecord & { updated_at: string }) | null> {
  const { data, error } = await admin(cfg).from(VAULTS).select(`${RECORD_COLUMNS}, updated_at`).eq("user_id", userId).maybeSingle();
  if (error) throw new Error("portal_vaults read failed");
  if (!data) return null;
  const { updated_at, ...rest } = data as Record<string, unknown>;
  const record = parseVaultRecord(rest);
  if (!record || typeof updated_at !== "string") throw new Error("portal_vaults row malformed");
  return { ...record, updated_at };
}

/** portal_vault_create (0047): "exists" = a vault is there, "orphans" = e1 rows of a vault that is gone. */
async function createVault(cfg: VaultConfig, userId: string, r: VaultRecord): Promise<"ok" | "exists" | "orphans"> {
  const { data, error } = await admin(cfg).rpc("portal_vault_create", { p_user: userId, p_record: r });
  if (error) throw new Error("portal_vault_create failed");
  if (data === "ok" || data === "exists" || data === "orphans") return data;
  throw new Error("portal_vault_create: unexpected result");
}

/**
 * A new updated_at for a compare-and-set write: now, or 1 ms past `expected` when this clock isn't past it, so the
 * stored value always moves. Date.parse is used only for this comparison; the filter itself takes the exact string.
 */
function laterThan(expected: string): string {
  return new Date(Math.max(Date.now(), Date.parse(expected) + 1)).toISOString();
}

/**
 * Replaces the passphrase and recovery-code wrappers (new passphrase, new recovery code) of the same vault: only if
 * the row still has exactly `expected` as updated_at and the same key id. There is no trigger on portal_vaults, so
 * this write sets updated_at itself and reads back what was stored. When nothing matched, one more read tells apart
 * no vault, another vault (another tab started over) and a vault changed since `expected`.
 */
async function updateVault(cfg: VaultConfig, userId: string, r: VaultRecord, expected: string): Promise<{ updated_at: string } | "changed" | "no_vault" | "wrong_vault"> {
  const db = admin(cfg);
  const { pass_salt, pass_iterations, pass_check, pass_wrapped, rec_salt, rec_check, rec_wrapped } = r;
  const { data, error } = await db
    .from(VAULTS)
    .update({ pass_salt, pass_iterations, pass_check, pass_wrapped, rec_salt, rec_check, rec_wrapped, updated_at: laterThan(expected) })
    .eq("user_id", userId)
    .eq("key_id", r.key_id)
    .eq("updated_at", expected)
    .select("updated_at");
  if (error) throw new Error("portal_vaults update failed");
  const stored = (data ?? [])[0]?.updated_at;
  if (typeof stored === "string") return { updated_at: stored };
  const now = await db.from(VAULTS).select("key_id").eq("user_id", userId).maybeSingle();
  if (now.error) throw new Error("portal_vaults read failed");
  if (!now.data) return "no_vault";
  return now.data.key_id === r.key_id ? "changed" : "wrong_vault";
}

// ── the passwords ──

/** Every stored slot with its kind and updated_at; the sealed values are read only to classify them and never leave. */
async function listSlots(cfg: VaultConfig, userId: string): Promise<SlotState[]> {
  const db = admin(cfg);
  const [rows, vault] = await Promise.all([
    db.from(TABLE).select("slot, sealed, updated_at").eq("user_id", userId).order("slot").range(0, MAX_SLOTS_PER_USER - 1),
    db.from(VAULTS).select("key_id").eq("user_id", userId).maybeSingle(),
  ]);
  if (rows.error) throw new Error("portal_passwords read failed");
  if (vault.error) throw new Error("portal_vaults read failed");
  const keyId = typeof vault.data?.key_id === "string" ? vault.data.key_id : null;
  return ((rows.data ?? []) as { slot: string; sealed: string; updated_at: string }[]).map((r) => ({ slot: r.slot, kind: slotKind(r.sealed, keyId), updated_at: r.updated_at }));
}

/** The stored string at this slot, exactly as stored (never opened), or null. */
async function getSealed(cfg: VaultConfig, userId: string, slot: string): Promise<string | null> {
  const { data, error } = await admin(cfg).from(TABLE).select("sealed").eq("user_id", userId).eq("slot", slot).maybeSingle();
  if (error) throw new Error("portal_passwords read failed");
  return data ? (data.sealed as string) : null;
}

const PUT_RESULTS: readonly PutResult[] = ["ok", "no_vault", "wrong_vault", "changed", "occupied", "too_many"];

/** portal_vault_put (0047), always with all five arguments; the sealed value goes in the request body. */
async function putSealed(cfg: VaultConfig, userId: string, e: SealedEntry, expected: string | null, insertOnly: boolean): Promise<PutResult> {
  const { data, error } = await admin(cfg).rpc("portal_vault_put", {
    p_user: userId,
    p_slot: e.slot,
    p_sealed: e.sealed,
    p_expected: expected,
    p_insert_only: insertOnly,
  });
  if (error) throw new Error("portal_vault_put failed");
  const result = PUT_RESULTS.find((x) => x === data);
  if (!result) throw new Error("portal_vault_put: unexpected result");
  return result;
}

/** Deletes one stored password (any kind). */
async function deleteSlot(cfg: VaultConfig, userId: string, slot: string) {
  const { error } = await admin(cfg).from(TABLE).delete().eq("user_id", userId).eq("slot", slot);
  if (error) throw new Error("portal_passwords delete failed");
}

/**
 * Opens an old server-sealed row so the browser can seal it again (it then saves the new value with "set" and
 * expected = this updated_at, which replaces the row only if it is still the one opened here). "not_legacy" = the
 * row is not a v1 value; "unreadable" = sealed under another key, or tampered. The handler checks the key first.
 */
async function handover(cfg: VaultConfig, userId: string, slot: string): Promise<{ password: string; updated_at: string } | "missing" | "not_legacy" | "unreadable"> {
  const key = cfg.key;
  if (!key) throw new Error("no portal key");
  const { data, error } = await admin(cfg).from(TABLE).select("sealed, updated_at").eq("user_id", userId).eq("slot", slot).maybeSingle();
  if (error) throw new Error("portal_passwords read failed");
  if (!data) return "missing";
  const sealed = data.sealed as string;
  if (!sealed.startsWith(`${VAULT_VERSION}.`)) return "not_legacy";
  const password = openPassword(key, userId, slot, sealed);
  return password === null ? "unreadable" : { password, updated_at: data.updated_at as string };
}

/** portal_vault_reset (0047): "start over" deletes the vault, then every stored password of the user. */
async function reset(cfg: VaultConfig, userId: string) {
  const { error } = await admin(cfg).rpc("portal_vault_reset", { p_user: userId });
  if (error) throw new Error("portal_vault_reset failed");
}

/** The route's database work, for lib/portal-vault-handler.ts. */
export function vaultDeps(cfg: VaultConfig): VaultDeps {
  return {
    verifyUser: (token) => verifiedUser(cfg, token),
    keyStatus: () => keyStatus(cfg),
    vault: (userId) => readVault(cfg, userId),
    createVault: (userId, r) => createVault(cfg, userId, r),
    updateVault: (userId, r, expected) => updateVault(cfg, userId, r, expected),
    list: (userId) => listSlots(cfg, userId),
    get: (userId, slot) => getSealed(cfg, userId, slot),
    put: (userId, e, expected, insertOnly) => putSealed(cfg, userId, e, expected, insertOnly),
    remove: (userId, slot) => deleteSlot(cfg, userId, slot),
    handover: (userId, slot) => handover(cfg, userId, slot),
    reset: (userId) => reset(cfg, userId),
  };
}
