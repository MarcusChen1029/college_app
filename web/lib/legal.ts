// Who runs the site, how to reach them, and when the legal pages last changed.
// Shown on /privacy, /terms, /security and /contact. Pure; safe to import anywhere.
//
// null = not published yet. The pages then say the name / address is coming instead of printing a blank.
// Fill these in before asking Google to verify the OAuth app (it checks the privacy policy names who runs the site).

/** The operator's name as it should appear on the legal pages (a person's name, or a company once one is registered). */
export const OPERATOR_NAME: string | null = null;

/** Where people write for privacy, deletion and security requests. */
export const CONTACT_EMAIL: string | null = null;

/** Change this whenever the wording of /privacy, /terms or /security changes. */
export const LEGAL_UPDATED = { year: 2026, month: 10, day: 29 } as const;

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "October 29, 2026" / "2026 年 10 月 29 日". Built by hand so it never reads the clock. */
export function legalDate(locale: string, d: { year: number; month: number; day: number } = LEGAL_UPDATED): string {
  return locale === "zh-TW" ? `${d.year} 年 ${d.month} 月 ${d.day} 日` : `${EN_MONTHS[d.month - 1]} ${d.day}, ${d.year}`;
}
