import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { getT } from "@/lib/i18n/server";
import { getEnglishSummaries, getLookups, getProgramFees, getSatEstimates, getSummaries } from "@/lib/data";
import completions from "@/lib/data/field-completions.json";
import { buildEvidence, type FieldCompletions, type FieldEvidence } from "@/lib/field-match";

export const metadata = { title: "Colleges" };

async function Explorer() {
  const [colleges, lookups, english, satEstimates, programFees] = await Promise.all([
    getSummaries(),
    getLookups(),
    getEnglishSummaries(),
    getSatEstimates(),
    getProgramFees(),
  ]);
  // The IPEDS file stays on the server: only the compact evidence for the field filter goes to the browser (as on /tools/match).
  const evidence: Record<string, FieldEvidence> = {};
  for (const c of colleges) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    if (ev) evidence[c.slug] = ev;
  }
  return <CollegeExplorer colleges={colleges} lookups={lookups} english={english} satEstimates={satEstimates} programFees={programFees} evidence={evidence} />;
}

// Reads the language cookie, so it renders inside Suspense.
async function Heading() {
  const t = await getT();
  return <h1 className="sr-only">{t("colleges.heading")}</h1>;
}

export default function CollegesPage() {
  return (
    <>
      <Suspense fallback={<h1 className="sr-only">Colleges</h1>}>
        <Heading />
      </Suspense>
      <Suspense fallback={<div className="h-[70dvh] animate-pulse rounded-3xl bg-blue-50" />}>
        <Explorer />
      </Suspense>
    </>
  );
}
