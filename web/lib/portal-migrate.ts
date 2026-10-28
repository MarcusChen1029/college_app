// Moving saved portal passwords into the encrypted store (portal_passwords, migration 0040): plaintext ones from
// student_colleges.portal_password and the password keys inside student_profiles.portals ("migrate"), and ones a
// browser saved before sign-in ("import"). Pure decisions only; the server (portal-vault-server.ts) and
// scripts/backfill-portal-passwords.mjs do the reading and writing. The rule both follow: a plaintext value is
// removed only once the store holds a copy that opens with the current key to that same value (an existing row, or a
// new row read back and opened), and only with a compare-and-set on the exact value that was read. Two different
// values are never resolved silently, and a row sealed under another key is never trusted or overwritten.

import { collegeSlot, isPortalSlot, PASSWORD_MAX, portalSlot, type SlotPassword } from "./portal-slots.ts";

/** Where a plaintext password sits, so it is removed there and nowhere else. */
export type PlainAt =
  | { table: "college"; id: string }
  | { table: "profile"; group: "systems" | "campuses"; key: string }
  | { table: "profile"; group: "custom"; id: string };
/** One plaintext password. `slot` is null when the site can't place it (bad key or id, over 512 characters, not text). */
export type PlainValue = { slot: string | null; password: string; at: PlainAt };
export type CollegePlainRow = { id: string; institution_id: string | null; custom: unknown; portal_password: string | null };
/** updated_at (server reads only) lets a replacement check the row is unchanged without putting `sealed` in a URL. */
export type VaultRow = { slot: string; sealed: string; updated_at?: string };
/** The password a stored row holds, or null when it doesn't open with the current key. */
export type Opener = (slot: string, sealed: string) => string | null;
/**
 * How the running deployment reads stored rows: `open` as above; `ours` = the row names this key's id (a row naming
 * another key id is foreign: it may well open elsewhere, so it is never kept, overwritten or used to strip).
 */
export type VaultReader = { open: Opener; ours: (sealed: string) => boolean };

/** What to do with one value, given the store's row for its slot (if any). */
function againstRow(password: string, slot: string, sealed: string | undefined, r: VaultReader): "keep" | "seal" | "failed" | "new" {
  if (sealed === undefined) return "new";
  if (!r.ours(sealed)) return "failed"; // sealed under another key: leave both for a person
  const stored = r.open(slot, sealed);
  if (stored === null) return "seal"; // ours but broken (tampered): the plaintext is the only good copy
  return stored === password ? "keep" : "failed"; // two different values: no silent choice
}

type Loose = Record<string, unknown>;
const isObj = (v: unknown): v is Loose => !!v && typeof v === "object" && !Array.isArray(v);

/** Every non-empty plaintext password of one student: their college rows (as PostgREST returns them) and profile portals. */
export function plaintextIn(colleges: readonly CollegePlainRow[], portals: unknown): PlainValue[] {
  const out: PlainValue[] = [];
  const add = (slot: string | null, password: unknown, at: PlainAt) => {
    if (password === undefined || password === null || password === "") return;
    if (typeof password !== "string") out.push({ slot: null, password: "", at });
    else out.push({ slot: slot && isPortalSlot(slot) && password.length <= PASSWORD_MAX ? slot : null, password, at });
  };
  // Same slot as the site's collegeSlot(toEntry(row)): the row id for a custom college, else its institution_id.
  for (const c of colleges) add(collegeSlot({ custom: c.custom, rowId: c.id, institutionId: c.institution_id ?? "" }), c.portal_password, { table: "college", id: c.id });
  if (isObj(portals)) {
    for (const group of ["systems", "campuses"] as const) {
      const logins = portals[group];
      if (!isObj(logins)) continue;
      for (const [key, l] of Object.entries(logins)) if (isObj(l)) add(portalSlot(group === "systems" ? "system" : "campus", key), l.password, { table: "profile", group, key });
    }
    if (Array.isArray(portals.custom))
      for (const l of portals.custom) {
        if (!isObj(l)) continue;
        const id = typeof l.id === "string" ? l.id : "";
        add(id ? portalSlot("custom", id) : null, l.password, { table: "profile", group: "custom", id });
      }
  }
  return out;
}

export type MigrationPlan = { keep: PlainValue[]; seal: PlainValue[]; failed: PlainValue[] };

/**
 * For each plaintext value: `keep` when the store already has a row for its slot that opens to the same value (the
 * plaintext can go), `seal` when there is no row, or one of ours that doesn't open (it is written, then read back and
 * opened before anything is removed), `failed` when it can't be placed, when the store holds a different value or a
 * row sealed under another key, when a new slot would pass the account's cap (`room` new slots left), or when two
 * different plaintext values claim one slot. Failed values are never removed.
 */
