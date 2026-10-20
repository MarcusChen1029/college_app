import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { ProfileForm } from "@/components/ProfileForm";
import { getEnglishSummaries, getLookups, getSatEstimates, getSummaries } from "@/lib/data";

export const metadata = { title: "Colleges" };

async function Colleges() {
  const [colleges, lookups, english, satEstimates] = await Promise.all([getSummaries(), getLookups(), getEnglishSummaries(), getSatEstimates()]);
  return <CollegeExplorer colleges={colleges} lookups={lookups} english={english} satEstimates={satEstimates} />;
}

export default function CollegesPage() {
  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-end justify-between gap-4 rounded-2xl bg-blue-50 p-5">
        <div>
          <h1 className="text-3xl font-bold">Colleges</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-600">
            Click a pin or pick a college to see how you fit. Add your scores and each one is marked reach, target or safety for you.
          </p>
        </div>
        <ProfileForm />
      </section>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-zinc-100" />}>
        <Colleges />
      </Suspense>
    </div>
  );
}
