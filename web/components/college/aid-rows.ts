// Can an international applicant use this financial-aid deadline? Pure (no React), so the college page and its tests
// (lib/college-aid-rows.test.ts) share one rule. Rows here are deadlines of kind "financial_aid" (need-based aid forms);
// merit scholarships are kind "scholarship" and never reach this check. A row is "not for international applicants" when:
//  - the college gives internationals no institutional aid ("none"), or merit aid only ("merit_only");
//  - or a clause of its note limits it to US citizens / permanent residents ("... only", "Applies to US citizens",
//    "(US citizens ...)"), unless that clause limits only the FAFSA in a row that also asks for the CSS Profile or IDOC;
//  - or the row is the FAFSA alone (US federal aid).
// It stays live when its title or a clause of its note says it is for international applicants or for all applicants,
// with no negation in that clause ("international students are not eligible" does not count) and with "all applicants"
// not narrowed to US applicants ("all applicants (US citizens and permanent residents)" is US-only).
const NON_FAFSA_FORM = /\b(CSS(\s+Profile)?|IDOC|ISAFA)\b/i;
const US_PEOPLE = /\b(U\.?S\.?\s+(citizens?|residents?)|permanent residents?|eligible non-?citizens?)\b/i;
const LIMITING = /\bonly\b|\bapplies to\b|\(\s*(U\.?S\.?|permanent|eligible)/i;
const NEGATION = /\b(not|no|never|cannot|can't|ineligible|isn't|aren't|except|excluding)\b/i;

/** Clauses: split at ";" and at sentence ends, never inside "U.S." or "Mar. 1". */
const clauses = (s: string) =>
  s
    .split(/;\s*|\.\s+(?=[A-Z])/)
    .map((x) => x.trim())
    .filter(Boolean);

function forEveryone(clause: string): boolean {
  if (NEGATION.test(clause)) return false;
  if (/\binternational\b/i.test(clause)) return true;
  const all = clause.match(/\ball applicants\b(.*)$/i);
  return !!all && !/^\s*\([^)]*\b(U\.?S\.?|permanent residents?|citizens?)\b/i.test(all[1]);
}

export function aidRowUsOnly(title: string, notes: string | null | undefined, intlAidPolicy: string | null | undefined): boolean {
  const note = notes ?? "";
  const text = `${title} ${note}`;
  if (intlAidPolicy === "none") return true;
  if ([title, ...clauses(note)].some(forEveryone)) return false;
  if (intlAidPolicy === "merit_only") return true;
  for (const clause of clauses(note)) {
    if (!US_PEOPLE.test(clause) || !LIMITING.test(clause)) continue;
    // "FAFSA only for U.S. citizens" inside a row that also asks for the CSS Profile limits the FAFSA, not the row.
    if (/\bFAFSA\b/i.test(clause) && !NON_FAFSA_FORM.test(clause) && NON_FAFSA_FORM.test(text.replace(clause, ""))) continue;
    return true;
  }
  return /\bFAFSA\b/i.test(title) && !NON_FAFSA_FORM.test(text);
}
