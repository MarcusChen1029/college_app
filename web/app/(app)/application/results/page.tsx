import { Suspense } from "react";
import { AidCompare } from "@/components/AidCompare";
import { ResultsList } from "@/components/ResultsList";
import { getLookups, getSummaries } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Results" };

async function Data() {
  const [colleges, lookups] = await Promise.all([getSummaries(), getLookups()]);
  return (
    <div className="space-y-8">
      <ResultsList colleges={colleges} plans={lookups.plans} />
      <AidCompare colleges={colleges} />
    </div>
  );
}

async function Intro() {
  const t = await getT();
  return <p className="text-sm text-zinc-500">{t("application.resultsIntro")}</p>;
}

export default function ResultsPage() {
  return (
    <div className="space-y-4">
      <Suspense fallback={null}>
        <Intro />
      </Suspense>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
