import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { SlotPassword } from "./portal-slots";
import { openPassword, sealPassword, vaultKey } from "./portal-vault";

// Server side of the saved portal passwords (POST /api/portal-passwords). The table (portal_passwords, 0038) has no
// policies and no grants for anon/authenticated, so only this file, with the service-role key, reads or writes it,
// always filtered to the one verified user. Values are sealed before they leave this process and opened only for
// "reveal". Never log a password, a sealed value or a token; thrown errors carry no row data.

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

/**
 * Adds passwords saved before sign-in (or by an older build) to slots that have none yet; a slot that already has a
 * password keeps it. Stops at the per-account cap.
 */
export async function importPasswords(cfg: VaultConfig, userId: string, entries: readonly SlotPassword[]): Promise<{ imported: number; skipped: number }> {
  const existing = new Set(await listSlots(cfg, userId));
  const room = Math.max(0, MAX_SLOTS_PER_USER - existing.size);
  const fresh = entries.filter((e) => !existing.has(e.slot)).slice(0, room);
  if (fresh.length) {
    const now = new Date().toISOString();
    const { error } = await admin(cfg)
      .from(TABLE)
      .upsert(
        fresh.map((e) => ({ user_id: userId, slot: e.slot, sealed: sealPassword(cfg.key, userId, e.slot, e.password), updated_at: now })),
        { onConflict: "user_id,slot", ignoreDuplicates: true },
      );
    if (error) throw new Error("portal_passwords write failed");
  }
  return { imported: fresh.length, skipped: entries.length - fresh.length };
}
