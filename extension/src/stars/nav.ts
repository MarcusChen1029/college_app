// Finding a school year's coursework page on STARS without the student clicking there. Read live 2026-10-27:
// - Enter Schools (/srt/EnterSchools.aspx) has one `goStep('ceeb','<ceeb>')` link per school, titled "Enter Coursework taken at <name>".
// - The school's summary (/srt/SchoolSummary.aspx?sel_sender_ceeb=<ceeb>) has one `openCourseEntry('<ceeb>','<endYear>','<label>')` link per
//   school year, and the page's openCourseEntry() builds the address: `<course_url>?selCeeb=<ceeb>&yr=<endYear>&sel_sender_ceeb=<ceeb>`
//   plus `&gl=09`..`&gl=12` (or `&ms=Y`) from the label. course_url is its last `course_url = "..."` (US and international pages differ).
// Both pages are read with fetch (a plain GET, like opening them) so the tab only ever loads the coursework page itself.

export type StarsSchool = { ceeb: string; name: string };

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** The student's schools on STARS, from the Enter Schools page's HTML. */
export function starsSchools(html: string): StarsSchool[] {
  const out: StarsSchool[] = [];
  for (const a of html.matchAll(/<a\b[^>]*>/g)) {
    const tag = a[0];
    const ceeb = tag.match(/goStep\(\s*'ceeb'\s*,\s*'([^']+)'\s*\)/)?.[1];
    const name = tag.match(/title="Enter Coursework taken at ([^"]*)"/)?.[1];
    if (ceeb && name && !out.some((s) => s.ceeb === ceeb)) out.push({ ceeb, name: decode(name).trim() });
  }
  return out;
}

/** The school years STARS offers for `ceeb` on its summary page (end years: 2024 = 2023-24), each with its link label. */
export function starsYears(html: string, ceeb: string): { year: number; label: string }[] {
  const out: { year: number; label: string }[] = [];
  for (const m of html.matchAll(/openCourseEntry\(\s*'([^']+)'\s*,\s*'(\d{4})'\s*(?:,\s*'([^']*)')?\s*\)/g)) {
    if (m[1] !== ceeb || out.some((y) => y.year === Number(m[2]))) continue;
    out.push({ year: Number(m[2]), label: decode(m[3] ?? "") });
  }
  return out;
}

/** The coursework page address for one school year, as the summary page's own openCourseEntry() would open it; null when it can't tell. */
export function starsYearPath(html: string, ceeb: string, year: number): string | null {
  const y = starsYears(html, ceeb).find((x) => x.year === year);
  if (!y) return null;
  const start = html.search(/function\s+openCourseEntry\s*\(\s*ceeb\s*,\s*yr\s*,\s*ms\s*\)/);
  if (start < 0) return null;
  const end = html.indexOf("function ", start + 10);
  const body = html.slice(start, end < 0 ? undefined : end);
  const urls = [...body.matchAll(/course_url\s*=\s*"([A-Za-z0-9_.-]+\.aspx)"/g)];
  const page = urls[urls.length - 1]?.[1];
  // Only the in-page window (noWin = true) form is known; a popup form would need STARS's own window code.
  if (!page || !/noWin\s*=\s*true/.test(body)) return null;
  const ms = y.label.toUpperCase();
  const add = y.label === "Middle School" ? "&ms=Y" : ms.includes("9TH") ? "&gl=09" : ms.includes("10TH") ? "&gl=10" : ms.includes("11TH") ? "&gl=11" : ms.includes("12TH") ? "&gl=12" : "";
  const c = encodeURIComponent(ceeb);
  return `/srt/${page}?selCeeb=${c}&yr=${year}&sel_sender_ceeb=${c}${add}`;
}

export const starsSummaryPath = (ceeb: string) => `/srt/SchoolSummary.aspx?sel_sender_ceeb=${encodeURIComponent(ceeb)}`;
