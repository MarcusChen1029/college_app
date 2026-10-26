import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioShareView, ShareInactive } from "@/components/ShareViews";
import { isShareToken } from "@/lib/share-links";

export const metadata: Metadata = { title: "Portfolio" };

export default function PortfolioSharePage({ params }: PageProps<"/share/portfolio/[token]">) {
  return (
    <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />}>
      <PortfolioShare params={params} />
    </Suspense>
  );
}

// A malformed token is answered here without any request; a well-formed one is looked up in the browser.
async function PortfolioShare({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return isShareToken(token) ? <PortfolioShareView token={token} /> : <ShareInactive />;
}
