// Where each saved portal password lives in the encrypted store (table portal_passwords, migration 0040), the
// helpers that keep passwords out of everything else (the profile/list rows and the browser's localStorage copy),
// and the checked request body of POST /api/portal-passwords. Pure (no React, no Supabase, no node:crypto): shared
// by the browser store and the route, so both name a login the same way.

import type { PortalData } from "./portals.ts";
import { parseE1, parseVaultRecord, type VaultRecord } from "./vault-format.ts";

export const SLOT_MAX = 200; // also the table's check (0040)
export const PASSWORD_MAX = 512;
export const SEALED_MAX = 4096; // also the table's check on portal_passwords.sealed (0040)
export const IMPORT_MAX = 300; // entries per "import" request

export type SlotKind = "system" | "campus" | "custom" | "college";
export type SlotPassword = { slot: string; password: string };

/**
 * A slot is a stable string, one per login. Never change how one is built: stored passwords are found (and their
 * ciphertext is bound) by it.
 * - "system:<system key>"       a shared system login (Common App, UCAS...): its PortalData.systems key, a SYSTEMS key
 * - "campus:<system>:<campus>"  a campus portal inside a system: its PortalData.campuses key (campusKey)
 * - "custom:<id>"               a portal the student added: CustomPortal.id
 * - "college:<uuid>"            a listed college's own portal: the value rowKey (student-rows.ts) already uses to find
 *                               the entry's student_colleges row across reloads, i.e. its institution_id, or the row's
 *                               own id for a college the student typed in. Both are set before the signed-out ->
 *                               account merge and never change (a slug can be renamed).
 */
export const portalSlot = (kind: SlotKind, id: string) => `${kind}:${id}`;

/** The slot of a list entry's own portal; null while an old local entry has no institution id yet. */
export function collegeSlot(e: { custom?: unknown; rowId?: string; institutionId?: string }): string | null {
  const id = e.custom ? e.rowId : e.institutionId;
  return id ? portalSlot("college", id) : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYSTEM_KEY = /^[a-z0-9_-]{1,40}$/;
const SLOT_ID: Record<SlotKind, (id: string) => boolean> = {
  system: (id) => SYSTEM_KEY.test(id),
  // "<system key>:<campus name>"; campus names have spaces and punctuation ("UT Austin (MyStatus)"), never control characters.
  campus: (id) => {
    const i = id.indexOf(":");
    return i > 0 && SYSTEM_KEY.test(id.slice(0, i)) && id.length - i - 1 >= 1 && !/\p{Cc}/u.test(id);
  },
  custom: (id) => /^[A-Za-z0-9_-]{1,100}$/.test(id),
  college: (id) => UUID.test(id),
};

export function isPortalSlot(v: unknown): v is string {
  if (typeof v !== "string" || v.length > SLOT_MAX) return false;
  const i = v.indexOf(":");
  if (i <= 0) return false;
  const kind = v.slice(0, i);
  return Object.hasOwn(SLOT_ID, kind) && SLOT_ID[kind as SlotKind](v.slice(i + 1));
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);

// A login object without its password key; anything that isn't a plain object is passed through untouched.
function dropPassword(l: unknown): unknown {
  if (!isObj(l) || !("password" in l)) return l;
  const copy = { ...l };
  delete copy.password;
  return copy;
}

const mapValues = (o: Loose, f: (v: unknown) => unknown): Loose => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)]));

/**
 * The portals data with every password removed (systems, campuses and custom portals); progress and everything else
 * kept. Applied to every profile row the site reads or writes, and to the localStorage copy, so a password can only
 * travel through the encrypted store.
 */
export function withoutPasswords(portals: PortalData | null | undefined): PortalData {
  if (!isObj(portals)) return {};
  const out: Loose = { ...portals };
  if (isObj(portals.systems)) out.systems = mapValues(portals.systems, dropPassword);
  if (isObj(portals.campuses)) out.campuses = mapValues(portals.campuses, dropPassword);
  if (Array.isArray(portals.custom)) out.custom = portals.custom.map(dropPassword);
  return out as PortalData;
}

/**
 * `next` (a portals value about to be written, without passwords) plus the password keys `stored` (the value last
 * read from the database) still holds for the same logins. The old plaintext keys in the profile row were already
 * removed from the live database and the server no longer migrates them, so on current data this adds nothing; it only
 * keeps a profile save from wiping a leftover key. A login the student removed takes its password with it.
 */
