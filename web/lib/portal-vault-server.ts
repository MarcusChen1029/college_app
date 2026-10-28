import "server-only";
import { createClient } from "@supabase/supabase-js";
import {
  planImport,
  planMigration,
  plaintextIn,
  sealOnce,
  verifiedCopies,
  withoutPasswordsAt,
  type CollegePlainRow,
  type PlainValue,
  type VaultReader,
  type VaultRow,
} from "./portal-migrate";
import type { SlotPassword } from "./portal-slots";
import { keyDecision, openPassword, sealedWithKey, sealPassword, vaultKey, vaultKeyId } from "./portal-vault";
import type { KeyStatus, VaultDeps } from "./portal-vault-handler";

// Server side of the saved portal passwords (POST /api/portal-passwords). The table (portal_passwords, 0040) has no
// policies and no grants for anon/authenticated, so only this file, with the service-role key, reads or writes it,
// always filtered to the one verified user. Values are sealed before they leave this process and opened only for
// "reveal". Never log a password, a sealed value or a token; thrown errors carry no row data. Passwords travel to
// the database only in request bodies (never in a URL filter).

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } as const;
const TABLE = "portal_passwords";
/** Most passwords one account may keep (every system, campus, custom portal and listed college fits many times over). */
export const MAX_SLOTS_PER_USER = 500;

export type VaultConfig = { key: Buffer; supabaseUrl: string; publishableKey: string; serviceKey: string };

/** Null when any setting is missing; the route then answers 503 { configured: false }. */
export function vaultConfig(): VaultConfig | null {
  const key = vaultKey();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !supabaseUrl || !publishableKey || !serviceKey) return null;
  return { key, supabaseUrl, publishableKey, serviceKey };
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

// ── which key owns the store ──

/**
 * Only the production deployment may claim an unclaimed store with its key (VERCEL_ENV=production, or
 * PORTAL_VAULT_CLAIM=1 on another host). A preview or a laptop pointed at the same database never claims it first.
 */
const mayClaim = () => process.env.VERCEL_ENV === "production" || process.env.PORTAL_VAULT_CLAIM === "1";

let keyCheck: { kid: string; status: Promise<KeyStatus> } | null = null;

/**
 * Compares this deployment's key id with the one stored in portal_vault_meta (migration 0040), once per process; an
 * unclaimed store is claimed by production (insert, on conflict nothing, then read again). A failed read is not cached.
 */
