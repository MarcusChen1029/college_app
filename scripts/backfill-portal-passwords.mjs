// OPTIONAL backfill for students who don't visit the site: does for every student what the site's POST
// /api/portal-passwords "migrate" does for one student on their next visit. Same code and the same rule:
// web/lib/portal-migrate.ts decides, web/lib/portal-vault.ts seals and opens. A plaintext password
// (student_colleges.portal_password, or a "password" key in student_profiles.portals) is removed only after the
// encrypted store holds a copy that opens with the key given here (an existing row that opens, or a new row read back
// and opened to the same value), and only through migration 0041's compare-and-set functions, which refuse if the row
// changed since it was read. Anything else stays plaintext. Running it again is safe.
// It never prints a password, a sealed value or a key; --dry-run reads and counts only.
//
//   NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co SUPABASE_SERVICE_ROLE_KEY=... GOOGLE_TOKEN_ENCRYPTION_KEY=... \
//     node scripts/backfill-portal-passwords.mjs [--dry-run]
//
// The key rule is the server's: PORTAL_ENCRYPTION_KEY if set, else GOOGLE_TOKEN_ENCRYPTION_KEY. With a key that
// differs from the deployed site's, existing rows don't open and new ones are written under the wrong key: use the
// Production values exactly (e.g. from `vercel env pull`). Needs migrations 0038 and 0041 and Node 22.18+.
// Runbook: docs/superpowers/plans/2026-10-28-portal-password-encryption.md

import { pathToFileURL } from "node:url";
import { planMigration, plaintextIn, sealOnce, verifiedCopies, withoutPasswordsAt } from "../web/lib/portal-migrate.ts";
import { openPassword, sealPassword, vaultKey } from "../web/lib/portal-vault.ts";

const PAGE = 500; // read until an empty page, so a lower max-rows setting can't end the read early
const MAX_SLOTS_PER_USER = 500; // web/lib/portal-vault-server.ts

/** One student's plan, with the rows to write (sealed exactly as the server seals). Pure: tested in web/lib. */
export function planForUser(key, userId, colleges, portals, vault) {
  const open = (slot, sealed) => openPassword(key, userId, slot, sealed);
  const plan = planMigration(plaintextIn(colleges, portals), vault, open, MAX_SLOTS_PER_USER - vault.length);
  const rows = sealOnce(plan.seal).map((r) => ({ user_id: userId, slot: r.slot, sealed: sealPassword(key, userId, r.slot, r.password) }));
  return { plan, rows, open };
}

/** The plaintext values that may now be removed: kept ones, plus sealed ones whose read-back row opens to the same value. */
export function copiedAfterReadBack(planned, readBack) {
  return [...planned.plan.keep, ...verifiedCopies(planned.plan.seal, new Map(readBack.map((r) => [r.slot, r.sealed])), planned.open)];
}

function config() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const key = vaultKey(process.env);
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !key && "GOOGLE_TOKEN_ENCRYPTION_KEY (or PORTAL_ENCRYPTION_KEY): base64 of exactly 32 bytes"].filter(Boolean);
  if (missing.length) throw new Error(`missing settings: ${missing.join(", ")}`);
  return { url: url.replace(/\/+$/, ""), serviceKey, key };
}

const headers = (cfg) => ({ apikey: cfg.serviceKey, Authorization: `Bearer ${cfg.serviceKey}` });

// Error messages carry the status only, never a response body (it could echo row data). Filters in URLs hold ids only.
async function readAll(cfg, path) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${cfg.url}/rest/v1/${path}`, { headers: { ...headers(cfg), Range: `${from}-${from + PAGE - 1}`, "Range-Unit": "items" } });
    if (!res.ok) throw new Error(`reading ${path.split("?")[0]} failed: HTTP ${res.status}`);
    const page = await res.json();
    if (!page.length) return rows;
    rows.push(...page);
  }
}

async function post(cfg, path, body, prefer) {
  const res = await fetch(`${cfg.url}/rest/v1/${path}`, {
    method: "POST",
    headers: { ...headers(cfg), "Content-Type": "application/json", ...(prefer ? { Prefer: prefer } : {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path.split("?")[0]} failed: HTTP ${res.status}`);
  return prefer?.includes("return=minimal") ? null : res.json();
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const cfg = config();
  const [colleges, profiles] = await Promise.all([
    readAll(cfg, "student_colleges?select=id,user_id,institution_id,custom,portal_password&portal_password=not.is.null&order=id"),
    readAll(cfg, "student_profiles?select=user_id,portals&portals=not.is.null&order=user_id"),
  ]);
  const users = new Map();
  const userOf = (id) => users.get(id) ?? users.set(id, { colleges: [], portals: null }).get(id);
  for (const c of colleges) userOf(c.user_id).colleges.push(c);
  for (const p of profiles) if (plaintextIn([], p.portals).length) userOf(p.user_id).portals = p.portals;

  const counts = { students: 0, plaintextFound: 0, kept: 0, migrated: 0, failed: 0 };
  for (const [userId, u] of users) {
    const vault = await readAll(cfg, `portal_passwords?select=slot,sealed&user_id=eq.${userId}&order=slot`);
    const planned = planForUser(cfg.key, userId, u.colleges, u.portals, vault);
    const total = planned.plan.keep.length + planned.plan.seal.length + planned.plan.failed.length;
    if (!total) continue;
    counts.students++;
    counts.plaintextFound += total;
    if (dryRun) {
      counts.kept += planned.plan.keep.length;
      counts.migrated += planned.plan.seal.length; // would be sealed, verified and removed
      counts.failed += planned.plan.failed.length;
      continue;
    }
    if (planned.rows.length) await post(cfg, "portal_passwords?on_conflict=user_id,slot", planned.rows, "resolution=merge-duplicates,return=minimal");
    const readBack = planned.rows.length ? await readAll(cfg, `portal_passwords?select=slot,sealed&user_id=eq.${userId}&order=slot`) : [];
    const copied = copiedAfterReadBack(planned, readBack);
    const removed = new Set();
    for (const v of copied)
      if (v.at.table === "college" && (await post(cfg, "rpc/strip_college_portal_password", { p_user: userId, p_id: v.at.id, p_old: v.password })) === true) removed.add(v);
    const inProfile = copied.filter((v) => v.at.table === "profile");
    if (inProfile.length) {
      const ok = await post(cfg, "rpc/replace_profile_portals", { p_user: userId, p_old: u.portals, p_new: withoutPasswordsAt(u.portals, inProfile.map((v) => v.at)) });
      if (ok === true) inProfile.forEach((v) => removed.add(v));
    }
    const kept = planned.plan.keep.filter((v) => removed.has(v)).length;
    counts.kept += kept;
    counts.migrated += removed.size - kept;
    counts.failed += total - removed.size;
  }
  console.log(JSON.stringify(counts, null, 2));
  console.log(dryRun ? "dry run: nothing written (kept/migrated/failed are what a real run would do)" : "done; failed = still plaintext (see the runbook)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`backfill failed: ${e instanceof Error ? e.message : "unknown error"}`);
    process.exit(1);
  });
}
