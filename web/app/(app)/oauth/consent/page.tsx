import { Suspense } from "react";
import { OAuthConsent } from "@/components/OAuthConsent";

export const metadata = { title: "Approve AI access" };

export default function ConsentPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />}>
      <OAuthConsent />
    </Suspense>
  );
}
