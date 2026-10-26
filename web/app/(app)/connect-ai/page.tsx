import { Suspense } from "react";
import { ConnectAi } from "@/components/ConnectAi";
import { CopyContextCard } from "@/components/CopyContextCard";
import { getDeadlines, getLookups, getSummaries } from "@/lib/data";

export const metadata = { title: "Connect AI" };

async function CopyData() {
  const [colleges, deadlines, lookups] = await Promise.all([getSummaries(), getDeadlines(), getLookups()]);
  return <CopyContextCard colleges={colleges} deadlines={deadlines} plans={lookups.plans} englishTests={lookups.englishTests} />;
}

export default function ConnectAiPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <ConnectAi />
      <Suspense fallback={<div className="h-32 animate-pulse rounded-2xl bg-zinc-100" />}>
        <CopyData />
      </Suspense>
    </div>
  );
}
