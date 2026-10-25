import { Suspense } from "react";
import { RecommendersPage } from "@/components/RecommendersPage";

export const metadata = { title: "Recommenders" };

export default function RecommendersRoute() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
      <RecommendersPage />
    </Suspense>
  );
}
