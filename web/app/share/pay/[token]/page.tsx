import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentPayView, PayLinkInactive } from "@/components/ParentPayView";
import { isShareToken } from "@/lib/share-links";

export const metadata: Metadata = { title: "Pay for a Trakur pass" };

export default function ParentPayPage({ params }: PageProps<"/share/pay/[token]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />}>
      <ParentPay params={params} />
    </Suspense>
  );
}

// A malformed token is answered here without any request; a well-formed one is looked up in the browser.
async function ParentPay({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return isShareToken(token) ? <ParentPayView token={token} /> : <PayLinkInactive />;
}
