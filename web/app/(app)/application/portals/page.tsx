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
      <p className="text-sm text-zinc-500">Click a portal&apos;s name to open it; click anywhere else on its row to see or edit the login.</p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
