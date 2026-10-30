"use client";

// Read-only pages opened by a share link (migration 0032). They fetch through the anon RPCs with the token
// from the URL and show only what the RPC returns. Anything wrong (unknown, revoked, network) = "not active".
// The pages themselves: components/share/ParentReport.tsx and PortfolioSheet.tsx.

import { useEffect, useState } from "react";
import { ParentReport } from "@/components/share/ParentReport";
import { PortfolioSheet } from "@/components/share/PortfolioSheet";
import { ShareInactiveCard } from "@/components/share/ShareFrame";
import { useT } from "@/lib/i18n/client";
import { fetchParentView, fetchPortfolioView } from "@/lib/share-api";
import { buttonClass } from "@/lib/ui";

/** Shown for a malformed, unknown or revoked link. Deliberately says nothing about why. */
export function ShareInactive() {
  return <ShareInactiveCard />;
}

function Loading() {
  const t = useT();
  return <div role="status" aria-label={t("share.loading")} className="h-64 animate-pulse rounded-2xl bg-zinc-100" />;
}

function useShared<T>(token: string, fetcher: (t: string) => Promise<T | null>): T | null | undefined {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetcher(token).then((v) => live && setData(v));
    return () => {
      live = false;
    };
  }, [token, fetcher]);
  return data;
}

function PrintButton() {
  const t = useT();
  return (
    <button type="button" className={`${buttonClass("secondary", "sm")} shrink-0 print:hidden`} onClick={() => window.print()}>
      {t("share.print")}
    </button>
  );
}

export function ParentShareView({ token }: { token: string }) {
  const view = useShared(token, fetchParentView);
  if (view === undefined) return <Loading />;
  if (view === null) return <ShareInactive />;
  return <ParentReport view={view} print={<PrintButton />} />;
}

export function PortfolioShareView({ token }: { token: string }) {
  const view = useShared(token, fetchPortfolioView);
  if (view === undefined) return <Loading />;
  if (view === null) return <ShareInactive />;
  return <PortfolioSheet view={view} print={<PrintButton />} />;
}
