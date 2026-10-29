import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { applyTagsBySlug } from "@/lib/apply-tags";
import { getAppFees, getEnglishSummaries, getLookups, getProgramFees, getSatEstimates, getSummaries } from "@/lib/data";
import { collegeSupplements } from "@/lib/supplements-data";
import completions from "@/lib/data/field-completions.json";
import { buildEvidence, type FieldCompletions, type FieldEvidence } from "@/lib/field-match";

export const metadata = { title: "Colleges" };

async function Explorer() {
  const [colleges, lookups, english, satEstimates, programFees, appFees] = await Promise.all([
    getSummaries(),
    getLookups(),
    getEnglishSummaries(),
    getSatEstimates(),
    getProgramFees(),
    getAppFees(),
  ]);
  // Only the tags go to the browser, not the supplements file.
  const applyTags = applyTagsBySlug(colleges, collegeSupplements, appFees);
  // The IPEDS file stays on the server: only the compact evidence for the field filter goes to the browser (as on /tools/match).
  const evidence: Record<string, FieldEvidence> = {};
  for (const c of colleges) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    if (ev) evidence[c.slug] = ev;
  }
  // The explorer renders the page's h1 in its title row (in the reader's language).
  return <CollegeExplorer colleges={colleges} lookups={lookups} english={english} satEstimates={satEstimates} programFees={programFees} evidence={evidence} applyTags={applyTags} />;
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
