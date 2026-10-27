import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldMatch } from "@/components/FieldMatch";
import { getSummaries } from "@/lib/data";
import completions from "@/lib/data/field-completions.json";
import { buildEvidence, type FieldCompletions, type FieldEvidence } from "@/lib/field-match";
import { toMatchRow } from "@/lib/field-match-view";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = { title: "College match by field" };

// The IPEDS file stays on the server: only the evidence for the colleges in the list goes to the browser.
async function Match() {
  const colleges = (await getSummaries()).map(toMatchRow);
  const evidence: Record<string, FieldEvidence> = {};
  for (const c of colleges) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    if (ev) evidence[c.slug] = ev;
  }
  return <FieldMatch colleges={colleges} evidence={evidence} />;
}

export default async function MatchPage() {
  const t = await getT();
  return (
    <div className="max-w-4xl space-y-6">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold">{t("match.title")}</h1>
        <p className="text-zinc-600">{t("match.intro")}</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />}>
        <Match />
      </Suspense>
    </div>
  );
}
