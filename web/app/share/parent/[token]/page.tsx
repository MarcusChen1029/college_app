import type { Metadata } from "next";
import { Suspense } from "react";
import { ParentShareView, ShareInactive } from "@/components/ShareViews";
import { isShareToken } from "@/lib/share-links";

export const metadata: Metadata = { title: "Application progress" };

export default function ParentSharePage({ params }: PageProps<"/share/parent/[token]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />}>
      <ParentShare params={params} />
    </Suspense>
  );
}

// A malformed token is answered here without any request; a well-formed one is looked up in the browser.
async function ParentShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return isShareToken(token) ? <ParentShareView token={token} /> : <ShareInactive />;
}
