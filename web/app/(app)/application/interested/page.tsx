import { Suspense } from "react";
import { InterestedList } from "@/components/InterestedList";
import { getSummaries } from "@/lib/data";
import { getT } from "@/lib/i18n/server";

export const metadata = { title: "Interested" };

async function Data() {
  const colleges = await getSummaries();
  return <InterestedList colleges={colleges} />;
}

async function Intro() {
  const t = await getT();
  return <p className="text-sm text-zinc-500">{t("application.interestedIntro")}</p>;
}

export default function InterestedPage() {
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