export function planMigration(plain: readonly PlainValue[], vault: readonly VaultRow[], reader: VaultReader, room = Infinity): MigrationPlan {
  const rows = new Map(vault.map((r) => [r.slot, r.sealed]));
  const plan: MigrationPlan = { keep: [], seal: [], failed: [] };
  const sealing = new Map<string, string>();
  let left = room;
  for (const v of plain) {
    if (!v.slot) {
      plan.failed.push(v);
      continue;
    }
    const verdict = againstRow(v.password, v.slot, rows.get(v.slot), reader);
    if (verdict === "keep" || verdict === "failed") {
      plan[verdict].push(v);
      continue;
    }
    const prev = sealing.get(v.slot);
    if (prev !== undefined) {
      // One copy covers the same value twice; two different values for one slot wait for a person.
      (prev === v.password ? plan.seal : plan.failed).push(v);
      continue;
    }
    if (verdict === "new" && left <= 0) {
      plan.failed.push(v);
      continue;
    }
    if (verdict === "new") left--;
    sealing.set(v.slot, v.password);
    plan.seal.push(v);
  }
  return plan;
}

/** The rows to write for a plan's `seal` list, one per slot. */
export function sealOnce<T extends { slot: string | null; password: string }>(seal: readonly T[]): SlotPassword[] {
  const out = new Map<string, string>();
  for (const v of seal) if (v.slot && !out.has(v.slot)) out.set(v.slot, v.password);
  return [...out].map(([slot, password]) => ({ slot, password }));
}

/** The values whose row, read back after writing, opens to exactly that value. */
export function verifiedCopies<T extends { slot: string | null; password: string }>(seal: readonly T[], readBack: ReadonlyMap<string, string>, open: Opener): T[] {
  return seal.filter((v) => {
    const slot = v.slot;
    const sealed = slot === null ? undefined : readBack.get(slot);
    return slot !== null && sealed !== undefined && open(slot, sealed) === v.password;
  });
}

/**
 * The portals jsonb with the password removed where it was copied: at each given place, and only while the value
 * there is still exactly the one copied (two custom entries sharing an id keep any other value). Everything else as
 * it was.
 */
export function withoutPasswordsAt(portals: unknown, copied: readonly { at: PlainAt; password: string }[]): unknown {
  if (!isObj(portals)) return portals;
  const out: Loose = { ...portals };
  const drop = (l: unknown, values: ReadonlySet<string> | undefined) => {
    if (!isObj(l) || !values || typeof l.password !== "string" || !values.has(l.password)) return l;
    const copy = { ...l };
    delete copy.password;
    return copy;
  };
  const valuesAt = (match: (a: PlainAt) => string | null) => {
    const m = new Map<string, Set<string>>();
    for (const c of copied) {
      const k = match(c.at);
      if (k !== null) m.set(k, (m.get(k) ?? new Set()).add(c.password));
    }
    return m;
  };
  for (const group of ["systems", "campuses"] as const) {
    const byKey = valuesAt((a) => (a.table === "profile" && a.group === group ? a.key : null));
    const logins = portals[group];
    if (byKey.size && isObj(logins)) out[group] = Object.fromEntries(Object.entries(logins).map(([k, l]) => [k, drop(l, byKey.get(k))]));
  }
  const byId = valuesAt((a) => (a.table === "profile" && a.group === "custom" && a.id ? a.id : null));
  if (byId.size && Array.isArray(portals.custom))
    out.custom = portals.custom.map((l) => (isObj(l) && typeof l.id === "string" ? drop(l, byId.get(l.id)) : l));
  return out;
}

export type ImportPlan = { keep: SlotPassword[]; seal: SlotPassword[]; failed: SlotPassword[] };

/**
 * Passwords a browser saved before sign-in: `keep` when the account already has a row for the slot that opens to the
 * same value, `seal` when it has none (room permitting) or one of ours that doesn't open, `failed` past the cap, when
 * the account holds a different value, or a row sealed under another key. The browser drops only what comes back as
 * kept or verified; failed ones stay in it.
 */
export function planImport(entries: readonly SlotPassword[], vault: readonly VaultRow[], reader: VaultReader, room: number): ImportPlan {
  const rows = new Map(vault.map((r) => [r.slot, r.sealed]));
  const plan: ImportPlan = { keep: [], seal: [], failed: [] };
  let left = room;
  for (const e of entries) {
    const verdict = againstRow(e.password, e.slot, rows.get(e.slot), reader);
    if (verdict !== "new") plan[verdict].push(e);
    else if (left > 0) {
      left--;
      plan.seal.push(e);
    } else plan.failed.push(e);
  }
  return plan;
}
