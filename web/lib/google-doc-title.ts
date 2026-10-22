// Kept apart from google-docs.ts (node:crypto) so the Essays page can import it in the browser.

/** "<College short name> – <essay title or 'Essay N'>", e.g. "Brown – Why Brown?". `index` is 0-based. */
export function docTitle(college: { name: string; short_name: string | null }, essayTitle: string, index: number): string {
  const school = (college.short_name ?? "").trim() || college.name.trim();
  const essay = essayTitle.replace(/\s+/g, " ").trim() || `Essay ${index + 1}`;
  return `${school} – ${essay}`;
}
