import { Suspense } from "react";
import { MyList } from "@/components/MyList";
import { getDeadlines, getLookups, getSummaries } from "@/lib/data";

export const metadata = { title: "My list" };

async function Data() {
  const [colleges, deadlines, lookups] = await Promise.all([getSummaries(), getDeadlines(), getLookups()]);
  return <MyList colleges={colleges} deadlines={deadlines} plans={lookups.plans} />;
}

export default function MyListPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">My list</h1>
        <p className="text-sm text-zinc-500">Saved in this browser for the demo — accounts and sync come next.</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />}>
        <Data />
      </Suspense>
    </div>
  );
}
