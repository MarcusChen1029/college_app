import { Suspense } from "react";
import { ExamsPage } from "@/components/ExamsPage";

export const metadata = { title: "Exams" };

export default function ExamsRoute() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
      <ExamsPage />
    </Suspense>
  );
}
