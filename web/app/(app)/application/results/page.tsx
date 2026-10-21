import { Suspense } from "react";
import { ResultsList } from "@/components/ResultsList";
import { getLookups, getSummaries } from "@/lib/data";

export const metadata = { title: "Results" };

async function Data() {
  const [colleges, lookups] = await Promise.all([getSummaries(), getLookups()]);
  return <ResultsList colleges={colleges} plans={lookups.plans} />;
}

export default function ResultsPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">Every application you&apos;ve submitted. Record each decision as it arrives.</p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
