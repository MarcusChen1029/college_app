import { Suspense } from "react";
import { InterestedList } from "@/components/InterestedList";
import { getSummaries } from "@/lib/data";

export const metadata = { title: "Interested" };

async function Data() {
  const colleges = await getSummaries();
  return <InterestedList colleges={colleges} />;
}

export default function InterestedPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Interested</h1>
        <p className="text-sm text-zinc-500">Colleges you&apos;re considering but haven&apos;t committed to. They don&apos;t count toward your plan&apos;s limit.</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-lg bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
