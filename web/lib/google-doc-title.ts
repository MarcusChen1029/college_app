// Kept apart from google-docs.ts (node:crypto) so the Essays page can import it in the browser.

/** "<College short name>_<essay number>", e.g. "Brown_1". `index` is the essay's 0-based position. */
export function docTitle(college: { name: string; short_name: string | null }, _essayTitle: string, index: number): string {
  const school = (college.short_name ?? "").trim() || college.name.trim();
  return `${school}_${index + 1}`;
}
