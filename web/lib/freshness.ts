// How fresh a college's data is, as one date: the latest day any of its sources was opened and read
// (`sources.accessed_on`). Pure, so the college page, the signed-in AI tools and the public connector share it.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The latest `accessed_on` among the sources (ISO days sort as text), or null when none has a usable date. */
export function lastChecked(sources: readonly { accessed_on: string | null | undefined }[]): string | null {
  let latest: string | null = null;
  for (const s of sources) {
    const day = s.accessed_on;
    if (typeof day === "string" && ISO_DAY.test(day) && (latest === null || day > latest)) latest = day;
  }
  return latest;
}

/** The header line the AI tools put above a college's details, or null when there is no date to state. */
export function lastCheckedLine(date: string | null): string | null {
  return date ? `Last checked: ${date} (latest source access date).` : null;
}
