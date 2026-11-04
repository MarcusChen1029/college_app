import { Suspense } from "react";
import { RecommendersPage } from "@/components/RecommendersPage";
import { getDeadlines, getSummaries } from "@/lib/data";

export const metadata = { title: "Recommenders" };

// The teacher brief needs each listed college's name and application dates; send only those fields to the browser.
async function Data() {
  const [colleges, deadlines] = await Promise.all([getSummaries(), getDeadlines()]);
  return (
    <RecommendersPage
      colleges={colleges.map((c) => ({ slug: c.slug, id: c.id, name: c.short_name ?? c.name }))}
      deadlines={deadlines
        .filter((d) => d.kind === "application")
        .map((d) => ({ id: d.id, institution_id: d.institution_id, kind: d.kind, plan_key: d.plan_key, label: d.label, due_date: d.due_date, program_id: d.program_id ?? null, intake: d.intake ?? null }))}
    />
  );
}

export default function RecommendersRoute() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
      <Data />
    </Suspense>
  );
}
