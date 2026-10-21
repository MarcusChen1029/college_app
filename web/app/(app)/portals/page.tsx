import { Suspense } from "react";
import { PortalsPage } from "@/components/PortalsPage";
import { getSummaries } from "@/lib/data";

export const metadata = { title: "Portals" };

async function Data() {
  const colleges = await getSummaries();
  return <PortalsPage colleges={colleges} />;
}

export default function PortalsRoute() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Portals</h1>
        <p className="text-sm text-zinc-500">Every login in one place: your colleges, the UC and Texas systems, STARS, testing and aid sites.</p>
      </div>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
