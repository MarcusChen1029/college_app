// Moving saved portal passwords into the encrypted store (portal_passwords, migration 0038): plaintext ones from
// student_colleges.portal_password and the password keys inside student_profiles.portals ("migrate"), and ones a
// browser saved before sign-in ("import"). Pure decisions only; the server (portal-vault-server.ts) and
// scripts/backfill-portal-passwords.mjs do the reading and writing. The rule both follow: a plaintext value is
// removed only once the store holds a copy that opens with the current key (an existing row that opens, or a new row
// read back and opened to the same value), and only with a compare-and-set on the exact value that was read.

import { collegeSlot, isPortalSlot, PASSWORD_MAX, portalSlot, type SlotPassword } from "./portal-slots.ts";

/** Where a plaintext password sits, so it is removed there and nowhere else. */
export type PlainAt =
  | { table: "college"; id: string }
  | { table: "profile"; group: "systems" | "campuses"; key: string }
  | { table: "profile"; group: "custom"; id: string };
/** One plaintext password. `slot` is null when the site can't place it (bad key or id, over 512 characters, not text). */
export type PlainValue = { slot: string | null; password: string; at: PlainAt };
export type CollegePlainRow = { id: string; institution_id: string | null; custom: unknown; portal_password: string | null };
export type VaultRow = { slot: string; sealed: string };
/** The password a stored row holds, or null when it doesn't open with the current key. */
export type Opener = (slot: string, sealed: string) => string | null;

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
 * For each plaintext value: `keep` when the store already has a row for its slot that opens (the stored value wins;
 * the plaintext can go), `seal` when there is no row or the row doesn't open (it is written, then read back and
 * opened before anything is removed), `failed` when it can't be placed, when a new slot would pass the account's cap
 * (`room` new slots left), or when two different values claim one slot. Failed values are never removed.
 */
export function planMigration(plain: readonly PlainValue[], vault: readonly VaultRow[], open: Opener, room = Infinity): MigrationPlan {
  const rows = new Map(vault.map((r) => [r.slot, r.sealed]));
  const plan: MigrationPlan = { keep: [], seal: [], failed: [] };
  const sealing = new Map<string, string>();
  let left = room;
  for (const v of plain) {
    if (!v.slot) {
      plan.failed.push(v);
      continue;
    }
    const sealed = rows.get(v.slot);
    if (sealed !== undefined && open(v.slot, sealed) !== null) {
      plan.keep.push(v);
      continue;
    }
    const prev = sealing.get(v.slot);
    if (prev !== undefined) {
      // One copy covers the same value twice; two different values for one slot wait for a person.
      (prev === v.password ? plan.seal : plan.failed).push(v);
      continue;
    }
    if (sealed === undefined && left <= 0) {
      plan.failed.push(v);
      continue;
    }
    if (sealed === undefined) left--;
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

/** The portals jsonb with the password removed at exactly these places; everything else as it was. */
export function withoutPasswordsAt(portals: unknown, at: readonly PlainAt[]): unknown {
  if (!isObj(portals)) return portals;
  const out: Loose = { ...portals };
  const drop = (l: unknown) => {
    if (!isObj(l)) return l;
    const copy = { ...l };
    delete copy.password;
    return copy;
  };
  for (const group of ["systems", "campuses"] as const) {
    const keys = new Set(at.flatMap((a) => (a.table === "profile" && a.group === group ? [a.key] : [])));
    const logins = portals[group];
    if (keys.size && isObj(logins)) out[group] = Object.fromEntries(Object.entries(logins).map(([k, l]) => [k, keys.has(k) ? drop(l) : l]));
  }
  const ids = new Set(at.flatMap((a) => (a.table === "profile" && a.group === "custom" && a.id ? [a.id] : [])));
  if (ids.size && Array.isArray(portals.custom)) out.custom = portals.custom.map((l) => (isObj(l) && typeof l.id === "string" && ids.has(l.id) ? drop(l) : l));
  return out;
}

export type ImportPlan = { keep: SlotPassword[]; seal: SlotPassword[]; failed: SlotPassword[] };

/**
 * Passwords a browser saved before sign-in: `keep` when the account already has a row for the slot that opens (the
 * account's value wins), `seal` when it has none or one that doesn't open, `failed` past the cap. The browser drops
 * only what comes back as kept or verified; failed ones stay in it for another try.
 */
export function planImport(entries: readonly SlotPassword[], vault: readonly VaultRow[], open: Opener, room: number): ImportPlan {
  const rows = new Map(vault.map((r) => [r.slot, r.sealed]));
  const plan: ImportPlan = { keep: [], seal: [], failed: [] };
  let left = room;
  for (const e of entries) {
    const sealed = rows.get(e.slot);
    if (sealed !== undefined && open(e.slot, sealed) !== null) plan.keep.push(e);
    else if (sealed !== undefined) plan.seal.push(e);
    else if (left > 0) {
      left--;
      plan.seal.push(e);
    } else plan.failed.push(e);
  }
  return plan;
}
