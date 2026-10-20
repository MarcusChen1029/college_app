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
      <div>
        <h1 className="text-2xl font-semibold">My list</h1>
        <p className="text-sm text-zinc-500">Plan, status, checklist and deadlines for every college you are considering.</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />}>
        <Data />
      </Suspense>
    </div>
  );
}
