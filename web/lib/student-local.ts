// The signed-out copy in localStorage ("college-tracker:v1"), as the browser store (student-store.ts) saves and loads
// it. Pure so it can be tested. The site never stores a new password in the browser. Passwords an older build left
// in a stored copy are not dropped either: before the copy is rewritten without them they move, unchanged, to their
// own key (LEGACY_KEY), and stay there until they are imported into the encrypted store (portal_passwords, migration
// 0040) after sign-in, or the student removes them ("Don't add", "Remove from this browser").

import type { StudentProfile } from "./fit.ts";
import { isPortalSlot, PASSWORD_MAX, passwordsIn, portalWithoutPassword, withoutPasswords, type SlotPassword } from "./portal-slots.ts";
import type { Recommender } from "./recommenders.ts";
import type { Scholarship } from "./scholarships.ts";
import type { ListEntry } from "./student-rows.ts";
import type { TranscriptCourse, TranscriptSchool } from "./transcript.ts";

export type LocalData = {
  profile: StudentProfile;
  list: ListEntry[];
  recommenders: Recommender[];
  scholarships: Scholarship[];
  transcriptSchools: TranscriptSchool[];
  transcriptCourses: TranscriptCourse[];
};
export const EMPTY_LOCAL: LocalData = { profile: {}, list: [], recommenders: [], scholarships: [], transcriptSchools: [], transcriptCourses: [] };

const cleanProfile = (p: StudentProfile): StudentProfile => (p.portals ? { ...p, portals: withoutPasswords(p.portals) } : p);
const cleanList = (list: ListEntry[]): ListEntry[] => list.map((e) => ({ ...e, portal: portalWithoutPassword(e.portal) }));

/** The JSON to store: the data with every password taken out (profile portals and each list entry's portal). */
export function serializeLocal(d: LocalData): string {
  return JSON.stringify({
    profile: cleanProfile(d.profile),
    list: cleanList(d.list),
    recommenders: d.recommenders,
    scholarships: d.scholarships,
    transcriptSchools: d.transcriptSchools,
    transcriptCourses: d.transcriptCourses,
  });
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Where an older build's passwords wait (as [{ slot, password }]) once the main copy has been rewritten without them. */
export const LEGACY_KEY = "college-tracker:v1:legacy-passwords";

/** The passwords under LEGACY_KEY; malformed entries are dropped. */
export function parseLegacy(raw: string | null): SlotPassword[] {
  if (!raw) return [];
  try {
    return arr<Record<string, unknown>>(JSON.parse(raw)).flatMap((e) =>
      e && isPortalSlot(e.slot) && typeof e.password === "string" && e.password && e.password.length <= PASSWORD_MAX ? [{ slot: e.slot, password: e.password }] : [],
    );
  } catch {
    return [];
  }
}

/** What to store under LEGACY_KEY; null = remove the key. */
export const serializeLegacy = (passwords: readonly SlotPassword[]): string | null =>
  passwords.length ? JSON.stringify(passwords.map((p) => ({ slot: p.slot, password: p.password }))) : null;

/**
 * Where the student's agreement to move browser passwords into the vault waits for the vault to open: the account and
 * the slots, never a password (those stay under LEGACY_KEY). It outlives a reload, so a reload before the first unlock
 * does not lose the agreement or make the sign-in dialog ask again.
 */
export const MOVE_KEY = "college-tracker:v1:legacy-move";
export type MoveAgreement = { userId: string; slots: string[] };

/** The agreement under MOVE_KEY; null for nothing, a malformed value or no valid slot. Invalid and repeated slots are dropped. */
export function parseMove(raw: string | null): MoveAgreement | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object" || Array.isArray(v)) return null;
    const { userId, slots } = v as Record<string, unknown>;
    if (typeof userId !== "string" || !userId || userId.length > 100 || !Array.isArray(slots)) return null;
    const valid = [...new Set(slots.filter((s): s is string => typeof s === "string" && isPortalSlot(s)))];
    return valid.length ? { userId, slots: valid } : null;
  } catch {
    return null;
  }
}

