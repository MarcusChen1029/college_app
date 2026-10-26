import { Suspense } from "react";
import { EssaysPage } from "@/components/EssaysPage";
import { getPlatforms, getSummaries } from "@/lib/data";

export const metadata = { title: "Essays" };

async function Data() {
  const [colleges, platforms] = await Promise.all([getSummaries(), getPlatforms()]);
  return <EssaysPage colleges={colleges} platforms={platforms} />;
}

export default function EssaysRoute() {
  return (
    <div className="space-y-4">
      <p className="text-sm text-zinc-500">
        Track every essay for every college. Press <strong>+ New Google Doc</strong> to open a blank doc, then <strong>Paste link</strong> to attach it here.
      </p>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
        <Data />
      </Suspense>
    </div>
  );
}
