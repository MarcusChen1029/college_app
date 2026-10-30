import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { SchoolLogo, TierBadge } from "@/components/badges";
import { JumpNav, type JumpItem } from "@/components/JumpNav";
import { applyTags } from "@/lib/apply-tags";
import { collegeSupplements } from "@/lib/supplements-data";
import { CollegeActions } from "@/components/CollegeActions";
import { CollegeSupplementsSection, EssaysRequirement, IntlFinanceNote, SupplementSourceItems } from "@/components/CollegeSupplements";
import { CollegeOutcomes } from "@/components/CollegeOutcomes";
import { aidRowUsOnly } from "@/components/college/aid-rows";
import { EnglishCheck } from "@/components/college/EnglishCheck";
import { FitAnswer } from "@/components/college/FitAnswer";
import { IntlSwap } from "@/components/college/IntlSwap";
import { YouRow } from "@/components/college/YouRow";
import { Note } from "@/components/college/Note";
import { Ref } from "@/components/college/Ref";
import { ScoreRange } from "@/components/college/ScoreRange";
import { SourceItem } from "@/components/college/SourceItem";
import { Tag } from "@/components/college/Tag";
import { collegeEnglishFrom } from "@/lib/english-fit";
import { getCollege, getLookups, getSummaries } from "@/lib/data";
import {
  ADMIT_MODEL,
  ENGLISH_POLICY,
  ENGLISH_STATUS,
  FACTOR,
  daysUntil,
  fmtDate,
  fmtInt,
  fmtPct,
  fmtScore,
  fmtUsd,
  IMPORTANCE,
  INTERVIEW,
  INTL_AID,
  PLATFORM,
  TEST_POLICY,
  TRANSFER,
} from "@/lib/format";
import { estimateGpaPercentiles, GPA_BAND_ORDER } from "@/lib/gpa";
import type { TFunction } from "@/lib/i18n";
import { programApplyVia, programFee } from "@/lib/programs";
import { collegeMetadata } from "@/lib/seo";
import { referenceTone, type Tone } from "@/lib/status";
import { tierLetter } from "@/lib/tiers";
import type { CollegeDetail, Lookups, TierCode } from "@/lib/types";
import { getT } from "@/lib/i18n/server";

// One college, read top to bottom. The first screen answers "can I get in, what does it cost, when is it due" in a navy
// band of four figures (admit rate with the student's fit, the next deadline, the cost, the overall tier); the sections
// below keep their anchors and the on-this-page order, each composed for its own content. Every figure keeps its [n]
// link to the Sources list, and a missing value says "not published / not reported", never 0 or "no".

const H2 = "font-display text-2xl font-bold tracking-tight text-ink";

// The title and description come from the cached college list the page reads anyway (lib/seo.ts collegeMetadata). Like the page,
// this waits for request time, so the shell prerenders and the metadata streams in with the college.
export async function generateMetadata({ params }: PageProps<"/colleges/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return collegeMetadata(slug, (await getSummaries()).find((s) => s.slug === slug));
}

export default function CollegePage({ params }: PageProps<"/colleges/[slug]">) {
  return (
    <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-2xl bg-zinc-100" />}>
      <College params={params} />
    </Suspense>
  );
}

/** A row of the deadline timetable: a college deadline, or (for course-based universities with none) the courses that close on one date. */
type Entry = { key: string; date: string | null; title: string; plan: string | null; tags: string[]; kind: string | null; decision: string | null; notes: string | null; n: number | undefined; application: boolean; aid: boolean };
/** The plans lookup is read with select("*"), so its description column arrives too (lib/types.ts does not list it yet). */
type PlanRow = Lookups["plans"][number] & { description?: string | null };
// Non-US general tiers are national rank bands (CLAUDE.md "Multi-country"); only S, A and B are in use outside the US.
const NATIONAL_RANGE: Partial<Record<string, string>> = { S: "1–5", A: "6–15", B: "16–40" };
// scripts/build_seed.py writes this when no reason was recorded for a tier; it says nothing about the college, so it counts as none.
const reasonOf = (rationale: string | null | undefined) => (rationale && !/^Editorial judgment \(v\d+, reviewed [\d-]+\)$/.test(rationale) ? rationale : null);

