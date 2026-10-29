import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FillerDownload } from "@/components/FillerDownload";
import { MatchDrawing, MatchGlimpse, type GlimpseCollege } from "@/components/tools/MatchGlimpse";
import { QuizGlimpse, ResumeGlimpse } from "@/components/tools/ToolGlimpses";
import { getSummaries } from "@/lib/data";
import completions from "@/lib/data/field-completions.json";
import { buildEvidence, scoreField, type FieldCompletions } from "@/lib/field-match";
import { FIELDS, type FieldKey } from "@/lib/fields";
import { getT } from "@/lib/i18n/server";
import { REGIONS } from "@/lib/regions";
import type { TFunction } from "@/lib/i18n";
import { buttonClass, PAGE_TITLE, PANEL, toneClass } from "@/lib/ui";

export const metadata: Metadata = { title: "Tools" };

const installSteps = (t: TFunction) => [
  t("tools.filler.step1"),
  <>
    {t("tools.filler.step2a")}
    <code className="rounded bg-zinc-100 px-1 py-0.5 text-[13px]">chrome://extensions</code>
    {t("tools.filler.step2b")}
  </>,
  <>
    {t("tools.filler.step3a")}
    <strong>{t("tools.filler.step3strong")}</strong>
    {t("tools.filler.step3b")}
  </>,
  <>
    {t("tools.filler.step4a")}
    <strong>{t("tools.filler.step4strong")}</strong>
    {t("tools.filler.step4b")}
  </>,
  t("tools.filler.step5"),
];

// The tools as cards down the left, each with a live glimpse of what it makes from the student's own data (their résumé
// page in miniature, their interest code so far); the application filler, a download, holds the right column. The two
// columns stretch to one height: the cards share the column's height, so the row ends on one line.
export default async function ToolsPage() {
  const t = await getT();
  return (
    <div className="space-y-8">
      <h1 className={PAGE_TITLE}>{t("tools.title")}</h1>

      <div className="grid gap-8 lg:grid-cols-12">
        <ul className="flex flex-col gap-3 lg:col-span-7">
          <ToolCard id="resume" title={t("tools.resume.heading")} blurb={t("tools.resume.blurb")} href="/tools/resume" cta={t("tools.resume.open")} glimpse={<ResumeGlimpse />} />
          <ToolCard id="interests" title={t("tools.interests.heading")} blurb={t("tools.interests.blurb")} href="/tools/interests" cta={t("tools.interests.cta")} glimpse={<QuizGlimpse />} />
          <ToolCard
            id="match"
            title={t("match.card.heading")}
            blurb={t("match.card.blurb")}
            href="/tools/match"
            cta={t("match.card.cta")}
            glimpse={
              <Suspense fallback={<MatchDrawing />}>
                <MatchGlimpseData />
              </Suspense>
            }
          />
        </ul>

        <section aria-labelledby="filler-heading" className={`${PANEL} space-y-5 p-6 sm:p-8 lg:col-span-5`}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="filler-heading" className="font-display text-xl font-bold tracking-tight">
              {t("tools.filler.heading")}
            </h2>
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${toneClass("progress")}`}>{t("tools.filler.beta")}</span>
          </div>
          <p className="text-base leading-relaxed">{t("tools.filler.blurb")}</p>
          <p role="note" className={`rounded-xl border px-4 py-3 text-[15px] ${toneClass("soon")}`}>
            {t("tools.filler.note")}
          </p>
          <FillerDownload>
            <a href="/downloads/common-app-filler.zip" download className={buttonClass("primary")}>
              {t("tools.filler.download")}
            </a>
            <div className="space-y-2">
              <h3 className="text-[15px] font-bold">{t("tools.filler.howTo")}</h3>
              <ol className="list-decimal space-y-1 pl-5 text-[15px]">
                {installSteps(t).map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </div>
          </FillerDownload>
          <p className="text-[15px]">
            <Link href="/application/transcript" className="font-semibold text-blue-700 underline underline-offset-4 hover:text-ink">
              {t("tools.filler.fillFirst")}
            </Link>
            {t("tools.filler.copiesIt")}
          </p>
        </section>
      </div>
    </div>
  );
}

const num = (v: number | null) => (v == null ? null : Number(v));

/**
 * Every college's strength in every field, scored here with the same scoreField as /tools/match, for the College match
 * glimpse to bucket by the student's saved field. Only colleges rated 40 or more in some field go to the browser: a main
 * field below 40 cannot reach the threshold of 55 even with a perfect second field (0.75 x 40 + 0.25 x 100).
 */
async function MatchGlimpseData() {
  const summaries = await getSummaries();
  const colleges: GlimpseCollege[] = [];
  for (const c of summaries) {
    const ev = buildEvidence(completions as FieldCompletions, c.slug);
    const s: Partial<Record<FieldKey, number>> = {};
    for (const f of FIELDS) {
      const score = scoreField(c, ev, f.key);
      if (score.status === "ok" && score.strength != null) s[f.key] = score.strength;
    }
    if (Math.max(0, ...Object.values(s)) < 40) continue;
    colleges.push({
      country: c.country_code,
      s,
      fit: {
        admit_rate: num(c.admit_rate),
        intl_admit_rate: num(c.intl_admit_rate),
        sat_p25: num(c.sat_p25),
        sat_p75: num(c.sat_p75),
        act_p25: num(c.act_p25),
        act_p75: num(c.act_p75),
        test_policy: c.test_policy,
      },
    });
  }
  const present = REGIONS.map((r) => r.code as string).filter((code) => summaries.some((c) => c.country_code === code));
  return <MatchGlimpse colleges={colleges} present={present} />;
}

function ToolCard({ id, title, blurb, href, cta, glimpse }: { id: string; title: string; blurb: string; href: string; cta: string; glimpse: React.ReactNode }) {
  return (
    <li aria-labelledby={`${id}-heading`} className={`${PANEL} flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:gap-8 sm:py-4 lg:flex-1`}>
      <div className="min-w-0 flex-1">
        <h2 id={`${id}-heading`} className="font-display text-xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-2 max-w-prose text-base leading-relaxed">{blurb}</p>
        <Link href={href} className={`${buttonClass("primary")} mt-4`}>
          {cta}
        </Link>
      </div>
      {glimpse}
    </li>
  );
}
