import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { detailSection } from "../ai-context";
import { lastChecked, lastCheckedLine, listedSources } from "../freshness";
import type { ListEntry } from "../student-rows";
import { collegeSupplements } from "../supplements-data";
import type { CollegeDetail, CollegeSummary, Lookups } from "../types";

// How a college is shown to an AI. Shared by the signed-in tools (tools.ts) and the public lookup connector
// (public-tools.ts), so both quote the same sourced facts the same way. Nothing here reads a student's data.

export const text = (t: string): CallToolResult => ({ content: [{ type: "text", text: t }] });
export const toolError = (message: string): CallToolResult => ({ isError: true, content: [{ type: "text", text: message }] });

export function findSummary(summaries: CollegeSummary[], slug: string) {
  return summaries.find((c) => c.slug === slug);
}

export const notFound = (slug: string) => toolError(`No college with slug "${slug}". Use search_colleges to find the right slug.`);

export const packLabels = (lookups: Lookups) => ({
  planLabels: Object.fromEntries(lookups.plans.map((p) => [p.key, p.label])),
  englishTestNames: Object.fromEntries(lookups.englishTests.map((t) => [t.key, t.name])),
});

/** A college record plus its supplemental prompts (static data), so detailSection can list them. */
export const withSupplements = (detail: CollegeDetail | null | undefined): CollegeDetail | null => (detail ? { ...detail, supplements: collegeSupplements(detail.slug) } : null);

/**
 * The newest source access date on a college's page: its database sources plus its supplement sources, the same set the
 * page's "Sources" list and "Last checked" line use. Null when the record is missing or no source has a usable date.
 */
export function collegeLastChecked(detail: CollegeDetail | null | undefined): string | null {
  const full = withSupplements(detail);
  return lastChecked(listedSources(full?.sources ?? [], full?.supplements?.sources));
}

/** detailSection ends with the student's own checklist; for a college that isn't listed that block would read as "nothing done". */
export function dropChecklist(lines: string[]) {
  const i = lines.findIndex((l) => l === "- My checklist:");
  if (i < 0) return lines;
  let j = i + 1;
  while (j < lines.length && lines[j].startsWith("  - ")) j++;
  return [...lines.slice(0, i), ...lines.slice(j)];
}

/**
 * One college's full sourced detail as Markdown, with the "last checked" line first. With a list `entry` the student's own checklist
 * block stays; without one (a college that isn't listed, or the public connector, which has no student) it is dropped.
 */
export function collegeDetailText(args: {
  college: CollegeSummary;
  detail: CollegeDetail | null | undefined;
  lookups: Lookups;
  entry?: Pick<ListEntry, "plan" | "status" | "checklist"> | null;
}): string {
  const { college, detail, lookups, entry } = args;
  const full = withSupplements(detail);
  const lines = detailSection(
    { college, plan: entry?.plan ?? null, status: entry?.status ?? "in_progress", checklist: entry?.checklist ?? {}, detail: full },
    packLabels(lookups),
  );
  // The checklist block only means something for a listed college.
  const out = entry ? lines : dropChecklist(lines);
  // The newest source access date goes first, so the AI can tell the student how current these numbers are. It covers the
  // same sources the answer cites: the database sources and the supplements sources.
  const checked = lastCheckedLine(collegeLastChecked(detail));
  return checked ? [checked, ...out].join("\n") : out.join("\n");
}

/** Colleges whose name, short name, slug or city contains `query` (case-insensitive; empty = all), optionally in one country. */
export function matchColleges(summaries: CollegeSummary[], query: string | undefined, region: string | undefined): CollegeSummary[] {
  const q = query?.trim().toLowerCase();
  return summaries.filter((c) => (!region || c.country_code === region) && (!q || [c.name, c.short_name, c.slug, c.city].some((v) => v?.toLowerCase().includes(q))));
}

/** One college as a search hit: public summary numbers, no student data. */
export const searchRow = (c: CollegeSummary) => ({
  slug: c.slug,
  name: c.name,
  location: [c.city, c.state_region, c.country_code].filter(Boolean).join(", "),
  admitRatePct: c.admit_rate,
  internationalAdmitRatePct: c.intl_admit_rate,
  sat25to75: c.sat_p25 != null && c.sat_p75 != null ? [c.sat_p25, c.sat_p75] : null,
  testPolicy: c.test_policy,
  generalTier: c.general_tier,
  tiers: c.tiers,
  applicationPlans: c.plans ?? [],
  nextDeadline: c.next_deadline,
});

/** "Showing the first N of M" when a search has more hits than it shows, else undefined. */
export const moreNote = (n: number, limit: number) => (n > limit ? `Showing the first ${limit} of ${n}. Narrow the search to see others.` : undefined);