async function College({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getT();
  // Unknown slugs stop at the cached list, so made-up URLs can't each cost a database query.
  if (!(await getSummaries()).some((s) => s.slug === slug)) notFound();
  const [c, lookups] = await Promise.all([getCollege(slug), getLookups()]);
  if (!c) notFound();

  // Number sources in the order they appear so every fact can cite one.
  const srcNum = new Map(c.sources.map((s, i) => [s.id, i + 1]));
  const ref = (id: string | null | undefined) => (id ? srcNum.get(id) : undefined);
  const stats = [...c.admission_stats].sort((a, b) => (a.source_note === null ? -1 : 1) - (b.source_note === null ? -1 : 1) || b.cds_year.localeCompare(a.cds_year))[0];
  const scores = c.test_score_percentiles.filter((s) => s.cds_year === stats?.cds_year);
  const score = (k: string) => scores.find((s) => s.test === k);
  const policy = [...c.test_policies].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const req = [...c.application_requirements].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const cost = [...c.cost_aid].sort((a, b) => b.year.localeCompare(a.year))[0];
  const deadlines = [...c.deadlines].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const programs = [...c.programs].sort((a, b) => a.name.localeCompare(b.name));
  const gpaEst = estimateGpaPercentiles(stats?.gpa_distribution);
  const isUS = (c.country_code ?? "US") === "US";
  const general = c.institution_tiers.find((x) => x.category_key === "general")?.tier_code;
  const catLabel = (k: string | null) => lookups.categories.find((x) => x.key === k)?.label ?? k ?? "";
  const planLabel = (k: string | null) => lookups.plans.find((p) => p.key === k)?.label ?? k ?? "";
  const testName = (k: string) => lookups.englishTests.find((x) => x.key === k)?.name ?? k;
  const cycle = deadlines[0]?.cycle ?? t("college.currentCycle");
  // Baseline-only colleges carry federal IPEDS figures, not a Common Data Set: say so instead of "does not report".
  const statsKind = c.sources.find((s) => s.id === stats?.source_id)?.kind;
  const baseline = statsKind === "ipeds" || statsKind === "scorecard";
  const statsLabel = !stats ? "" : baseline ? t("college.ipedsYear", { year: stats.cds_year }) : stats.source_note ? t("college.admissionsSiteFigures") : t("college.cdsYear", { year: stats.cds_year });

  // The timetable: college deadlines; for a course-based university with none, its courses grouped by closing date.
  const entries: Entry[] = deadlines.length
    ? deadlines.map((d) => ({
        key: d.id,
        date: d.due_date,
        title: d.label ?? planLabel(d.plan_key),
        plan: d.plan_key,
        tags: isUS && d.plan_key && d.label ? [d.plan_key] : [],
        kind: d.kind !== "application" ? d.kind.replace("_", " ") : null,
        decision: d.notification_date || d.notification_note ? t("college.decision", { x: d.notification_date ? fmtDate(d.notification_date) : (d.notification_note ?? "") }) : null,
        notes: d.notes,
        n: ref(d.source_id),
        application: d.kind === "application",
        aid: d.kind === "financial_aid",
      }))
    : [...new Set(programs.map((p) => p.application_deadline).filter((x): x is string => !!x))].sort().map((date) => {
        const on = programs.filter((p) => p.application_deadline === date);
        return { key: `course-${date}`, date, title: on.map((p) => p.name).join(" · "), plan: null, tags: [...new Set(on.map((p) => programApplyVia(p, c.country_code)).filter((x): x is string => !!x))], kind: null, decision: null, notes: null, n: undefined, application: true, aid: false };
      });
  // The band's "next deadline" is an application deadline only (never a deposit, scholarship or aid date). Plans that close
  // on the same day are named together ("Early Decision or Early Action").
  const appUpcoming = entries.filter((e) => e.application && e.date && daysUntil(e.date) >= 0);
  const next = appUpcoming[0];
  const nextGroup = next ? appUpcoming.filter((e) => e.date === next.date) : [];
  // The band names the round briefly ("Early Action"); the timetable keeps each deadline's full name.
  const scopeOf = (title: string) => {
    const s = title.replace(/^(application\s+)?deadline\s*[-–:]\s*/i, "").replace(/\s*\([^)]*\)/g, "").trim();
    const cap = s.charAt(0).toUpperCase() + s.slice(1);
    return cap.length <= 34 ? cap : `${cap.slice(0, cap.lastIndexOf(" ", 32))}…`;
  };
  const shortName = (e: Entry) =>
    e.title.length <= 30
      ? e.title
      : isUS && e.plan
        ? /\binternational\b/i.test(e.title)
          ? t("college.planIntl", { plan: planLabel(e.plan) })
          : planLabel(e.plan)
        : scopeOf(e.title) || t("college.applicationDeadline");
  const nextTitle = [...new Set(nextGroup.map(shortName))].join(t("college.planOr"));
  const nextRefs = [...new Set(nextGroup.map((e) => e.n).filter((n): n is number => n !== undefined))];
  const then = next && appUpcoming.find((e) => e.date !== next.date);
  const rolling = !next ? entries.find((e) => e.application && !e.date) : undefined;
  const datedApps = entries.filter((e) => e.application && e.date);
  const firstUpcoming = entries.findIndex((e) => e.date && daysUntil(e.date) >= 0);
  // Aid deadlines an international applicant cannot use: every aid date when the college gives internationals no aid,
  // and FAFSA-only dates anywhere (FAFSA is US federal aid).
  // Need-based forms (CSS Profile, FAFSA) are no use to an international applicant where the college gives them no aid or
  // merit aid only.
  const noIntlAid = cost?.intl_aid_policy === "none" || cost?.intl_aid_policy === "merit_only";
  const usOnly = (e: Entry) => e.aid && aidRowUsOnly(e.title, e.notes, cost?.intl_aid_policy);
  // The Today row counts down to the same application deadline as the band, or says there is none (never to a payment date).
  const todayTarget = next?.date
    ? { date: next.date, title: isUS ? nextTitle : t("college.theDeadline", { scope: nextTitle }) }
    : { date: null, title: datedApps.length ? t("college.noUpcoming") : rolling ? t("college.rollingSub", { plan: rolling.title }) : t("college.appNotPublishedYet") };
  // The plans this college's deadlines use (ED, EA, RD...), and whether each one binds the student.
  const plansHere = [...new Set((isUS ? deadlines : []).map((d) => d.plan_key).filter((k): k is string => !!k))]
    .map((k) => lookups.plans.find((p) => p.key === k))
    .filter((p): p is PlanRow => !!p)
    .filter((p, _, all) => all.length > 1 || !["RD", "ROLLING"].includes(p.key)); // a lone Regular Decision (a UCAS "RD") says nothing worth a column

  // Cost in the band: the tuition an international student pays, named by which published figure it is (international
  // tuition; else out-of-state at a public; else the published tuition). Never a total: many stored totals are in-state.
  const fees = programs
    .map((p) => p.intl_fee_gbp ?? p.intl_fee_cad ?? p.intl_fee_aud)
    .filter((x): x is number => x != null)
    .sort((a, b) => a - b);
  const feeText = (n: number) => programFee({ intl_fee_gbp: programs.some((p) => p.intl_fee_gbp != null) ? n : null, intl_fee_cad: programs.some((p) => p.intl_fee_cad != null) ? n : null, intl_fee_aud: programs.some((p) => p.intl_fee_aud != null) ? n : null }) ?? "";
  const isPublic = c.control === "public";
  const hasIntlRate = stats?.intl_admit_rate != null;
  const bandTuition = !cost
    ? null
    : cost.tuition_intl_usd != null
      ? { v: cost.tuition_intl_usd, label: t("college.tuitionIntl") }
      : isPublic && cost.tuition_out_of_state_usd != null
        ? { v: cost.tuition_out_of_state_usd, label: t("college.tuitionOut") }
        : cost.tuition_usd != null
          ? { v: cost.tuition_usd, label: t("college.tuition"), note: isPublic ? t("college.publicNoOut") : null }
          : null;
  // A published total lower than the tuition an international student pays (plus housing, when published) cannot be their
  // cost: it is almost always the in-state figure. Say so beside it rather than let it read as the bill.
  const intlTuition = cost?.tuition_intl_usd ?? cost?.tuition_out_of_state_usd ?? null;
  const floor = intlTuition != null ? intlTuition + (cost?.room_board_usd ?? 0) : null;
  const inStateTotal =
    isPublic && cost?.total_coa_usd != null && floor != null && cost.total_coa_usd < floor
      ? {
          sum: floor,
          what: t(cost.tuition_intl_usd != null ? (cost.room_board_usd != null ? "college.whatIntlHousing" : "college.whatIntl") : cost.room_board_usd != null ? "college.whatOutHousing" : "college.whatOut"),
        }
      : null;
  // Otherwise, a published total below the lines listed above it (Brown: $91,676 against $74,650 + $18,514) is explained too.
  const partsSum = cost ? [bandTuition?.v, cost.required_fees_usd, cost.intl_extra_fees_usd, cost.room_board_usd].reduce<number>((a, x) => a + (x ?? 0), 0) : 0;
  const partsBelow = !inStateTotal && cost?.total_coa_usd != null && partsSum > cost.total_coa_usd ? partsSum : null;
  const success = programs.map((p) => p.success_pct).filter((x): x is number => x != null).sort((a, b) => a - b);
  const satTotal = score("SAT_TOTAL");
  const actComp = score("ACT_COMPOSITE");
  const ranges = [
    satTotal?.p25 != null && satTotal.p75 != null ? { test: "sat" as const, label: t("college.satTotal"), p25: satTotal.p25, p50: satTotal.p50, p75: satTotal.p75 } : null,
    actComp?.p25 != null && actComp.p75 != null ? { test: "act" as const, label: t("college.actComposite"), p25: actComp.p25, p50: actComp.p50, p75: actComp.p75 } : null,
  ].filter((x) => x !== null);
  const tags = applyTags(collegeSupplements(c.slug), req?.app_fee_usd);
  const recommended = Object.fromEntries(c.english_requirements.filter((e) => e.recommended_total != null).map((e) => [e.test_key, Number(e.recommended_total)]));
  // The best subject tier and the fields that hold it ("S in Business"), read from the subject tiers further down.
  const subjectTiers = c.institution_tiers.filter((x) => x.category_key !== "general");
  const tierRank = (code: TierCode) => lookups.tiers.find((x) => x.code === code)?.sort_order ?? 99;
  const bestRank = Math.min(...subjectTiers.map((x) => tierRank(x.tier_code)));
  const best = subjectTiers.filter((x) => tierRank(x.tier_code) === bestRank);
  const strongest = best.length && (!general || bestRank < tierRank(general)) ? { tier: best[0].tier_code, list: best.slice(0, 3).map((x) => catLabel(x.category_key)).join(", ") + (best.length > 3 ? ` +${best.length - 3}` : "") } : null;
  const generalRow = c.institution_tiers.find((x) => x.category_key === "general");
  const nationalRange = general && !isUS ? NATIONAL_RANGE[tierLetter(general)] : undefined;
  const tierText = !general
    ? t("college.notRatedYet")
    : nationalRange
      ? c.country_code === "GB"
        ? t("college.tierUK", { range: nationalRange })
        : t("college.tierQS", { range: nationalRange, country: c.country_code === "CA" ? t("college.countryCA") : c.country_code === "AU" ? t("college.countryAU") : c.country_code })
      : (lookups.tiers.find((x) => x.code === general)?.description ?? t("status.tier", { tier: general }));
  const word = (text: string) => <span className="block font-display text-lg leading-[1.15] text-blue-200 sm:text-2xl lg:text-[26px]">{text}</span>;
  const missing = word(t("college.notPublished"));

  const jump: JumpItem[] = [
    ...(isUS ? [{ id: "scores", label: t("college.nav.scores") }] : []),
    ...(c.programs.length > 0 ? [{ id: "courses", label: t("college.nav.courses") }] : []),
    { id: "deadlines", label: t("college.nav.deadlines") },
    ...(isUS || c.english_requirements.length > 0 ? [{ id: "english", label: t("college.nav.english") }] : []),
    ...(isUS ? [{ id: "requirements", label: t("college.nav.requirements") }] : []),
    ...(isUS ? [{ id: "supplemental-essays", label: t("college.nav.essays") }] : []),
    ...(isUS ? [{ id: "cost", label: t("college.nav.cost") }, { id: "tiers", label: t("college.nav.tiers") }, { id: "outcomes", label: t("college.nav.outcomes") }] : []),
    ...(c.admission_factors.length > 0 ? [{ id: "factors", label: t("college.nav.factors") }] : []),
    { id: "sources", label: t("college.nav.sources") },
  ];

  return (
    <article>
      <header className="pb-8">
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="hidden shrink-0 empty:hidden sm:block">
                <SchoolLogo slug={c.slug} />
              </span>
              <h1 className="font-display text-[26px] leading-[1.15] font-bold tracking-tight sm:text-[32px]">{c.name}</h1>
            </div>
            <div className="min-w-0">
              <p className="mt-2 text-base text-zinc-700">
                {c.control === "public" ? t("college.public") : t("college.private")} · {[c.city, c.state_region].filter(Boolean).join(", ")}
                {c.setting && ` · ${c.setting}`}
                {c.academic_calendar && ` · ${t("college.calendar", { x: c.academic_calendar })}`}
              </p>
              {general && (
                <p className="mt-3 flex items-center gap-2.5 text-[15px] sm:hidden">
                  <TierBadge tier={general} />
                  <span>{tierText}</span>
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] font-semibold">
                {c.website && (
                  <a className="text-blue-700 hover:underline" href={c.website} target="_blank" rel="noreferrer">
                    {t("college.website")}
                  </a>
                )}
                {c.admissions_url && (
                  <a className="text-blue-700 hover:underline" href={c.admissions_url} target="_blank" rel="noreferrer">
                    {t("college.admissions")}
                  </a>
                )}
                {tags.map((tag) => (
                  <Tag key={tag} tone="done" title={t(`colleges.tag.${tag}.title`)}>
                    {t(`colleges.tag.${tag}`)}
                  </Tag>
                ))}
              </div>
            </div>
          </div>
          <CollegeActions slug={c.slug} id={c.id} />
        </div>

        {/* The answer band: the four things a student decides on, in the page's largest type, headed by the student's own read
            of this college ("For you") once their profile holds a score. */}
        <div className="mt-7 overflow-hidden rounded-2xl bg-ink text-white">
        {isUS && <YouRow fitInput={fitInputFrom(c, stats?.cds_year, policy?.policy ?? null)} english={collegeEnglishFrom(c.english_policies, c.english_requirements)} recommended={recommended} />}
        <dl className="grid sm:grid-cols-2 lg:grid-cols-4">
          {isUS ? (
            <Answer
              label={<IntlSwap all={t("college.admitRate")} intl={hasIntlRate ? t("college.intlAdmitRate") : undefined} />}
              figure={stats?.admit_rate != null ? <IntlSwap all={fmtPct(stats.admit_rate)} intl={hasIntlRate ? fmtPct(stats.intl_admit_rate) : undefined} /> : missing}
              detail={
                <>
                  <IntlSwap
                    all={stats?.intl_admit_rate != null ? t("college.intlShort", { x: fmtPct(stats.intl_admit_rate) }) : t("college.intlShortNone")}
                    intl={hasIntlRate ? t("college.allShort", { x: fmtPct(stats?.admit_rate) }) : undefined}
                  />
                  <Ref n={ref(stats?.source_id)} light />
                </>
              }
            >
              <IntlSwap
                all={
                  <>
                    {stats?.admits != null && stats.applicants != null && (
                      <p>
                        {t("college.admittedOf", { x: fmtInt(stats.admits), y: fmtInt(stats.applicants) })}
                        <Ref n={ref(stats.source_id)} light />
                      </p>
                    )}
                    <p className="mt-1">
                      {stats?.intl_admit_rate != null ? (
                        <>
                          {t("college.intlAdmitRate")} <span className="font-semibold text-white">{fmtPct(stats.intl_admit_rate)}</span>
                          {stats.intl_applicants != null && ` (${t("college.xOfY", { x: fmtInt(stats.intl_admits), y: fmtInt(stats.intl_applicants) })})`}
                        </>
                      ) : (
                        t("college.intlNotPublished")
                      )}
                    </p>
                  </>
                }
                intl={
                  hasIntlRate ? (
                    <>
                      {stats?.intl_admits != null && stats.intl_applicants != null && (
                        <p>
                          {t("college.intlAdmittedOf", { x: fmtInt(stats.intl_admits), y: fmtInt(stats.intl_applicants) })}
                          <Ref n={ref(stats.source_id)} light />
                        </p>
                      )}
                      <p className="mt-1">
                        {t("college.allApplicants")} <span className="font-semibold text-white">{fmtPct(stats?.admit_rate)}</span>
                        {stats?.admits != null && stats.applicants != null && ` (${t("college.xOfY", { x: fmtInt(stats.admits), y: fmtInt(stats.applicants) })})`}
                      </p>
                    </>
                  ) : undefined
                }
              />
              <FitAnswer />
            </Answer>
          ) : (
            <Answer
              label={t("college.successRate")}
              figure={success.length ? (success[0] === success[success.length - 1] ? `${success[0]}%` : `${success[0]}–${success[success.length - 1]}%`) : missing}
              detail={programs.length ? t("college.courseCount", { n: programs.length }) : undefined}
            >
              <p>{programs.length ? t("college.courseCount", { n: programs.length }) : t("college.gradeOffers")}</p>
            </Answer>
          )}

          <Answer
            label={t("college.nextDeadline")}
            figure={next?.date ? monthDay(next.date) : rolling ? word(t("college.rolling")) : word(datedApps.length ? t("college.noUpcoming") : t("college.notPublishedYet"))}
            detail={
              next?.date ? (
                <>
                  {/* Phone only: the round on one line, the days on the next, so no separator is left hanging. */}
                  <span className="block">
                    {nextTitle}
                    {nextRefs.map((n) => (
                      <Ref key={n} n={n} light />
                    ))}
                  </span>
                  <span className={`block font-semibold whitespace-nowrap ${bandTone(referenceTone(daysUntil(next.date)))}`}>{daysWords(t, daysUntil(next.date))}</span>
                </>
              ) : rolling ? (
                <>
                  {shortName(rolling)}
                  <Ref n={rolling.n} light />
                </>
              ) : undefined
            }
          >
            {next?.date ? (
              <>
                <p className="font-semibold text-white">
                  {nextTitle}
                  {nextRefs.map((n) => (
                    <Ref key={n} n={n} light />
                  ))}
                </p>
                <p className="mt-1">
                  {fmtDate(next.date)} · <span className={`font-semibold ${bandTone(referenceTone(daysUntil(next.date)))}`}>{daysWords(t, daysUntil(next.date))}</span>
                </p>
                {then?.date && <p className="mt-1">{t("college.thenPlan", { plan: shortName(then), date: fmtDate(then.date) })}</p>}
              </>
            ) : rolling ? (
              <p>
                {t("college.rollingSub", { plan: rolling.title })}
                <Ref n={rolling.n} light />
              </p>
            ) : datedApps.length ? (
              <p>
                {t("college.allPassed", { cycle })} {t("college.lastWas", { date: fmtDate(datedApps[datedApps.length - 1].date) })}
              </p>
            ) : (
              <p>{entries.length ? t("college.noAppDeadline") : t("college.noDeadlines")}</p>
            )}
          </Answer>

          {isUS ? (
            <Answer
              label={bandTuition?.label ?? t("college.tuition")}
              figure={bandTuition ? fmtUsd(bandTuition.v) : missing}
              detail={
                cost ? (
                  <>
                    {cost.intl_aid_policy ? INTL_AID[cost.intl_aid_policy] : t("college.aidNotVerified")}
                    {bandTuition?.note && <span className="block">{bandTuition.note}</span>}
                    <span className="block">
                      {t("college.figuresFor", { year: cost.year })}
                      <Ref n={ref(cost.source_id)} light />
                    </span>
                  </>
                ) : undefined
              }
            >
              {cost && (
                <>
                  {bandTuition?.note && <p>{bandTuition.note}</p>}
                  {cost.room_board_usd != null && <p>{t("college.plusHousing", { x: fmtUsd(cost.room_board_usd) })}</p>}
                  <p className="mt-1 font-semibold text-white">{cost.intl_aid_policy ? INTL_AID[cost.intl_aid_policy] : t("college.aidNotVerified")}</p>
                  <p className="mt-1">
                    {t("college.figuresFor", { year: cost.year })}
                    <Ref n={ref(cost.source_id)} light />
                  </p>
                </>
              )}
            </Answer>
          ) : (
            <Answer
              label={fees.length > 1 && fees[0] !== fees[fees.length - 1] ? t("college.intlFeeFrom") : t("college.intlFeeYear")}
              figure={fees.length ? feeText(fees[0]) : missing}
              detail={fees.length > 1 && fees[0] !== fees[fees.length - 1] ? t("college.feeUpTo", { x: feeText(fees[fees.length - 1]) }) : undefined}
            >
              {fees.length > 1 && fees[0] !== fees[fees.length - 1] && <p>{t("college.feeUpTo", { x: feeText(fees[fees.length - 1]) })}</p>}
              {fees.length > 0 && fees.length < programs.length && <p className="mt-1">{t("college.feesMissing", { n: programs.length - fees.length })}</p>}
            </Answer>
          )}

          <Answer label={t("college.overallTier")} figure={general ? <BigTier tier={general} /> : missing} desktopOnly>
            <p>{tierText}</p>
            {strongest && <p className="mt-3 font-semibold text-white">{t("college.strongest", { tier: strongest.tier, list: strongest.list })}</p>}
          </Answer>
        </dl>
        </div>
        {isUS && (
          <div className="mt-4 empty:hidden sm:hidden">
            <FitAnswer light />
          </div>
        )}

        {isUS && (
          <>
            <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-6 lg:grid-cols-4 lg:px-6 xl:px-7">
              <Fact label={t("college.undergrads")} value={c.undergrad_enrollment != null ? fmtInt(c.undergrad_enrollment) : null} missing={t("college.notReported")}>
                {c.pct_international_ug != null && t("college.pctInternational", { x: fmtPct(c.pct_international_ug) })}
              </Fact>
              <Fact label={t("college.studentFaculty")} value={c.student_faculty_ratio ? `${Number(c.student_faculty_ratio)} : 1` : null} missing={t("college.notReported")} />
              <Fact label={t("college.edAdmitRate")} value={stats?.ed_admit_rate != null ? fmtPct(stats.ed_admit_rate) : null} missing={t("college.notReported")}>
                {stats?.ed_applicants != null && t("college.xOfY", { x: fmtInt(stats.ed_admits), y: fmtInt(stats.ed_applicants) })}
              </Fact>
              <Fact label={t("college.waitlist")} value={stats?.waitlist_admitted != null ? fmtInt(stats.waitlist_admitted) : null} missing={t("college.notReported")}>
                {stats?.waitlist_admitted != null && (stats.waitlist_offered ? t("college.waitlistSub", { n: fmtInt(stats.waitlist_offered) }) : t("college.waitlistSubShort"))}
              </Fact>
            </dl>
            {stats && (
              <div className="mt-5 max-w-5xl text-sm leading-relaxed text-zinc-600 lg:px-6 xl:px-7">
                <p>
                  {statsLabel}
                  <Ref n={ref(stats.source_id)} />
                  {stats.admits != null && stats.applicants != null && <span className="sm:hidden"> · {t("college.admittedOf", { x: fmtInt(stats.admits), y: fmtInt(stats.applicants) })}</span>}
                  {stats.intl_admit_rate != null && stats.intl_applicants != null && (
                    <span className="sm:hidden">
                      {" "}
                      · {t("college.intlAdmitRate")} {t("college.xOfY", { x: fmtInt(stats.intl_admits), y: fmtInt(stats.intl_applicants) })}
                    </span>
                  )}
                </p>
                {stats.notes && <Note text={stats.notes} label={t("college.details")} />}
              </div>
            )}
          </>
        )}
      </header>

      {/* A direct child of the article, so it stays stuck under the site header for the whole page. */}
      <JumpNav items={jump} label={t("college.onThisPage")} />

      <div className="mt-12 space-y-20 lg:space-y-28">
        {isUS && (
          <div id="scores" className="space-y-16 lg:space-y-20">
            <section aria-labelledby="tests-heading">
              <h2 id="tests-heading" className={H2}>
                {t("college.testScoresTitle")}
              </h2>
              <div className="mt-4 grid items-start gap-x-16 gap-y-8 lg:grid-cols-12">
                <div className="min-w-0 lg:order-2 lg:col-span-5">
              {policy && (
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base">
                  <Tag tone={policy.policy === "required" ? "soon" : "progress"}>{TEST_POLICY[policy.policy] ?? policy.policy}</Tag>
                  <span>
                    {t("college.forCycleApplicants", { cycle: policy.cycle })}
                    <Ref n={ref(policy.source_id)} />
                  </span>
                </p>
              )}
              {policy?.notes && <Note text={policy.notes} label={t("college.details")} className="mt-2 max-w-[68ch]" />}
              {ranges.length > 0 && (
                <div className="mt-7 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-1">
                  {ranges.map((r) => (
                    <ScoreRange key={r.test} {...r} />
                  ))}
                </div>
              )}
                </div>
                <div className="min-w-0 lg:order-1 lg:col-span-7">
              {scores.length > 0 ? (
                <table className="w-full text-base">
                  <thead>
                    <tr className="text-left text-sm text-zinc-600">
                      <th className="py-2 font-medium">{t("college.colTest")}</th>
                      <th className="py-2 text-right font-medium">{t("college.col25")}</th>
                      <th className="py-2 text-right font-medium">{t("college.col50")}</th>
                      <th className="py-2 text-right font-medium">{t("college.col75")}</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {[
                      ["SAT_TOTAL", t("college.satTotal")],
                      ["SAT_ERW", t("college.satErw")],
                      ["SAT_MATH", t("college.satMath")],
                      ["ACT_COMPOSITE", t("college.actComposite")],
                      ["ACT_MATH", t("college.actMath")],
                      ["ACT_ENGLISH", t("college.actEnglish")],
                    ].map(([k, label]) => {
                      const s = score(k);
                      if (!s) return null;
                      return (
                        <tr key={k} className="border-t border-zinc-200">
                          <td className="py-2.5 pr-3">{label}</td>
                          <td className="py-2.5 text-right">{fmtScore(s.p25)}</td>
                          <td className="py-2.5 text-right font-semibold">{fmtScore(s.p50)}</td>
                          <td className="py-2.5 text-right">{fmtScore(s.p75)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <p className="text-base">{policy?.policy === "blind" ? t("college.testBlind") : t("college.noScores")}</p>
              )}
              {stats && (stats.pct_submit_sat != null || stats.pct_submit_act != null) && (
                <p className="mt-3 text-sm text-zinc-600">{t("college.submittedScores", { sat: fmtPct(stats.pct_submit_sat, 0), act: fmtPct(stats.pct_submit_act, 0) })}</p>
              )}
                </div>
              </div>
            </section>

            <section aria-labelledby="gpa-heading">
              <h2 id="gpa-heading" className={H2}>
                {t("college.gpaTitle")}
              </h2>
              {stats?.gpa_avg != null || stats?.gpa_distribution ? (
                <div className="mt-5 grid items-start gap-x-16 gap-y-7 lg:grid-cols-12">
                  <div className="min-w-0 lg:col-span-5">
                  <div className="flex flex-wrap gap-x-12 gap-y-5">
                    <div>
                      <div className="text-sm text-zinc-600">{t("college.gpaAverage")}</div>
                      <div className="mt-2 font-display text-[32px] leading-none font-bold tabular-nums">{stats?.gpa_avg != null ? Number(stats.gpa_avg).toFixed(2) : <span className="text-xl text-zinc-600">{t("college.notReported")}</span>}</div>
                    </div>
                    {gpaEst && (
                      <div>
                        <div className="text-sm text-zinc-600">{t("college.gpaEstimated")}</div>
                        <div className="mt-2 font-display text-2xl leading-8 font-bold tabular-nums">
                          {gpaEst.p25.toFixed(2)} / {gpaEst.p50.toFixed(2)} / {gpaEst.p75.toFixed(2)}
                        </div>
                      </div>
                    )}
                  </div>
                  <p className="mt-5 text-sm leading-relaxed text-zinc-600">{t("college.gpaFootnote", { pct: fmtPct(stats?.pct_reporting_gpa, 0) })}</p>
                  </div>
                  {stats?.gpa_distribution && (
                    <ul className="min-w-0 space-y-3 lg:col-span-7">
                      {GPA_BAND_ORDER.filter((k) => stats.gpa_distribution?.[k]).map((k) => (
                        <li key={k} className="grid grid-cols-[5.5rem_1fr_3.75rem] items-center gap-3 text-sm tabular-nums">
                          <span className="text-zinc-600">{k}</span>
                          <span className="h-2.5 rounded-full bg-zinc-100">
                            <span className="block h-2.5 rounded-full bg-blue-500" style={{ width: `${Math.min(100, stats.gpa_distribution![k])}%` }} />
                          </span>
                          <span className="text-right font-semibold">{fmtPct(stats.gpa_distribution![k])}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-base">{baseline ? t("college.gpaBaseline") : t("college.gpaNone")}</p>
              )}
            </section>
          </div>
        )}

        {programs.length > 0 && (
          <section id="courses" aria-labelledby="courses-heading">
            <h2 id="courses-heading" className={H2}>
              {t("college.coursesTitle")}
            </h2>
            <p className="mt-3 max-w-[68ch] text-base leading-relaxed">{t("college.courseNote")}</p>
            <ul className="mt-7 border-t border-zinc-200">
              {programs.map((p) => {
                const via = programApplyVia(p, c.country_code);
                const fee = programFee(p);
                return (
                  <li key={p.id} className="grid gap-x-16 gap-y-5 border-b border-zinc-200 py-7 lg:grid-cols-12">
                    <div className="min-w-0 lg:col-span-4">
                      <h3 className="font-display text-xl leading-snug font-bold">{p.name}</h3>
                      <p className="mt-3 flex flex-wrap gap-1.5">
                        {p.ucas_code && <Tag>{p.ucas_code}</Tag>}
                        {via && <Tag tone="progress">{t("college.applyVia", { x: via })}</Tag>}
                        {p.award && <Tag>{p.award}</Tag>}
                        {p.duration_years != null && <Tag>{t("college.nYears", { n: p.duration_years })}</Tag>}
                      </p>
                      {p.application_deadline && (
                        <p className="mt-3 text-base">
                          {t("college.applyBy")} <span className="font-semibold">{fmtDate(p.application_deadline)}</span> ·{" "}
                          <span className={`font-semibold ${pageTone(referenceTone(daysUntil(p.application_deadline)))}`}>{daysWords(t, daysUntil(p.application_deadline))}</span>
                        </p>
                      )}
                      <p className="mt-3 text-sm">
                        <a className="font-semibold text-blue-700 hover:underline" href={p.source_url} target="_blank" rel="noreferrer">
                          {t("college.coursePage")}
                        </a>{" "}
                        <span className="text-zinc-600">{t("college.checked", { date: fmtDate(p.retrieved_on) })}</span>
                      </p>
                    </div>
                    <dl className="grid min-w-0 gap-x-10 gap-y-4 sm:grid-cols-2 lg:col-span-8">
                      <Offer k={t("college.aLevels")} v={p.a_level_offer} missing={t("college.notPublished")} />
                      <Offer k={t("college.ib")} v={p.ib_offer ?? (p.ib_points != null ? t("college.nPoints", { n: p.ib_points }) : null)} missing={t("college.notPublished")} />
                      <Offer k={t("college.apOffer")} v={p.ap_offer} missing={t("college.notPublished")} />
                      {(p.atar != null || c.country_code === "AU") && <Offer k={t("college.atar")} v={p.atar != null ? Number(p.atar).toFixed(2) : null} missing={t("college.notPublished")} />}
                      <Offer k={t("college.subjects")} v={p.required_subjects} missing={t("college.notPublished")} />
                      <Offer k={t("college.admissionsTest")} v={p.admissions_test ?? t("college.noneListed")} missing="" />
                      <Offer
                        k={t("college.ielts")}
                        v={p.ielts_overall != null ? `${t("college.ieltsOverall", { n: p.ielts_overall })}${p.ielts_component != null ? t("college.ieltsEach", { n: p.ielts_component }) : ""}` : null}
                        missing={t("college.notPublished")}
                      />
                      {p.toefl_note && <Offer k={t("college.toefl")} v={p.toefl_note} missing="" />}
                      <Offer k={t("college.intlFee")} v={fee ? t("college.perYear", { fee }) : null} missing={t("college.notFound")} />
                      {p.success_pct != null && (
                        <Offer
                          k={t("college.applicants")}
                          v={`${p.interviewed_pct != null ? t("college.pctInterviewed", { n: p.interviewed_pct }) : ""}${t("college.pctSuccessful", { n: p.success_pct })}${p.intake != null ? t("college.aboutPlaces", { n: p.intake }) : ""}`}
                          missing=""
                        />
                      )}
                      {(p.english_note || p.notes) && <Note text={[p.english_note, p.notes].filter(Boolean).join(" ")} label={t("college.details")} className="sm:col-span-2" />}
                    </dl>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Deadlines: a timetable in date order, with today marked between what has passed and what is coming. */}
        <section id="deadlines" aria-labelledby="deadlines-heading">
          <h2 id="deadlines-heading" className={H2}>
            {t("college.deadlinesTitle", { cycle })}
          </h2>
          {entries.length ? (
            <div className="mt-6 grid items-start gap-x-16 gap-y-10 lg:grid-cols-12">
              <ol className={`-mx-2 border-t-2 border-ink sm:-mx-3 ${plansHere.length ? "lg:col-span-8" : "lg:col-span-12"}`}>
                {entries.map((e, i) => (
                  <TimetableRows key={e.key} e={e} t={t} usOnly={usOnly(e)} today={i === firstUpcoming ? todayTarget : null} />
                ))}
                {firstUpcoming < 0 && entries.some((e) => e.date) && <TodayRow t={t} text={t("college.allPassed", { cycle })} />}
              </ol>
              {plansHere.length > 0 && (
                <div className="min-w-0 lg:col-span-4">
                  <h3 className="text-lg font-semibold">{t("college.plansTitle")}</h3>
                  <ul className="mt-4 space-y-3.5">
                    {plansHere.map((p) => (
                      <li key={p.key} className="grid grid-cols-[3.5rem_1fr] items-baseline gap-3 text-base">
                        <span>
                          <Tag tone={p.binding ? "soon" : "neutral"}>{p.key}</Tag>
                        </span>
                        <span>
                          <span className="font-semibold">{p.label}</span>
                          <span className="block text-sm text-zinc-600">{p.description ?? (p.binding ? t("college.binding") : t("college.notBinding"))}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  {plansHere.some((p) => p.binding) && <p className="mt-5 text-sm leading-relaxed text-zinc-600">{t("college.bindingNote")}</p>}
                </div>
              )}
            </div>
          ) : (
            <p className="mt-4 text-base">{t("college.noDeadlines")}</p>
          )}
        </section>

        <div className="grid items-start gap-x-16 gap-y-16 lg:grid-cols-12">
          {(isUS || c.english_requirements.length > 0) && (
            <section id="english" className={`min-w-0 ${isUS ? "lg:col-span-7" : "lg:col-span-12"}`} aria-labelledby="english-heading">
              <h2 id="english-heading" className={H2}>
                {t("college.englishTitle")}
              </h2>
              {c.english_policies ? (
                <>
                  <p className="mt-3 text-lg font-semibold">
                    {ENGLISH_POLICY[c.english_policies.policy] ?? c.english_policies.policy}
                    <Ref n={ref(c.english_policies.source_id)} />
                  </p>
                  {c.english_policies.waiver_notes && <p className="mt-2 max-w-[68ch] text-base leading-relaxed text-zinc-700">{c.english_policies.waiver_notes}</p>}
                </>
              ) : c.english_requirements.length === 0 ? (
                <p className="mt-3 text-base">{t("college.notRecorded")}</p>
              ) : null}
              <EnglishCheck english={collegeEnglishFrom(c.english_policies, c.english_requirements)} recommended={recommended} className="mt-3" />
              {c.english_requirements.length > 0 && (
                <>
                  <table className="mt-6 hidden w-full text-base sm:table">
                    <thead>
                      <tr className="text-left text-sm text-zinc-600">
                        <th className="py-2 font-medium">{t("college.colTest")}</th>
                        <th className="py-2 pl-4 text-right font-medium">{t("college.colMinimum")}</th>
                        <th className="py-2 pl-4 text-right font-medium">{t("college.colRecommended")}</th>
                        <th className="py-2 pl-6 font-medium">{t("college.colNotes")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.english_requirements.map((e) => (
                        <tr key={e.test_key} className="border-t border-zinc-200 align-top">
                          <td className="py-3 font-medium">
                            {testName(e.test_key)}
                            <Ref n={ref(e.source_id)} />
                            {e.status === "accepted" && <div className="text-sm font-normal text-zinc-600">{ENGLISH_STATUS[e.status]}</div>}
                          </td>
                          <td className="py-3 pl-4 text-right font-semibold tabular-nums">{fmtScore(e.min_total)}</td>
                          <td className="py-3 pl-4 text-right font-semibold tabular-nums">{fmtScore(e.recommended_total)}</td>
                          <td className="py-3 pl-6 text-sm leading-relaxed text-zinc-600">
                            <EnglishNotes e={e} t={t} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <ul className="mt-5 border-t border-zinc-200 sm:hidden">
                    {c.english_requirements.map((e) => (
                      <li key={e.test_key} className="border-b border-zinc-200 py-3">
                        <div className="flex items-baseline justify-between gap-4">
                          <span className="font-medium">
                            {testName(e.test_key)}
                            <Ref n={ref(e.source_id)} />
                          </span>
                          <span className="shrink-0 text-right text-sm text-zinc-600 tabular-nums">
                            {t("college.colMinimum")} <span className="text-base font-semibold text-ink">{fmtScore(e.min_total)}</span> · {t("college.colRecommended")}{" "}
                            <span className="text-base font-semibold text-ink">{fmtScore(e.recommended_total)}</span>
                          </span>
                        </div>
                        {e.status === "accepted" && <p className="text-sm text-zinc-600">{ENGLISH_STATUS[e.status]}</p>}
                        <p className="mt-1 text-sm leading-relaxed text-zinc-600">
                          <EnglishNotes e={e} t={t} />
                        </p>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              <p className="mt-4 text-sm text-zinc-600">{t("college.toeflNote")}</p>
            </section>
          )}

          {isUS && (
            <section id="requirements" className="min-w-0 rounded-2xl bg-blue-50 p-6 sm:p-8 lg:col-span-5" aria-labelledby="requirements-heading">
              <h2 id="requirements-heading" className={H2}>
                {t("college.requirementsTitle")}
              </h2>
              {req ? (
                <dl className="mt-5 grid grid-cols-[max-content_1fr] gap-x-6 gap-y-3.5 text-base">
                  <Row k={t("college.platform")} v={req.platforms.map((p) => PLATFORM[p] ?? p).join(", ") || <Muted>{t("college.notPublished")}</Muted>} />
                  <Row
                    k={t("college.appFee")}
                    v={req.app_fee_usd != null ? (req.fee_waiver ? t("college.feeWithWaiver", { fee: fmtUsd(req.app_fee_usd) }) : fmtUsd(req.app_fee_usd)) : req.fee_waiver ? t("college.feeWaiverAvailable") : <Muted>{t("college.notPublished")}</Muted>}
                  />
                  <Row k={t("college.essays")} v={<EssaysRequirement slug={c.slug} fallback={req.supplemental_essays} t={t} />} />
                  <Row k={t("college.recommendations")} v={req.teacher_recs != null ? t(req.counselor_rec ? "college.nTeacherCounselor" : "college.nTeacher", { n: req.teacher_recs }) : <Muted>{t("college.notPublished")}</Muted>} />
                  <Row k={t("college.interview")} v={req.interview ? INTERVIEW[req.interview] : <Muted>{t("college.notPublished")}</Muted>} />
                  <Row k={t("college.portfolio")} v={req.portfolio ?? <Muted>{t("college.notPublished")}</Muted>} />
                  {req.midyear_report != null && <Row k={t("college.midyearReport")} v={req.midyear_report ? t("college.required") : t("college.notRequired")} />}
                  {(req.css_profile_required || req.fafsa_required) && (
                    <Row
                      k={t("college.aidForms")}
                      v={
                        <>
                          {[req.css_profile_required && "CSS Profile", req.fafsa_required && "FAFSA"].filter(Boolean).join(" + ")}
                          {noIntlAid ? (
                            <span className="block text-sm font-semibold text-zinc-600">{t("college.notForIntl")}</span>
                          ) : (
                            req.fafsa_required && <span className="block text-sm text-zinc-600">{t("college.fafsaUsOnly")}</span>
                          )}
                        </>
                      }
                    />
                  )}
                </dl>
              ) : (
                <p className="mt-4 text-base">{t("college.notRecordedYet")}</p>
              )}
              {req?.notes && <Note text={req.notes} label={t("college.details")} className="mt-4" />}
              {req && (
                <p className="mt-2 text-sm text-zinc-600">
                  {t("college.cycleSuffix", { cycle: req.cycle })}
                  <Ref n={ref(req.source_id)} />
                </p>
              )}
            </section>
          )}
        </div>

        {isUS && <CollegeSupplementsSection slug={c.slug} offset={c.sources.length} t={t} />}

        {/* Cost & aid: the bill on the left, what an international student can expect on the right. */}
        {isUS && (
          <section id="cost" aria-labelledby="cost-heading">
            <h2 id="cost-heading" className={H2}>
              {cost ? t("college.costTitleYear", { year: cost.year }) : t("college.costTitle")}
            </h2>
            {cost ? (
              <div className="mt-6 grid items-start gap-x-16 gap-y-10 lg:grid-cols-12">
                <div className="min-w-0 lg:col-span-6">
                  <p className="text-sm text-zinc-600">{t("college.publishedFigures")}</p>
                  <dl className="mt-2 text-base tabular-nums">
                    <Line k={cost.tuition_out_of_state_usd ? t("college.tuitionInState") : t("college.tuition")} v={fmtUsd(cost.tuition_usd)} missing={t("college.notPublished")} raw={cost.tuition_usd} n={ref(cost.source_id)} />
                    {cost.tuition_out_of_state_usd != null && <Line k={t("college.tuitionOut")} v={fmtUsd(cost.tuition_out_of_state_usd)} n={ref(cost.source_id)} />}
                    {cost.tuition_intl_usd != null && <Line k={t("college.tuitionIntl")} v={fmtUsd(cost.tuition_intl_usd)} n={ref(cost.source_id)} />}
                    {cost.required_fees_usd != null && <Line k={t("college.requiredFees")} v={fmtUsd(cost.required_fees_usd)} n={ref(cost.source_id)} />}
                    {cost.intl_extra_fees_usd != null && <Line k={t("college.intlFee")} v={fmtUsd(cost.intl_extra_fees_usd)} n={ref(cost.source_id)} />}
                    <Line k={t("college.housingFood")} v={fmtUsd(cost.room_board_usd)} missing={t("college.notPublished")} raw={cost.room_board_usd} n={ref(cost.source_id)} />
                  </dl>
                  {cost.total_coa_usd != null ? (
                    <div className="mt-6 rounded-2xl bg-zinc-50 p-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                        <span className="font-semibold">
                          {inStateTotal ? t("college.totalLikelyInState") : t("college.totalCoaPublished")}
                          <Ref n={ref(cost.source_id)} />
                        </span>
                        <span className={`font-display tabular-nums ${inStateTotal ? "text-xl font-semibold text-zinc-600" : "text-2xl font-bold"}`}>{fmtUsd(cost.total_coa_usd)}</span>
                      </div>
                      {inStateTotal && <p className="mt-2 text-base leading-snug font-semibold">{t("college.totalBelow", { what: inStateTotal.what, sum: fmtUsd(inStateTotal.sum) })}</p>}
                      {partsBelow != null && <p className="mt-2 text-base leading-snug font-semibold">{t("college.totalBelowParts", { sum: fmtUsd(partsBelow) })}</p>}
                      <p className="mt-2 text-sm leading-relaxed text-zinc-700">{cost.notes ?? t("college.totalCoaNoNote")}</p>
                    </div>
                  ) : (
                    cost.notes && <Note text={cost.notes} label={t("college.details")} className="mt-4" />
                  )}
                </div>
                <div className="min-w-0 rounded-2xl bg-blue-50 p-6 sm:p-8 lg:col-span-6">
                  <h3 className="text-base font-semibold text-zinc-700">{t("college.forIntl")}</h3>
                  <p className="mt-2 font-display text-2xl leading-tight font-bold">{cost.intl_aid_policy ? INTL_AID[cost.intl_aid_policy] : t("college.aidNotVerified")}</p>
                  {cost.intl_need_aid_awarded != null && <p className="mt-2 text-base">{t("college.intlAidReceived", { n: fmtInt(cost.intl_need_aid_awarded), avg: fmtUsd(cost.intl_avg_award_usd) })}</p>}
                  <IntlFinanceNote slug={c.slug} offset={c.sources.length} t={t} />
                </div>
              </div>
            ) : (
              <p className="mt-4 text-base">{t("college.notRecordedYet")}</p>
            )}
          </section>
        )}

        {/* Subject tiers on the left, how each major is admitted on the right. */}
        {isUS && (
          <section id="tiers" aria-labelledby="tiers-heading">
            <h2 id="tiers-heading" className={H2}>
              {t("college.tiersTitle")}
            </h2>
            <div className="mt-6 grid items-start gap-x-16 gap-y-10 lg:grid-cols-12">
              {reasonOf(generalRow?.rationale) && (
                <p className="max-w-[72ch] text-base leading-relaxed lg:col-span-12">
                  <span className="font-semibold">{t("college.overallTierIs", { tier: generalRow!.tier_code })}</span> {reasonOf(generalRow?.rationale)}
                </p>
              )}
              <ul className={`grid gap-x-8 gap-y-4 sm:grid-cols-2 ${c.major_admissions.length ? "lg:col-span-5 lg:grid-cols-1" : "lg:col-span-12 lg:grid-cols-3"}`}>
                {lookups.categories
                  .filter((cat) => cat.key !== "general")
                  .map((cat) => {
                    const catTier = c.institution_tiers.find((x) => x.category_key === cat.key);
                    return (
                      <li key={cat.key} className="flex items-start gap-3 text-base">
                        {catTier ? <TierBadge tier={catTier.tier_code} /> : <span className="inline-flex h-7 w-7 shrink-0 rounded-md border border-dashed border-zinc-300" aria-hidden="true" />}
                        <span className={`min-w-0 pt-0.5 ${catTier ? "" : "text-zinc-600"}`}>
                          {cat.label}
                          {!catTier && <span className="text-sm"> · {t("college.notRated")}</span>}
                          {reasonOf(catTier?.rationale) && <span className="mt-0.5 block text-sm leading-snug text-zinc-600">{reasonOf(catTier?.rationale)}</span>}
                        </span>
                      </li>
                    );
                  })}
              </ul>
              {c.major_admissions.length > 0 && (
                <ul className="min-w-0 border-t border-zinc-200 lg:col-span-7">
                  {c.major_admissions.map((m) => (
                    <li key={m.id} className="border-b border-zinc-200 py-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-lg font-semibold">{m.program}</span>
                        {m.category_key && <Tag>{catLabel(m.category_key)}</Tag>}
                        {m.capped && <Tag tone="urgent">{t("college.capped")}</Tag>}
                      </div>
                      <p className="mt-1 text-base text-zinc-700">{t("college.switchingIn", { model: ADMIT_MODEL[m.admit_model] ?? "", x: m.internal_transfer ? TRANSFER[m.internal_transfer] : "—" })}</p>
                      {m.notes && <p className="mt-1 text-sm leading-relaxed text-zinc-600">{m.notes}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="mt-5 text-sm text-zinc-600">{t("college.tiersNote")}</p>
          </section>
        )}

        {isUS && <CollegeOutcomes slug={c.slug} />}

        {/* What counts: four columns, the bar over each one darker the more the office weighs it. */}
        {c.admission_factors.length > 0 && (
          <section id="factors" aria-labelledby="factors-heading">
            <h2 id="factors-heading" className={H2}>
              {t("college.factorsTitle", { year: c.admission_factors[0].cds_year })}
            </h2>
            <div className="mt-6 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {(["very_important", "important", "considered", "not_considered"] as const).map((imp) => {
                const list = c.admission_factors.filter((f) => f.importance === imp);
                return (
                  <div key={imp}>
                    <div className={`h-1.5 rounded-full ${WEIGHT_BAR[imp]}`} aria-hidden="true" />
                    <h3 className="mt-3 text-lg font-semibold">{IMPORTANCE[imp]}</h3>
                    {list.length ? (
                      <ul className="mt-2 space-y-1.5 text-base">
                        {list.map((f) => (
                          <li key={f.factor}>{FACTOR[f.factor] ?? f.factor}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-base text-zinc-600">{t("college.noneHere")}</p>
                    )}
                  </div>
                );
              })}
            </div>
            {c.admission_factors.some((f) => f.factor === "demonstrated_interest" && f.importance !== "not_considered") && (
              <p className="mt-7 flex flex-wrap items-center gap-2 text-base">
                <Tag tone="progress">{t("college.tip")}</Tag>
                <span>{t("college.interestTip")}</span>
              </p>
            )}
          </section>
        )}

        <section id="sources" aria-labelledby="sources-heading">
          <h2 id="sources-heading" className={H2}>
            {t("college.sourcesTitle")}
          </h2>
          <ol className="mt-6 gap-x-16 lg:columns-2">
            {c.sources.map((s, i) => (
              <SourceItem key={s.id} n={i + 1} url={s.url} title={s.title ?? s.url} accessed={t("college.accessed", { date: fmtDate(s.accessed_on) })} />
            ))}
            <SupplementSourceItems slug={c.slug} offset={c.sources.length} t={t} />
          </ol>
        </section>

        <Link href="/colleges" className="inline-block text-base font-semibold text-blue-700 hover:underline">
          {t("college.allColleges")}
        </Link>
      </div>
    </article>
  );
}

function fitInputFrom(c: CollegeDetail, cdsYear: string | undefined, testPolicy: string | null) {
  const stats = c.admission_stats.find((s) => s.cds_year === cdsYear);
  const s = (t: string) => c.test_score_percentiles.find((x) => x.cds_year === cdsYear && x.test === t);
  return {
    admit_rate: stats?.admit_rate ?? null,
    intl_admit_rate: stats?.intl_admit_rate ?? null,
    sat_p25: s("SAT_TOTAL")?.p25 ?? null,
    sat_p75: s("SAT_TOTAL")?.p75 ?? null,
    act_p25: s("ACT_COMPOSITE")?.p25 ?? null,
    act_p75: s("ACT_COMPOSITE")?.p75 ?? null,
    test_policy: testPolicy,
  };
}

/** "Nov 1": the band and the timetable carry the year on their second line. */
function monthDay(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function daysWords(t: TFunction, days: number) {
  if (days < 0) return t("status.deadline.passed");
  if (days === 0) return t("status.deadline.today");
  if (days === 1) return t("status.deadline.tomorrow");
  return t("status.deadline.days", { n: days });
}

// Days-left colour: on the navy band the brand's coral and sun (both over 5:1 on ink), on white the status tokens.
const BAND_TONE: Record<Tone, string> = { urgent: "text-coral", soon: "text-sun", done: "text-white", progress: "text-white", neutral: "text-white" };
const bandTone = (tone: Tone) => BAND_TONE[tone];
const PAGE_TONE: Record<Tone, string> = { urgent: "text-urgent", soon: "text-soon", done: "text-done", progress: "text-ink", neutral: "text-zinc-600" };
const pageTone = (tone: Tone) => PAGE_TONE[tone];

const WEIGHT_BAR: Record<string, string> = { very_important: "bg-ink", important: "bg-blue-600", considered: "bg-blue-300", not_considered: "bg-zinc-200" };

/** One of the four answers in the navy band: four across on a desktop, two by two on a tablet, and on a phone a list where the
 *  label and the figure share a line and the detail runs under them. The dividers are an opaque step (zinc-700) off the ink. */
function Answer({ label, figure, detail, desktopOnly = false, children }: { label: React.ReactNode; figure: React.ReactNode; detail?: React.ReactNode; desktopOnly?: boolean; children?: React.ReactNode }) {
  return (
    <div
      className={`min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 border-t border-zinc-700 px-5 py-3.5 first:border-t-0 sm:block sm:border-t-0 sm:px-7 sm:py-6 sm:nth-[2n]:border-l sm:nth-[n+3]:border-t lg:border-l lg:px-6 lg:py-7 lg:first:border-l-0 lg:nth-[n+3]:border-t-0 xl:px-7 ${desktopOnly ? "hidden" : "grid"}`}
    >
      <dt className="text-sm font-semibold text-sky">{label}</dt>
      <dd className="row-span-2 text-right font-display text-[28px] leading-none font-bold tracking-tight tabular-nums sm:mt-3 sm:text-left sm:text-[40px] xl:text-[44px]">{figure}</dd>
      {detail && <dd className="col-start-1 mt-0.5 text-sm leading-snug text-blue-100 sm:hidden">{detail}</dd>}
      {children && <dd className="mt-3 hidden text-base leading-snug text-blue-100 sm:block">{children}</dd>}
    </div>
  );
}

/** The overall tier at figure size, in the tier ladder's own marks turned for a navy ground: filled for S, heavier outlines higher up. */
const BIG_TIER: Record<string, string> = {
  S: "bg-white text-ink border-2 border-white",
  A: "border-[3px] border-white text-white",
  B: "border-2 border-blue-200 text-white",
  C: "border border-blue-200 text-blue-100",
  D: "border border-dashed border-blue-200 text-blue-100",
};
function BigTier({ tier }: { tier: TierCode }) {
  return <span className={`inline-flex h-12 min-w-12 items-center justify-center rounded-xl px-2.5 text-[28px] lg:h-14 lg:min-w-14 lg:text-[32px] ${BIG_TIER[tierLetter(tier)]}`}>{tier}</span>;
}

function Fact({ label, value, missing, children }: { label: string; value: string | null; missing: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-zinc-600">{label}</dt>
      <dd className="mt-1.5 font-display text-2xl leading-tight font-bold tabular-nums">{value ?? <span className="text-lg text-zinc-600">{missing}</span>}</dd>
      {children && <dd className="mt-0.5 text-sm text-zinc-600">{children}</dd>}
    </div>
  );
}

/** One deadline row, preceded by the "Today" row when it is the first deadline still to come. */
function TimetableRows({ e, t, today, usOnly }: { e: Entry; t: TFunction; today: { date: string | null; title: string } | null; usOnly: boolean }) {
  const days = e.date ? daysUntil(e.date) : null;
  const past = days !== null && days < 0;
  return (
    <>
      {today && !today.date && <TodayRow t={t} text={today.title} />}
      {today?.date && (
        <TodayRow
          t={t}
          text={(() => {
            const n = daysUntil(today.date);
            return n === 0 ? t("college.dueToday", { plan: today.title }) : n === 1 ? t("college.oneDayUntil", { plan: today.title }) : t("college.daysUntil", { n, plan: today.title });
          })()}
        />
      )}
      <li className="grid grid-cols-[5rem_1fr] gap-x-3 border-b border-zinc-200 px-2 py-4 sm:grid-cols-[7rem_1fr_8rem] sm:gap-x-8 sm:px-3">
        <div className={past || usOnly ? "text-zinc-600" : ""}>
          <div className="font-display text-xl leading-none font-bold whitespace-nowrap tabular-nums sm:text-2xl">{e.date ? monthDay(e.date) : "—"}</div>
          {e.date && <div className="mt-1.5 text-sm text-zinc-600 tabular-nums">{e.date.slice(0, 4)}</div>}
        </div>
        <div className="min-w-0">
          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 text-lg leading-snug ${usOnly ? "font-medium text-zinc-600" : "font-semibold"}`}>
            <span>
              {e.title}
              <Ref n={e.n} />
            </span>
            {e.tags.map((x) => (
              <Tag key={x}>{x}</Tag>
            ))}
            {e.kind && <Tag tone={usOnly ? "neutral" : "progress"}>{e.kind}</Tag>}
          </p>
          {usOnly && <p className="mt-1 text-sm font-semibold text-zinc-600">{t("college.notForIntl")}</p>}
          {e.decision && <p className="mt-1 text-base text-zinc-700">{e.decision}</p>}
          {e.notes && <Note text={e.notes} label={t("college.details")} className="mt-1" />}
        </div>
        {days !== null && !usOnly && <div className={`col-start-2 mt-2 text-base font-semibold tabular-nums sm:col-start-auto sm:mt-0 sm:text-right ${pageTone(referenceTone(days))}`}>{daysWords(t, days)}</div>}
      </li>
    </>
  );
}

function TodayRow({ t, text }: { t: TFunction; text: string }) {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return (
    <li aria-current="date" className="grid grid-cols-[5rem_1fr] items-center gap-x-3 border-b border-zinc-200 bg-blue-50 px-2 py-3.5 sm:grid-cols-[7rem_1fr_8rem] sm:gap-x-8 sm:px-3">
      <div>
        <div className="font-display text-xl leading-none font-bold text-blue-700">{t("college.todayRow")}</div>
        <div className="mt-1.5 text-sm text-zinc-600 tabular-nums">{monthDay(iso)}</div>
      </div>
      <p className="text-base font-semibold sm:col-span-2">{text}</p>
    </li>
  );
}

function EnglishNotes({ e, t }: { e: CollegeDetail["english_requirements"][number]; t: TFunction }) {
  return (
    <>
      {e.min_subscores && (
        <span className="block">
          {t("college.subscores")}{" "}
          {Object.entries(e.min_subscores)
            .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}+`)
            .join(", ")}
        </span>
      )}
      {e.notes}
    </>
  );
}

function Offer({ k, v, missing }: { k: string; v: string | null; missing: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-zinc-600">{k}</dt>
      <dd className="mt-0.5 text-base leading-relaxed">{v ?? <span className="text-zinc-600">{missing}</span>}</dd>
    </div>
  );
}

/** A line of the cost bill: label left, figure right. A missing figure says so in words. */
function Line({ k, v, missing, raw, n }: { k: string; v: string; missing?: string; raw?: number | null; n?: number }) {
  const absent = raw === null && missing;
  return (
    <div className="flex items-baseline justify-between gap-6 border-b border-zinc-200 py-3">
      <dt>
        {k}
        <Ref n={n} />
      </dt>
      <dd className={absent ? "text-zinc-600" : "text-lg font-semibold"}>{absent ? missing : v}</dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-zinc-600">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-zinc-600">{children}</span>;
}