function keyStatus(cfg: VaultConfig): Promise<KeyStatus> {
  const kid = vaultKeyId(cfg.key);
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

/** How this deployment reads rows: a row naming another key id is foreign (never opened, kept or overwritten). */
const reader = (cfg: VaultConfig, userId: string): VaultReader => ({
  open: (slot, sealed) => openPassword(cfg.key, userId, slot, sealed),
  ours: (sealed) => sealedWithKey(cfg.key, sealed),
});

// ── the store ──

async function vaultRows(cfg: VaultConfig, userId: string): Promise<VaultRow[]> {
  const { data, error } = await admin(cfg).from(TABLE).select("slot, sealed").eq("user_id", userId).order("slot").range(0, MAX_SLOTS_PER_USER - 1);
  if (error) throw new Error("portal_passwords read failed");
  return (data ?? []) as VaultRow[];
}

/** The slots that hold a password (never the values). */
async function listSlots(cfg: VaultConfig, userId: string): Promise<string[]> {
  return (await vaultRows(cfg, userId)).map((r) => r.slot);
}

/** The password, or why there is none: "missing" (slot empty) or "unreadable" (another key, or tampered). */
async function revealPassword(cfg: VaultConfig, userId: string, slot: string): Promise<{ password: string } | { missing: "missing" | "unreadable" }> {
  const { data, error } = await admin(cfg).from(TABLE).select("sealed").eq("user_id", userId).eq("slot", slot).maybeSingle();
  if (error) throw new Error("portal_passwords read failed");
  if (!data) return { missing: "missing" };
  const password = openPassword(cfg.key, userId, slot, data.sealed as string);
  return password === null ? { missing: "unreadable" } : { password };
}

/**
 * Saves (or replaces) one password; an empty one deletes the slot. "too_many" when a new slot would pass the cap.
 * Any plaintext copy still left at that slot is removed afterwards, so it can't be moved back over this choice.
 */
async function setPassword(cfg: VaultConfig, userId: string, slot: string, password: string): Promise<"ok" | "too_many"> {
  if (!password) {
    await deletePassword(cfg, userId, slot);
    return "ok";
  }
  const existing = await listSlots(cfg, userId);
  if (!existing.includes(slot) && existing.length >= MAX_SLOTS_PER_USER) return "too_many";
  const { error } = await admin(cfg)
    .from(TABLE)
    .upsert({ user_id: userId, slot, sealed: sealPassword(cfg.key, userId, slot, password), updated_at: new Date().toISOString() }, { onConflict: "user_id,slot" });
  if (error) throw new Error("portal_passwords write failed");
  await stripLeftovers(cfg, userId, slot);
  return "ok";
}

/** Deletes one password, and any plaintext copy left at that slot, so "migrate" can't bring it back. */
async function deletePassword(cfg: VaultConfig, userId: string, slot: string) {
  const { error } = await admin(cfg).from(TABLE).delete().eq("user_id", userId).eq("slot", slot);
  if (error) throw new Error("portal_passwords delete failed");
  await stripLeftovers(cfg, userId, slot);
}

/** Seals and writes (replacing a row of ours that doesn't open), then reads the rows back for verification. */
async function writeAndReadBack(cfg: VaultConfig, userId: string, rows: readonly SlotPassword[]): Promise<Map<string, string>> {
  if (!rows.length) return new Map();
  const now = new Date().toISOString();
  const { error } = await admin(cfg)
    .from(TABLE)
    .upsert(
      rows.map((r) => ({ user_id: userId, slot: r.slot, sealed: sealPassword(cfg.key, userId, r.slot, r.password), updated_at: now })),
      { onConflict: "user_id,slot" },
    );
  if (error) return new Map(); // nothing verified: every value stays where it is
  return new Map((await vaultRows(cfg, userId)).map((r) => [r.slot, r.sealed]));
}

// ── plaintext from before 0040 ──

/** This student's plaintext: college rows that have one, and the profile's portals value as stored. */
async function readPlaintext(cfg: VaultConfig, userId: string): Promise<{ plain: PlainValue[]; portals: unknown }> {
  const db = admin(cfg);
  const [cols, prof] = await Promise.all([
    db.from("student_colleges").select("id, institution_id, custom, portal_password").eq("user_id", userId).not("portal_password", "is", null),
    db.from("student_profiles").select("portals").eq("user_id", userId).maybeSingle(),
  ]);
  // 42703 = the column is gone (patch 2026-10-28-drop-portal-password-column.sql): nothing left to move there.
  if (cols.error && cols.error.code !== "42703") throw new Error("student_colleges read failed");
  if (prof.error) throw new Error("student_profiles read failed");
  const portals: unknown = prof.data?.portals ?? null;
  return { plain: plaintextIn(cols.error ? [] : ((cols.data ?? []) as CollegePlainRow[]), portals), portals };
}

/**
 * Removes these plaintext values, each only if its row still holds exactly that value (0043's compare-and-set
 * functions; before 0043 they don't exist and nothing is removed). Returns the ones removed.
 */
async function removePlaintext(cfg: VaultConfig, userId: string, values: readonly PlainValue[], portals: unknown): Promise<Set<PlainValue>> {
  const db = admin(cfg);
  const removed = new Set<PlainValue>();
  for (const v of values) {
    if (v.at.table !== "college") continue;
    const { data, error } = await db.rpc("strip_college_portal_password", { p_user: userId, p_id: v.at.id, p_old: v.password });
    if (!error && data === true) removed.add(v);
  }
  const inProfile = values.filter((v) => v.at.table === "profile");
  if (inProfile.length) {
    const { data, error } = await db.rpc("replace_profile_portals", { p_user: userId, p_old: portals, p_new: withoutPasswordsAt(portals, inProfile) });
    if (!error && data === true) inProfile.forEach((v) => removed.add(v));
  }
  return removed;
}

/** After a set or delete: the plaintext left at that slot is stale; remove it (best effort). */
async function stripLeftovers(cfg: VaultConfig, userId: string, slot: string) {
  try {
    const { plain, portals } = await readPlaintext(cfg, userId);
    const here = plain.filter((v) => v.slot === slot);
    if (here.length) await removePlaintext(cfg, userId, here, portals);
  } catch {
    // the password change itself is done; a leftover is tried again on the next set/delete
  }
}

/**
 * Moves this student's plaintext passwords into the store. A value is removed only after the store holds a copy that
 * opens with the current key to that same value (a row that already does, or a new one read back and opened), and
 * only by a compare-and-set on the exact value read. Anything else stays in plaintext for the next try.
 * Counts only, never values: migrated = copied then removed, kept = the store already had it, failed = still plaintext.
 */
async function migratePlaintext(cfg: VaultConfig, userId: string): Promise<{ migrated: number; kept: number; failed: number }> {
  const { plain, portals } = await readPlaintext(cfg, userId);
  if (!plain.length) return { migrated: 0, kept: 0, failed: 0 };
  const r = reader(cfg, userId);
  const existing = await vaultRows(cfg, userId);
  const plan = planMigration(plain, existing, r, MAX_SLOTS_PER_USER - existing.length);
  const verified = verifiedCopies(plan.seal, await writeAndReadBack(cfg, userId, sealOnce(plan.seal)), r.open);
  const removed = await removePlaintext(cfg, userId, [...plan.keep, ...verified], portals);
  const kept = plan.keep.filter((v) => removed.has(v)).length;
  return { migrated: removed.size - kept, kept, failed: plain.length - removed.size };
}

/**
 * Passwords a browser saved before sign-in. A slot whose row opens to the same value is done; a missing row (room
 * permitting) or one of ours that doesn't open is written, read back and opened. Returns the slots that are NOT
 * safely stored (a different value or a foreign row in the account, past the cap, not verified): the browser keeps those.
 */
async function importPasswords(cfg: VaultConfig, userId: string, entries: readonly SlotPassword[]): Promise<{ imported: number; kept: number; failed: string[] }> {
  const r = reader(cfg, userId);
  const existing = await vaultRows(cfg, userId);
  const plan = planImport(entries, existing, r, MAX_SLOTS_PER_USER - existing.length);
  const verified = new Set(verifiedCopies(plan.seal, await writeAndReadBack(cfg, userId, plan.seal), r.open));
  const failed = [...plan.failed, ...plan.seal.filter((e) => !verified.has(e))].map((e) => e.slot);
  return { imported: verified.size, kept: plan.keep.length, failed };
}

/** The route's database work, for lib/portal-vault-handler.ts. */
export function vaultDeps(cfg: VaultConfig): VaultDeps {
  return {
    verifyUser: (token) => verifiedUser(cfg, token),
    keyStatus: () => keyStatus(cfg),
    list: (userId) => listSlots(cfg, userId),
    reveal: (userId, slot) => revealPassword(cfg, userId, slot),
    set: (userId, slot, password) => setPassword(cfg, userId, slot, password),
    remove: (userId, slot) => deletePassword(cfg, userId, slot),
    importPasswords: (userId, entries) => importPasswords(cfg, userId, entries),
    migrate: (userId) => migratePlaintext(cfg, userId),
  };
}
