import { Suspense } from "react";
import { PortalsPage } from "@/components/PortalsPage";
import { getT } from "@/lib/i18n/server";
import { getSummaries } from "@/lib/data";

export const metadata = { title: "Portals" };

async function Data() {
  const colleges = await getSummaries();
  return <PortalsPage colleges={colleges} />;
}

export default async function PortalsRoute() {
  const t = await getT();
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">{t("portals.intro")}</p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
