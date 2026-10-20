import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { getEnglishSummaries, getLookups, getSatEstimates, getSummaries } from "@/lib/data";

export const metadata = { title: "Colleges" };

async function Explorer() {
  const [colleges, lookups, english, satEstimates] = await Promise.all([getSummaries(), getLookups(), getEnglishSummaries(), getSatEstimates()]);
  return <CollegeExplorer colleges={colleges} lookups={lookups} english={english} satEstimates={satEstimates} />;
}

export default function CollegesPage() {
  return (
    <>
      <h1 className="sr-only">Colleges</h1>
      <Suspense fallback={<div className="h-[70dvh] animate-pulse rounded-3xl bg-blue-50" />}>
        <Explorer />
      </Suspense>
    </>
  );
}
