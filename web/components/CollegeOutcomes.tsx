import outcomesData from "@/lib/data/outcomes.json";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { SECTION_TITLE } from "@/lib/ui";
import { COHORT, collegeOutcomes, formatEarnings, scorecardUrl, type OutcomesData } from "@/lib/outcomes";

/**
 * "Graduation & earnings" for a US college: official College Scorecard figures (lib/data/outcomes.json).
 * Self-contained so the college page only needs <CollegeOutcomes slug={...} />. Server component: call it below the
 * page's Suspense boundary (it reads the visitor's language).
 */
export async function CollegeOutcomes({ slug }: { slug: string }) {
  const t = await getT();
  const data = outcomesData as OutcomesData;
  const o = collegeOutcomes(data, slug);
  const any = o && (o.gradRate !== null || o.earnings10 !== null || o.earnings6 !== null);

  return (
    <section id="outcomes" aria-labelledby="outcomes-heading">
      <h2 id="outcomes-heading" className={`mb-4 ${SECTION_TITLE}`}>
        {t("outcomes.title")}
      </h2>
      {any ? (
        <>
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3">
            <Figure
              label={t("outcomes.grad.label")}
              value={o.gradRate !== null ? `${o.gradRate}%` : null}
              sub={t("outcomes.grad.sub", { years: COHORT.grad })}
              missing={t("outcomes.missing")}
              missingSub={t("outcomes.missingSub")}
            />
            <Figure
              label={t("outcomes.e10.label")}
              value={o.earnings10 !== null ? formatEarnings(o.earnings10) : null}
              sub={t("outcomes.e10.sub", { years: COHORT.e10 })}
              missing={t("outcomes.missing")}
              missingSub={t("outcomes.missingSub")}
            />
            <Figure
              label={t("outcomes.e6.label")}
              value={o.earnings6 !== null ? formatEarnings(o.earnings6) : null}
              sub={t("outcomes.e6.sub", { years: COHORT.e6 })}
              missing={t("outcomes.missing")}
              missingSub={t("outcomes.missingSub")}
            />
          </div>
          <p className="mt-3 text-sm text-zinc-600">{t("outcomes.caveat")}</p>
          <p className="mt-2 text-xs text-zinc-500">{t("outcomes.unitNote")}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {t("outcomes.source", { date: fmtDate(data.released) })}{" "}
            <a className="text-blue-600 hover:underline" href={scorecardUrl(o.scorecardId)} target="_blank" rel="noreferrer">
              {t("outcomes.view")}
            </a>
          </p>
        </>
      ) : (
        <p className="text-sm text-zinc-500">{t("outcomes.none")}</p>
      )}
    </section>
  );
}

/** Same look as the key-number tiles at the top of the college page; a missing value is stated, never shown as 0 or a dash. */
function Figure({ label, value, sub, missing, missingSub }: { label: string; value: string | null; sub: string; missing: string; missingSub: string }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <div className="text-xs font-medium text-zinc-500">{label}</div>
      {value !== null ? (
        <>
          <div className="mt-1 font-display text-2xl font-bold tabular-nums">{value}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>
        </>
      ) : (
        <>
          <div className="mt-1 font-display text-2xl font-bold text-zinc-400">{missing}</div>
          <div className="mt-0.5 text-xs text-zinc-500">{missingSub}</div>
        </>
      )}
    </div>
  );
}
