import outcomesData from "@/lib/data/outcomes.json";
import { fmtDate } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { COHORT, collegeOutcomes, formatEarnings, scorecardUrl, type OutcomesData } from "@/lib/outcomes";

/**
 * "Graduation & earnings" for a US college: official College Scorecard figures (lib/data/outcomes.json).
 * Self-contained so the college page only needs <CollegeOutcomes slug={...} />. Server component: call it below the
 * page's Suspense boundary (it reads the visitor's language).
 * The three figures are set as type on one ruled line (no tiles); the caveat about international students is running text.
 */
export async function CollegeOutcomes({ slug }: { slug: string }) {
  const t = await getT();
  const data = outcomesData as OutcomesData;
  const o = collegeOutcomes(data, slug);
  const any = o && (o.gradRate !== null || o.earnings10 !== null || o.earnings6 !== null);

  return (
    <section id="outcomes" aria-labelledby="outcomes-heading">
      <h2 id="outcomes-heading" className="font-display text-2xl font-bold tracking-tight text-ink">
        {t("outcomes.title")}
      </h2>
      {any ? (
        <>
          <dl className="mt-6 grid border-y border-zinc-200 sm:grid-cols-3">
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
          </dl>
          <p className="mt-6 max-w-[72ch] text-base leading-relaxed">{t("outcomes.caveat")}</p>
          <p className="mt-3 max-w-[72ch] text-sm leading-relaxed text-zinc-600">{t("outcomes.unitNote")}</p>
          <p className="mt-1 text-sm text-zinc-600">
            {t("outcomes.source", { date: fmtDate(data.released) })}{" "}
            <a className="font-semibold text-blue-700 hover:underline" href={scorecardUrl(o.scorecardId)} target="_blank" rel="noreferrer">
              {t("outcomes.view")}
            </a>
          </p>
        </>
      ) : (
        <p className="mt-4 text-base">{t("outcomes.none")}</p>
      )}
    </section>
  );
}

/** One outcome figure; a missing value is stated in words, never shown as 0 or a dash. */
function Figure({ label, value, sub, missing, missingSub }: { label: string; value: string | null; sub: string; missing: string; missingSub: string }) {
  return (
    <div className="border-b border-zinc-200 py-5 sm:border-b-0 sm:border-l sm:px-8 sm:first:border-l-0 sm:first:pl-0">
      <dt className="text-sm font-semibold text-zinc-600">{label}</dt>
      {value !== null ? (
        <>
          <dd className="mt-2 font-display text-4xl leading-none font-bold tabular-nums">{value}</dd>
          <dd className="mt-2 text-sm text-zinc-600">{sub}</dd>
        </>
      ) : (
        <>
          <dd className="mt-2 font-display text-2xl leading-tight font-bold text-zinc-600">{missing}</dd>
          <dd className="mt-2 text-sm text-zinc-600">{missingSub}</dd>
        </>
      )}
    </div>
  );
}
