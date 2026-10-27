// Kept apart from google-docs.ts (node:crypto) so the Essays page can import it in the browser.

/** "<College short name>_<essay number>", e.g. "Brown_1". `index` is the essay's 0-based position. */
export function docTitle(college: { name: string; short_name: string | null }, _essayTitle: string, index: number): string {
  const school = (college.short_name ?? "").trim() || college.name.trim();
  return `${school}_${index + 1}`;
}

/** A college prompt's doc: "<College short name>_<prompt title>", e.g. "Purdue_Why this major". */
export function slotDocTitle(college: { name: string; short_name: string | null }, promptTitle: string): string {
  const school = (college.short_name ?? "").trim() || college.name.trim();
  return `${school}_${promptTitle}`;
}
