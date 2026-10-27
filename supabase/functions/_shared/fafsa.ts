// Twin of web/lib/deadline-rules.ts isFafsaOnly (the reminder function runs in Deno and can't import from web/).
// web/lib/deadline-rules.test.ts checks the two agree on every label in the data, so change both together.
// After editing, redeploy deadline-reminders (index.ts + this file + teacher-digest.ts).

const FAFSA_FAMILY = /\b(fafsa|wasfa|tasfa|orsaa|cadaa|dream act)\b/i;
const OTHER_FORM = /\b(css|idoc|isafa|scholarships?|institutional|international|noncustodial)\b/i;

/** True for an aid date that only concerns FAFSA (e.g. "FAFSA priority filing date"); "CSS Profile / FAFSA (RD)" is false. */
export function isFafsaOnly(label: string | null | undefined): boolean {
  if (!label) return false;
  return FAFSA_FAMILY.test(label) && !OTHER_FORM.test(label);
}
