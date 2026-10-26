import { Suspense } from "react";
import { CollegeExplorer } from "@/components/CollegeExplorer";
import { getT } from "@/lib/i18n/server";
import { getEnglishSummaries, getLookups, getSatEstimates, getSummaries } from "@/lib/data";

export const metadata = { title: "Colleges" };

async function Explorer() {
  const [colleges, lookups, english, satEstimates] = await Promise.all([getSummaries(), getLookups(), getEnglishSummaries(), getSatEstimates()]);
  return <CollegeExplorer colleges={colleges} lookups={lookups} english={english} satEstimates={satEstimates} />;
}

// Reads the language cookie, so it renders inside Suspense.
async function Heading() {
  const t = await getT();
  return <h1 className="sr-only">{t("colleges.heading")}</h1>;
}

export default function CollegesPage() {
  return (
    <>
      <Suspense fallback={<h1 className="sr-only">Colleges</h1>}>
        <Heading />
      </Suspense>
      <Suspense fallback={<div className="h-[70dvh] animate-pulse rounded-3xl bg-blue-50" />}>
        <Explorer />
      </Suspense>
    </>
  );
}
