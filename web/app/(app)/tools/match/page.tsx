import type { Metadata } from "next";
import { Suspense } from "react";
import { FieldMatch } from "@/components/FieldMatch";
import { getCourseOffers, getSummaries } from "@/lib/data";
import completions from "@/lib/data/field-completions.json";
import outcomes from "@/lib/data/outcomes.json";
import { buildEvidence, type FieldCompletions, type FieldEvidence } from "@/lib/field-match";
import { aLevelGrades, ibSummary, toMatchRow, type MatchCourse } from "@/lib/field-match-view";
import { programFields } from "@/lib/fields";
import { getT } from "@/lib/i18n/server";
import { fieldEarningsFor, type OutcomesData } from "@/lib/outcomes";
import { PAGE_INTRO, PAGE_TITLE } from "@/lib/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata("/tools/match");

// The IPEDS and Scorecard files stay on the server: only the evidence for the colleges in the list goes to the browser.
async function Match() {
  const [summaries, offers] = await Promise.all([getSummaries(), getCourseOffers()]);
  const colleges = summaries.map(toMatchRow);
  // Universities that admit by course: each course's fields and its offer, cut short on the server so the browser gets a few
  // characters per course, not the published paragraphs.
  const courses: Record<string, MatchCourse[]> = {};
  for (const c of summaries) {
    if (c.country_code === "US" || !offers[c.id]) continue;
    courses[c.slug] = offers[c.id].map((o) => ({
      name: o.name,
      fields: programFields(o.name),
      aLevel: aLevelGrades(o.a_level_offer),
      ib: o.ib_points,
      ibText: o.ib_points == null ? ibSummary(o.ib_offer) : null,
      atar: o.atar,
    }));
  }
  const evidence: Record<string, FieldEvidence> = {};
  for (const c of colleges) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    if (!ev) continue;
    const earnings = c.country_code === "US" ? fieldEarningsFor(outcomes as OutcomesData, c.slug) : {};
    evidence[c.slug] = Object.keys(earnings).length ? { ...ev, earnings } : ev;
  }
  return <FieldMatch colleges={colleges} evidence={evidence} courses={courses} released={(outcomes as OutcomesData).released} />;
}

export default async function MatchPage() {
  const t = await getT();
  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h1 className={PAGE_TITLE}>{t("match.title")}</h1>
        <p className={PAGE_INTRO}>{t("match.intro")}</p>
      </div>
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-zinc-100" />}>
        <Match />
      </Suspense>
    </div>
  );
}