/** What to store under MOVE_KEY; null = remove the key. */
export const serializeMove = (m: MoveAgreement | null): string | null => (m && m.slots.length ? JSON.stringify({ userId: m.userId, slots: m.slots }) : null);

/** The first password per slot. */
const unique = (list: readonly SlotPassword[]) => list.filter((p, i) => list.findIndex((q) => q.slot === p.slot) === i);

/**
 * Reads a stored copy: `data` without any password, and `passwords` (by slot) that an older build saved, whether
 * still inside the copy (`inCopy`: the copy should be rewritten without them, after they are under LEGACY_KEY) or
 * already moved to LEGACY_KEY.
 */
export function parseLocal(raw: string | null, rawLegacy: string | null = null): { data: LocalData; passwords: SlotPassword[]; inCopy: boolean } {
  const legacy = parseLegacy(rawLegacy);
  if (!raw) return { data: EMPTY_LOCAL, passwords: legacy, inCopy: false };
  try {
    const parsed = JSON.parse(raw);
    const profile: StudentProfile = parsed?.profile && typeof parsed.profile === "object" && !Array.isArray(parsed.profile) ? parsed.profile : {};
    // v1 entries predate institutionId/checklist; keep what we can.
    const list = arr<Partial<ListEntry>>(parsed?.list).map((e) => ({ checklist: {}, institutionId: "", ...e }) as ListEntry);
    const inCopy = passwordsIn(profile.portals, list);
    return {
      inCopy: inCopy.length > 0,
      data: {
        profile: cleanProfile(profile),
        list: cleanList(list),
        recommenders: arr(parsed.recommenders),
        scholarships: arr(parsed.scholarships),
        transcriptSchools: arr(parsed.transcriptSchools),
        transcriptCourses: arr(parsed.transcriptCourses),
      },
      passwords: unique([...inCopy, ...legacy]),
    };
  } catch {
    return { data: EMPTY_LOCAL, passwords: legacy, inCopy: false };
  }
}

/**
 * The two values a save writes: `copy` (the data, no password) for the main key, and `legacy` for LEGACY_KEY (null =
 * remove it). `legacy` holds only the passwords given, which the store only ever has from storage itself, so a save
 * keeps every old password and never adds one. Write `legacy` first: then a failed write can't lose a password.
 */
export function localWrites(d: LocalData, legacyPasswords: readonly SlotPassword[]): { copy: string; legacy: string | null } {
  return { copy: serializeLocal(d), legacy: serializeLegacy(unique(legacyPasswords)) };
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === "" || (typeof v === "object" && Object.keys(v as object).length === 0);

/**
 * The account's profile plus the fields it doesn't have yet from the copy saved in this browser (a field counts as
 * missing when it is unset, empty text, an empty list or an empty object). Whatever the account holds wins; false and
 * 0 are values. `portals` is left to mergePortals.
 */
export function fillMissingProfile(account: StudentProfile, local: StudentProfile): StudentProfile {
  const out: Record<string, unknown> = { ...account };
  for (const [k, v] of Object.entries(local)) if (k !== "portals" && isEmpty(out[k]) && !isEmpty(v)) out[k] = v;
  return out as StudentProfile;
}

/** True when the profile holds something (empty arrays and objects, false and null don't count). */
export const profileHasData = (p: StudentProfile) =>
  Object.values(p).some((v) => v != null && v !== false && !(typeof v === "object" && Object.keys(v).length === 0));

/** True when the copy holds anything worth offering to an account at sign-in. */
export function hasLocalData(d: LocalData, passwords: readonly SlotPassword[]): boolean {
  return profileHasData(d.profile) || passwords.length > 0 || [d.list, d.recommenders, d.scholarships, d.transcriptSchools, d.transcriptCourses].some((x) => x.length > 0);
}