export function keepStoredPasswords(next: PortalData, stored: unknown): PortalData {
  if (!isObj(stored)) return next;
  const pw = (l: unknown) => (isObj(l) && "password" in l && l.password !== undefined && l.password !== null && l.password !== "" ? l.password : undefined);
  const out: Loose = { ...next };
  for (const group of ["systems", "campuses"] as const) {
    const was = stored[group];
    const now = (next as Loose)[group];
    if (!isObj(was) || !isObj(now)) continue;
    out[group] = Object.fromEntries(Object.entries(now).map(([k, l]) => [k, isObj(l) && pw(was[k]) !== undefined ? { ...l, password: pw(was[k]) } : l]));
  }
  if (Array.isArray(stored.custom) && Array.isArray(next.custom)) {
    const byId = new Map(stored.custom.flatMap((l) => (isObj(l) && typeof l.id === "string" && pw(l) !== undefined ? [[l.id, pw(l)] as const] : [])));
    out.custom = next.custom.map((l) => (byId.has(l.id) ? { ...l, password: byId.get(l.id) } : l));
  }
  return out as PortalData;
}

/** A list entry's portal as the site keeps it: link and username only (old copies may still carry a password). */
export function portalWithoutPassword(p: unknown): { url: string; username: string } {
  const o = isObj(p) ? p : {};
  return { url: typeof o.url === "string" ? o.url : "", username: typeof o.username === "string" ? o.username : "" };
}

type EntryLike = { portal?: unknown; custom?: unknown; rowId?: string; institutionId?: string };
const passwordOf = (l: unknown) => (isObj(l) && typeof l.password === "string" ? l.password : "");
const hasUsername = (l: unknown) => isObj(l) && typeof l.username === "string" && l.username.trim() !== "";

// Calls `visit` with the slot of every login in old-shaped data (null when the login can't be placed).
function eachLogin(portals: unknown, list: readonly EntryLike[], visit: (slot: string | null, login: unknown) => void) {
  if (isObj(portals)) {
    if (isObj(portals.systems)) for (const [k, l] of Object.entries(portals.systems)) visit(portalSlot("system", k), l);
    if (isObj(portals.campuses)) for (const [k, l] of Object.entries(portals.campuses)) visit(portalSlot("campus", k), l);
    if (Array.isArray(portals.custom)) for (const l of portals.custom) visit(isObj(l) && typeof l.id === "string" ? portalSlot("custom", l.id) : null, l);
  }
  for (const e of list) visit(isObj(e) ? collegeSlot(e) : null, isObj(e) ? e.portal : null);
}

/**
 * The passwords still inside old-shaped data (an older build's localStorage copy, or a profile row written before
 * 0040), by slot: what gets imported into the encrypted store. Empty, over-long and unplaceable ones are skipped;
 * the first one wins when two share a slot.
 */
export function passwordsIn(portals: unknown, list: readonly EntryLike[] = []): SlotPassword[] {
  const out: SlotPassword[] = [];
  eachLogin(portals, list, (slot, l) => {
    const password = passwordOf(l);
    if (slot && password && password.length <= PASSWORD_MAX && isPortalSlot(slot) && !out.some((x) => x.slot === slot)) out.push({ slot, password });
  });
  return out;
}

/** The username of each login in this data, by slot (logins that can't be placed are left out). */
export function usernamesBySlot(portals: unknown, list: readonly EntryLike[]): Map<string, string> {
  const out = new Map<string, string>();
  eachLogin(portals, list, (slot, l) => {
    if (slot && !out.has(slot)) out.set(slot, isObj(l) && typeof l.username === "string" ? l.username.trim() : "");
  });
  return out;
}

/**
 * Splits passwords saved in this browser before sign-in into those that belong with the account's login (`send`: the
 * account has no username for that slot, or the same one as this browser) and those that may not (`hold`: the
 * account has a different username there, so the password could be for another account). Held ones stay in the
 * browser; they are never paired with a username they weren't saved with.
 */
export function pairWithAccount(
  passwords: readonly SlotPassword[],
  account: { portals: unknown; list: readonly EntryLike[] },
  local: { portals: unknown; list: readonly EntryLike[] },
): { send: SlotPassword[]; hold: SlotPassword[] } {
  const theirs = usernamesBySlot(account.portals, account.list);
  const mine = usernamesBySlot(local.portals, local.list);
  const send: SlotPassword[] = [];
  const hold: SlotPassword[] = [];
  for (const p of passwords) {
    const a = theirs.get(p.slot) ?? "";
    (a === "" || a === (mine.get(p.slot) ?? "") ? send : hold).push(p);
  }
  return { send, hold };
}

