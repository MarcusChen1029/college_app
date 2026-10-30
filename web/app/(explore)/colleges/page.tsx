import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { applyTagsBySlug } from "@/lib/apply-tags";
import { getAppFees, getDeadlines, getEnglishSummaries, getLookups, getProgramFees, getSatEstimates, getSummaries } from "@/lib/data";
import { collegeSupplements } from "@/lib/supplements-data";
import completions from "@/lib/data/field-completions.json";
import { buildEvidence, type FieldCompletions, type FieldEvidence } from "@/lib/field-match";
import { forExplorer, narrowFlags, type DeadlineRow } from "@/lib/explore-filters";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/colleges");

/** Today in UTC (only a stand-in while the page hydrates) and two days back (older deadlines can't be next in any time zone). */
function serverDates() {
  const now = Date.now();
  return { today: new Date(now).toISOString().slice(0, 10), floor: new Date(now - 2 * 86_400_000).toISOString().slice(0, 10) };
}

async function Explorer() {
  const [colleges, lookups, english, satEstimates, programFees, appFees, deadlines] = await Promise.all([
    getSummaries(),
    getLookups(),
    getEnglishSummaries(),
    getSatEstimates(),
    getProgramFees(),
    getAppFees(),
    getDeadlines(),
  ]);
  // The "when" lens: each college's published application deadlines for a plan (EA, ED, RD…), as [date, plan, narrow] rows.
  // Plan-less rows are left out (they are program or applicant-group dates: nursing, international-only), and so is anything
  // computed. Rows whose label limits them to some applicants, a program or another intake are flagged narrow, judged with
  // the college's other rows (lib/explore-filters.ts narrowFlags), and never become its next deadline. The browser picks the
  // next one from the reader's own today; anything two or more days past here can't be next anywhere.
  const { today, floor } = serverDates();
  const byCollege = new Map<string, (typeof deadlines)[number][]>();
  for (const d of deadlines) {
    if (d.kind !== "application" || !d.plan_key || !d.due_date) continue;
    const list = byCollege.get(d.institution_id);
    if (list) list.push(d);
    else byCollege.set(d.institution_id, [d]);
  }
  const appDeadlines: Record<string, DeadlineRow[]> = {};
  for (const [id, rows] of byCollege) {
    const narrow = narrowFlags(rows.map((d) => d.label));
    const kept: DeadlineRow[] = [];
    rows.forEach((d, i) => {
      if (d.due_date! >= floor) kept.push([d.due_date!, d.plan_key!, narrow[i] ? 1 : 0]);
    });
    if (kept.length) appDeadlines[id] = kept;
  }
  // Only the tags go to the browser, not the supplements file.
  const applyTags = applyTagsBySlug(colleges, collegeSupplements, appFees);
  // The IPEDS file stays on the server: only the compact evidence for the field filter goes to the browser (as on /tools/match).
  const evidence: Record<string, FieldEvidence> = {};
  for (const c of colleges) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    if (ev) evidence[c.slug] = ev;
  }
  // The explorer renders the page's h1 in its title row (in the reader's language).
  return (
    <CollegeExplorer
      colleges={colleges.map(forExplorer)}
      lookups={lookups}
      english={english}
      satEstimates={satEstimates}
      programFees={programFees}
      evidence={evidence}
      applyTags={applyTags}
      appDeadlines={appDeadlines}
      serverToday={today}
    />
  );
}

export default function CollegesPage() {
  return (
    <Suspense
      fallback={
        <>
          <h1 className="sr-only">Colleges</h1>
          <div className="h-[70dvh] animate-pulse rounded-2xl bg-zinc-50" />
        </>
      }
    >
      <Explorer />
    </Suspense>
  );
}
