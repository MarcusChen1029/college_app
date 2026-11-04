/**
 * The student's citizenship (student_profiles.citizenship): optional, and used only to decide which visa steps the
 * UK / Canada / Australia after-offer checklists show. Never shown to teachers, parents or the AI views.
 * A short list of the places this site's students mostly come from, plus "ZZ" for any other country; only
 * GB / CA / AU equality matters to the checklist rules. "UK" is not a code here: the United Kingdom is "GB".
 */
export const CITIZENSHIP_OPTIONS = ["TW", "HK", "MO", "CN", "US", "GB", "CA", "AU", "ZZ"] as const;
export type Citizenship = (typeof CITIZENSHIP_OPTIONS)[number];

/** A stored or typed value as a citizenship code: exactly one of CITIZENSHIP_OPTIONS, else null. */
export const normalCitizenship = (v: unknown): Citizenship | null =>
  typeof v === "string" && (CITIZENSHIP_OPTIONS as readonly string[]).includes(v) ? (v as Citizenship) : null;