/** How many logins this data holds (a username, or a password in `passwords`), for "N logins found in this browser". */
export function loginCount(portals: unknown, list: readonly EntryLike[], passwords: readonly SlotPassword[]): number {
  const slots = new Set(passwords.map((p) => p.slot));
  let unplaced = 0;
  eachLogin(portals, list, (slot, l) => {
    if (!hasUsername(l)) return;
    if (slot) slots.add(slot);
    else unplaced++;
  });
  return slots.size + unplaced;
}

/**
 * The entries an "import" reply did not confirm as stored: the ones it lists as failed, or all of them when the
 * request itself failed. The browser keeps exactly these. Works for any entry with a slot (plaintext or sealed).
 */
export function importFailures<T extends { slot: string }>(entries: readonly T[], r: { status: number; data: Record<string, unknown> }): T[] {
  if (r.status !== 200 || !Array.isArray(r.data.failed)) return [...entries];
  const failed = new Set(r.data.failed.filter((s): s is string => typeof s === "string"));
  return entries.filter((e) => failed.has(e.slot));
}

/** A password sealed in the browser ("e1.<key id>.<...>", vault-format.ts), at its slot. The server never opens it. */
export type SealedEntry = { slot: string; sealed: string };

/**
 * The request body of POST /api/portal-passwords, checked. Error codes go back to the browser as they are.
 * `expected` is the updated_at string the server returned earlier, passed on unchanged (never through Date, which
 * drops the microseconds the database compares).
 */
export type VaultRequest =
  | { action: "vault" | "list" | "reset" }
  | { action: "vault_create"; record: VaultRecord }
  | { action: "vault_update"; record: VaultRecord; expected: string }
  | { action: "get" | "delete" | "handover"; slot: string }
  | { action: "set"; slot: string; sealed: string; expected: string | null }
  | { action: "import"; entries: SealedEntry[] };
export type VaultRequestError = "bad_request" | "bad_slot" | "bad_value" | "bad_record" | "too_many";

// A timestamptz as PostgREST writes it ("2026-10-29T08:00:00.123456+00:00"), or with a Z.
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;
const isTimestamp = (v: unknown): v is string => typeof v === "string" && TIMESTAMP.test(v) && !Number.isNaN(Date.parse(v));

/** A browser-sealed value that fits the column; anything else (a bare password, "", an old v1 value) is refused. */
const isSealed = (v: unknown): v is string => typeof v === "string" && v.length <= SEALED_MAX && parseE1(v) !== null;

export function parseVaultRequest(body: unknown): { ok: true; req: VaultRequest } | { ok: false; error: VaultRequestError } {
  const fail = (error: VaultRequestError) => ({ ok: false as const, error });
  if (!isObj(body)) return fail("bad_request");
  const action = body.action;
  if (action === "vault" || action === "list" || action === "reset") return { ok: true, req: { action } };
  if (action === "vault_create" || action === "vault_update") {
    const record = parseVaultRecord(body.record);
    if (!record) return fail("bad_record");
    if (action === "vault_create") return { ok: true, req: { action, record } };
    return isTimestamp(body.expected) ? { ok: true, req: { action, record, expected: body.expected } } : fail("bad_request");
  }
  if (action === "get" || action === "delete" || action === "handover") return isPortalSlot(body.slot) ? { ok: true, req: { action, slot: body.slot } } : fail("bad_slot");
  if (action === "set") {
    if (!isPortalSlot(body.slot)) return fail("bad_slot");
    if (!isSealed(body.sealed)) return fail("bad_value");
    const expected = body.expected ?? null;
    if (expected !== null && !isTimestamp(expected)) return fail("bad_request");
    return { ok: true, req: { action, slot: body.slot, sealed: body.sealed, expected } };
  }
  if (action === "import") {
    if (!Array.isArray(body.entries)) return fail("bad_request");
    if (body.entries.length > IMPORT_MAX) return fail("too_many");
    const entries: SealedEntry[] = [];
    for (const e of body.entries) {
      if (!isObj(e) || !isPortalSlot(e.slot)) return fail("bad_slot");
      if (!isSealed(e.sealed)) return fail("bad_value");
      if (!entries.some((x) => x.slot === e.slot)) entries.push({ slot: e.slot, sealed: e.sealed });
    }
    return { ok: true, req: { action, entries } };
  }
  return fail("bad_request");
}
