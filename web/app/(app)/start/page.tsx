import { Suspense } from "react";
import { StartSkeleton, StartWizard } from "@/components/StartWizard";
import { PageMark } from "@/components/start/PageMark";
import type { StartCollege } from "@/components/start/start-preview";
import { getDeadlines, getSummaries } from "@/lib/data";
import { REGIONS, type RegionCode } from "@/lib/regions";

export const metadata = { title: "Get started" };

const num = (v: number | null) => (v == null ? null : Number(v));

// The first screen after the home page's "Build my list": the same printed stationery on the home page's sky ground
// (the band is the page's <main>, coloured by the Start/Help block in globals.css). The wizard is a ticket being
// filled in; beside it the student's list prints itself from the real colleges as they answer.
// data-start-flow trims the header and footer while the wizard is on screen; PageMark takes it off when the visitor leaves.
const MARKS = ["data-start-page", "data-start-flow"] as const;

export default function StartPage() {
  return (
    <PageMark marks={MARKS} className="pb-4 sm:pt-4">
      <Suspense fallback={<StartSkeleton />}>
        <StartData />
      </Suspense>
    </PageMark>
  );
}

async function StartData() {
  const [colleges, deadlines] = await Promise.all([getSummaries(), getDeadlines()]);
  const today = new Date().toISOString().slice(0, 10);

  // Each college's next application deadline from today.
  const next = new Map<string, { date: string; plan: string }>();
  for (const d of deadlines) {
    if (d.kind !== "application" || !d.plan_key || d.due_date == null || d.due_date < today) continue;
    const cur = next.get(d.institution_id);
    if (!cur || d.due_date < cur.date) next.set(d.institution_id, { date: d.due_date, plan: d.plan_key });
  }

  // Fit labels exist for US colleges only (lib/fit.ts); the rest are counted for the regions step.
  const pool: StartCollege[] = colleges
    .filter((c) => c.country_code === "US")
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.short_name ?? c.name,
      place: [c.city, c.state_region].filter(Boolean).join(", "),
      applicants: num(c.applicants),
      admit_rate: num(c.admit_rate),
      intl_admit_rate: num(c.intl_admit_rate),
      sat_p25: num(c.sat_p25),
      sat_p75: num(c.sat_p75),
      act_p25: num(c.act_p25),
      act_p75: num(c.act_p75),
      test_policy: c.test_policy,
      next: next.get(c.id) ?? null,
    }));
  const regionCounts = Object.fromEntries(REGIONS.map((r) => [r.code, colleges.filter((c) => c.country_code === r.code).length])) as Record<RegionCode, number>;

  return <StartWizard pool={pool} regionCounts={regionCounts} total={colleges.length} />;
}
