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
  type Opener,
  type PlainValue,
  type VaultRow,
} from "./portal-migrate";
import type { SlotPassword } from "./portal-slots";
import { openPassword, sealPassword, vaultKey } from "./portal-vault";

// Server side of the saved portal passwords (POST /api/portal-passwords). The table (portal_passwords, 0038) has no
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
export async function verifiedUser(cfg: VaultConfig, token: string): Promise<string | null> {
  try {
    const { data, error } = await createClient(cfg.supabaseUrl, cfg.publishableKey, { auth: NO_SESSION }).auth.getUser(token);
    return error || !data.user ? null : data.user.id;
  } catch {
    return null;
  }
}

const admin = (cfg: VaultConfig) => createClient(cfg.supabaseUrl, cfg.serviceKey, { auth: NO_SESSION });

/** The slots that hold a password (never the values). */
export async function listSlots(cfg: VaultConfig, userId: string): Promise<string[]> {
  const { data, error } = await admin(cfg).from(TABLE).select("slot").eq("user_id", userId).order("slot").range(0, MAX_SLOTS_PER_USER - 1);
  if (error) throw new Error("portal_passwords read failed");
  return (data ?? []).map((r) => r.slot as string);
}

/** The password, or why there is none: "missing" (slot empty) or "unreadable" (key changed, row tampered). */
export async function revealPassword(cfg: VaultConfig, userId: string, slot: string): Promise<{ password: string } | { missing: "missing" | "unreadable" }> {
  const { data, error } = await admin(cfg).from(TABLE).select("sealed").eq("user_id", userId).eq("slot", slot).maybeSingle();
  if (error) throw new Error("portal_passwords read failed");
  if (!data) return { missing: "missing" };
  const password = openPassword(cfg.key, userId, slot, data.sealed as string);
  return password === null ? { missing: "unreadable" } : { password };
}

/** Saves (or replaces) one password; an empty one deletes the slot. "too_many" when a new slot would pass the cap. */
export async function setPassword(cfg: VaultConfig, userId: string, slot: string, password: string): Promise<"ok" | "too_many"> {
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
  return "ok";
}

export async function deletePassword(cfg: VaultConfig, userId: string, slot: string) {
  const { error } = await admin(cfg).from(TABLE).delete().eq("user_id", userId).eq("slot", slot);
  if (error) throw new Error("portal_passwords delete failed");
}

async function vaultRows(cfg: VaultConfig, userId: string): Promise<VaultRow[]> {
  const { data, error } = await admin(cfg).from(TABLE).select("slot, sealed").eq("user_id", userId).order("slot").range(0, MAX_SLOTS_PER_USER - 1);
  if (error) throw new Error("portal_passwords read failed");
  return (data ?? []) as VaultRow[];
}

const opener = (cfg: VaultConfig, userId: string): Opener => (slot, sealed) => openPassword(cfg.key, userId, slot, sealed);

/** Seals and writes (replacing a row that doesn't open), then reads the rows back for verification. */
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

/**
 * Moves this student's plaintext passwords (student_colleges.portal_password, password keys in student_profiles.portals)
 * into the store. A value is removed only after the store holds a copy that opens with the current key (a row that
 * already opens, or a new one read back and opened to the same value), and only by a compare-and-set on the exact
 * value read (migration 0041's service-role functions). Anything else stays in plaintext for the next try.
 * Counts only, never values: migrated = copied then removed, kept = the store already had it, failed = still plaintext.
 */
export async function migratePlaintext(cfg: VaultConfig, userId: string): Promise<{ migrated: number; kept: number; failed: number }> {
  const db = admin(cfg);
  const [cols, prof] = await Promise.all([
    db.from("student_colleges").select("id, institution_id, custom, portal_password").eq("user_id", userId).not("portal_password", "is", null),
    db.from("student_profiles").select("portals").eq("user_id", userId).maybeSingle(),
  ]);
  // 42703 = the column is gone (patch 2026-10-28-drop-portal-password-column.sql): nothing left to move there.
  if (cols.error && cols.error.code !== "42703") throw new Error("student_colleges read failed");
  if (prof.error) throw new Error("student_profiles read failed");
  const portals: unknown = prof.data?.portals ?? null;
  const plain = plaintextIn(cols.error ? [] : ((cols.data ?? []) as CollegePlainRow[]), portals);
  if (!plain.length) return { migrated: 0, kept: 0, failed: 0 };

  const open = opener(cfg, userId);
  const existing = await vaultRows(cfg, userId);
  const plan = planMigration(plain, existing, open, MAX_SLOTS_PER_USER - existing.length);
  const verified = verifiedCopies(plan.seal, await writeAndReadBack(cfg, userId, sealOnce(plan.seal)), open);
  const copied = [...plan.keep, ...verified];

  const removed = new Set<PlainValue>();
  for (const v of copied) {
    if (v.at.table !== "college") continue;
    const { data, error } = await db.rpc("strip_college_portal_password", { p_user: userId, p_id: v.at.id, p_old: v.password });
    if (!error && data === true) removed.add(v);
  }
  const inProfile = copied.filter((v) => v.at.table === "profile");
  if (inProfile.length) {
    const next = withoutPasswordsAt(portals, inProfile.map((v) => v.at));
    const { data, error } = await db.rpc("replace_profile_portals", { p_user: userId, p_old: portals, p_new: next });
    if (!error && data === true) inProfile.forEach((v) => removed.add(v));
  }
  const kept = plan.keep.filter((v) => removed.has(v)).length;
  return { migrated: removed.size - kept, kept, failed: plain.length - removed.size };
}

/**
 * Passwords a browser saved before sign-in. A slot whose row opens keeps the account's value; a missing or unreadable
 * row is written, read back and opened. Returns the slots that are NOT safely stored (past the cap, or not verified),
 * so the browser keeps those.
 */
export async function importPasswords(cfg: VaultConfig, userId: string, entries: readonly SlotPassword[]): Promise<{ imported: number; kept: number; failed: string[] }> {
  const open = opener(cfg, userId);
  const existing = await vaultRows(cfg, userId);
  const plan = planImport(entries, existing, open, MAX_SLOTS_PER_USER - existing.length);
  const verified = new Set(verifiedCopies(plan.seal, await writeAndReadBack(cfg, userId, plan.seal), open));
  const failed = [...plan.failed, ...plan.seal.filter((e) => !verified.has(e))].map((e) => e.slot);
  return { imported: verified.size, kept: plan.keep.length, failed };
}
