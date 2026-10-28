// One-off backfill: copies every plaintext portal password (student_colleges.portal_password, and the "password"
// fields inside student_profiles.portals) into the encrypted table portal_passwords (migration 0038). It seals with
// the web server's own code (web/lib/portal-vault.ts) and names slots with web/lib/portal-slots.ts, so the site can
// open what it writes. Slots that already hold a password are skipped, so running it again is safe. It never prints
// a password, a sealed value or a key; --dry-run prints counts only and writes nothing. It does not touch the
// plaintext columns (that is supabase/patches/2026-10-28-strip-plaintext-portal-passwords.sql, run after checking).
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... \
//     node scripts/backfill-portal-passwords.mjs [--dry-run]
//
// The key rule is the server's: PORTAL_ENCRYPTION_KEY if set, else GOOGLE_TOKEN_ENCRYPTION_KEY. Use exactly the values
// the deployed site has. Needs Node 22.18+ (it loads the TypeScript modules directly).
// Runbook: docs/superpowers/plans/2026-10-28-portal-password-encryption.md

import { pathToFileURL } from "node:url";
import { passwordsIn } from "../web/lib/portal-slots.ts";
import { sealPassword, vaultKey } from "../web/lib/portal-vault.ts";

const PAGE = 1000; // PostgREST returns at most 1000 rows per request: page with Range over a unique order
const WRITE_CHUNK = 500;

/** The (userId, slot, password) triples found in rows as PostgREST returns them; empty passwords are skipped. */
export function backfillEntries(colleges, profiles) {
  const byUser = new Map();
  const add = (userId, found) => {
    if (!found.length) return;
    const slots = byUser.get(userId) ?? new Map();
    for (const e of found) if (!slots.has(e.slot)) slots.set(e.slot, e.password);
    byUser.set(userId, slots);
  };
  for (const p of profiles) add(p.user_id, passwordsIn(p.portals));
  // Same slot as the site's collegeSlot(toEntry(row)): the row id for a custom college, else its institution_id.
  for (const c of colleges) add(c.user_id, passwordsIn(null, [{ portal: { password: c.portal_password }, custom: c.custom, rowId: c.id, institutionId: c.institution_id ?? "" }]));
  return [...byUser].flatMap(([userId, slots]) => [...slots].map(([slot, password]) => ({ userId, slot, password })));
}

/** The portal_passwords row for one entry, sealed exactly as POST /api/portal-passwords would. */
export const sealRow = (key, e, now = new Date().toISOString()) => ({ user_id: e.userId, slot: e.slot, sealed: sealPassword(key, e.userId, e.slot, e.password), updated_at: now });

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = vaultKey(process.env);
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !key && "GOOGLE_TOKEN_ENCRYPTION_KEY (or PORTAL_ENCRYPTION_KEY): base64 of exactly 32 bytes"].filter(Boolean);
  if (missing.length) throw new Error(`missing settings: ${missing.join(", ")}`);
  return { url: url.replace(/\/+$/, ""), serviceKey, key };
}

const headers = (cfg) => ({ apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` });

// Error messages carry the status only, never a response body (it could echo row data).
async function readAll(cfg, path) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers: { ...headers(cfg), Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" } });
    if (!res.ok) throw new Error(`reading ${path.split("?")[0]} failed: HTTP ${res.status}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

async function insert(cfg, rows) {
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const res = await fetch(`${cfg.url}/rest/v1/portal_passwords?on_conflict=user_id,slot`, {
      method: "POST",
      headers: { ...headers(cfg), "Content-Type": "application/json", Prefer: "resolution=ignore-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + WRITE_CHUNK)),
    });
    if (!res.ok) throw new Error(`writing portal_passwords failed: HTTP ${res.status}`);
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = config();
  const [colleges, profiles, existing] = await Promise.all([
    readAll(cfg, "student_colleges?select=id,user_id,institution_id,custom,portal_password&portal_password=not.is.null&order=id"),
    readAll(cfg, "student_profiles?select=user_id,portals&portals=not.is.null&order=user_id"),
    readAll(cfg, "portal_passwords?select=user_id,slot&order=user_id,slot"),
  ]);
  const have = new Set(existing.map((r) => `${r.user_id}|${r.slot}`));
  const entries = backfillEntries(colleges, profiles);
  const todo = entries.filter((e) => !have.has(`${e.userId}|${e.slot}`));
  const counts = {
    collegeRowsWithPlaintext: colleges.filter((c) => c.portal_password).length,
    profileRowsRead: profiles.length,
    passwordsFound: entries.length,
    usersWithPasswords: new Set(entries.map((e) => e.userId)).size,
    alreadyInVault: entries.length - todo.length,
    toWrite: todo.length,
  };
  console.log(JSON.stringify(counts, null, 2));
  if (dryRun) {
    console.log("dry run: nothing written");
    return;
  }
  const now = new Date().toISOString();
  await insert(cfg, todo.map((e) => sealRow(cfg.key, e, now)));
  console.log(`wrote ${todo.length} sealed passwords`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`backfill failed: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exit(1);
  });
}
