import { Suspense } from "react";
import { CollegeBrowser } from "@/components/CollegeBrowser";
import { ProfileForm } from "@/components/ProfileForm";
import { getLookups, getSummaries } from "@/lib/data";

async function Colleges() {
  const [colleges, lookups] = await Promise.all([getSummaries(), getLookups()]);
  return <CollegeBrowser colleges={colleges} lookups={lookups} />;
}

export default function Home() {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Colleges</h1>
          <p className="text-sm text-zinc-500">Filter by tier, subject tier, testing and deadlines. Add your scores to see reach / target / safety.</p>
        </div>
        <ProfileForm />
      </section>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />}>
        <Colleges />
      </Suspense>
    </div>
  );
}
