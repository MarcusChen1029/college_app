// The signed-out copy in localStorage ("college-tracker:v1"), as the browser store (student-store.ts) saves and loads
// it. Pure so it can be tested. No password is ever written. Passwords an older build left in a stored copy come back
// separately from parseLocal, so the store keeps them in memory only and can import them into the encrypted store
// (portal_passwords, migration 0038) when the student signs in.

import type { StudentProfile } from "./fit.ts";
import { passwordsIn, portalWithoutPassword, withoutPasswords, type SlotPassword } from "./portal-slots.ts";
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

/** Reads a stored copy: `data` without any password, and `passwords` (by slot) that an older build saved in it. */
export function parseLocal(raw: string | null): { data: LocalData; passwords: SlotPassword[] } {
  if (!raw) return { data: EMPTY_LOCAL, passwords: [] };
  try {
    const parsed = JSON.parse(raw);
    const profile: StudentProfile = parsed?.profile && typeof parsed.profile === "object" && !Array.isArray(parsed.profile) ? parsed.profile : {};
    // v1 entries predate institutionId/checklist; keep what we can.
    const list = arr<Partial<ListEntry>>(parsed?.list).map((e) => ({ checklist: {}, institutionId: "", ...e }) as ListEntry);
    return {
      data: {
        profile: cleanProfile(profile),
        list: cleanList(list),
        recommenders: arr(parsed.recommenders),
        scholarships: arr(parsed.scholarships),
        transcriptSchools: arr(parsed.transcriptSchools),
        transcriptCourses: arr(parsed.transcriptCourses),
      },
      passwords: passwordsIn(profile.portals, list),
    };
  } catch {
    return { data: EMPTY_LOCAL, passwords: [] };
  }
}

/** True when the profile holds something (empty arrays and objects, false and null don't count). */
export const profileHasData = (p: StudentProfile) =>
  Object.values(p).some((v) => v != null && v !== false && !(typeof v === "object" && Object.keys(v).length === 0));

/** True when the copy holds anything worth offering to an account at sign-in. */
export function hasLocalData(d: LocalData, passwords: readonly SlotPassword[]): boolean {
  return profileHasData(d.profile) || passwords.length > 0 || [d.list, d.recommenders, d.scholarships, d.transcriptSchools, d.transcriptCourses].some((x) => x.length > 0);
}
