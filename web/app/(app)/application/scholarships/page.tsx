import { Suspense } from "react";
import { ScholarshipsPage } from "@/components/ScholarshipsPage";

export const metadata = { title: "Scholarships" };

export default function ScholarshipsRoute() {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />}>
      <ScholarshipsPage />
    </Suspense>
  );
}
