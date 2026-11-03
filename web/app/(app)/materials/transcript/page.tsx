import { Suspense } from "react";
import { TranscriptPage } from "@/components/TranscriptPage";

export const metadata = { title: "Transcript" };

export default function TranscriptRoute() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
      <TranscriptPage />
    </Suspense>
  );
}
