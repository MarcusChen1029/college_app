import { Suspense } from "react";
import { MyList } from "@/components/MyList";
import { getDeadlines, getLookups, getScoreCodes, getSummaries } from "@/lib/data";

export const metadata = { title: "My list" };

async function Data() {
  const [colleges, deadlines, lookups, codes] = await Promise.all([getSummaries(), getDeadlines(), getLookups(), getScoreCodes()]);
  return <MyList colleges={colleges} deadlines={deadlines} plans={lookups.plans} codes={codes} />;
}

export default function MyListPage() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Plan and checklist for every college you&apos;re applying to. A college is <strong>Ready</strong> once its checklist is complete, and only then
        can it be marked Submitted.
      </p>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
