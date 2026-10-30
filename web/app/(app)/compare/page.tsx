import Link from "next/link";
import { Fragment, Suspense } from "react";
import { ApplyTags, Pill, SchoolLogo, TierBadge } from "@/components/badges";
import { CompareAdd, CompareFitBadge, CompareFitHint, CompareFromList } from "@/components/ComparePicker";
import { compareHref, MAX_COMPARE, parseCompare, type CompareOption } from "@/lib/compare";
import { CompareRange } from "@/components/CompareRange";
import { CompareTable } from "@/components/CompareTable";
import { StatusIcon } from "@/components/StatusPill";
import { applyTags } from "@/lib/apply-tags";
import { narrowFlags } from "@/lib/explore-filters";
import { getAppFees, getDeadlines, getLookups, getSummaries } from "@/lib/data";
import { daysUntil, ENGLISH_POLICY, fmtDate, fmtInt, fmtPct, fmtUsd, INTL_AID, TEST_POLICY } from "@/lib/format";
import { referenceTone, URGENT_DAYS } from "@/lib/status";
import { getT } from "@/lib/i18n/server";
import type { TFunction } from "@/lib/i18n";
import { collegeSupplements } from "@/lib/supplements-data";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, PAGE_INTRO, PAGE_TITLE, PANEL, SECTION_TITLE, toneClass } from "@/lib/ui";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata("/compare");

/** Ready-made comparisons for the empty page. Slugs missing from the data are dropped. */
const IDEAS = [
  { key: "tech", slugs: ["mit", "stanford", "carnegie-mellon"] },
  { key: "bigPublic", slugs: ["umich", "uiuc", "georgia-tech", "purdue"] },
  { key: "uc", slugs: ["ucla", "uc-berkeley", "uc-san-diego"] },
  { key: "ivy", slugs: ["harvard", "yale", "princeton"] },
] as const;

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <div data-app-screen className="space-y-6">
      <Suspense fallback={<div className="h-16" />}>
        <Heading />
      </Suspense>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-blue-50" />}>
        <Compare searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Heading() {
  const t = await getT();
  return (
    <header className="max-w-3xl space-y-3">
      <h1 className={PAGE_TITLE}>{t("college.compareTitle")}</h1>
      <p className={PAGE_INTRO}>{t("college.compareLead")}</p>
    </header>
  );
}

const displayName = (c: CollegeSummary) => c.short_name ?? c.name;
const placeOf = (c: { city: string | null; state_region: string | null }) => [c.city, c.state_region].filter(Boolean).join(", ");
const num = (n: number | string | null | undefined) => (n == null ? null : Number(n));

async function Compare({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const t = await getT();
  const wanted = parseCompare(sp.c);
  const [all, lookups, deadlines, appFees] = await Promise.all([getSummaries(), getLookups(), getDeadlines(), getAppFees()]);
  const bySlug = new Map(all.map((c) => [c.slug, c]));
  const picked = wanted.flatMap((slug) => bySlug.get(slug) ?? []);
  const options: CompareOption[] = all
    .map((c) => ({ slug: c.slug, label: displayName(c), name: c.name, place: placeOf(c) }))
    .sort((a, b) => a.label.localeCompare(b.label));

  // The table for a set of colleges. `example`: the empty page's preview (no remove or add, headings one level down).
  const table = (picked: CollegeSummary[], example = false) => {
    const pickedSlugs = picked.map((c) => c.slug);
    const appDeadlines = (id: string) =>
      deadlines.filter((d) => d.institution_id === id && d.kind === "application" && d.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));

    // One scale per test across the picked colleges, so the bars can be read against each other.
    const scale = (lows: (number | null)[], highs: (number | null)[], pad: number, min: number, max: number) => {
      const lo = Math.min(...lows.filter((n): n is number => n != null));
      const hi = Math.max(...highs.filter((n): n is number => n != null));
      return { lo: Math.max(min, lo - pad), hi: Math.min(max, hi + pad) };
    };
    const sat = scale(picked.map((c) => num(c.sat_p25)), picked.map((c) => num(c.sat_p75)), 80, 400, 1600);
    const act = scale(picked.map((c) => num(c.act_p25)), picked.map((c) => num(c.act_p75)), 2, 1, 36);

    const rate = (n: number | string | null) => <RateBar value={num(n)} />;
    const sections: Section[] = [
      {
        title: t("college.secOverview"),
        rows: [
          { label: t("college.rowType"), has: (c) => c.control != null, cell: (c) => (c.control === "public" ? t("college.public") : t("college.private")) },
          { label: t("college.undergrads"), has: (c) => c.undergrad_enrollment != null, cell: (c) => <Figure>{fmtInt(c.undergrad_enrollment)}</Figure> },
          { label: t("college.rowPctIntl"), has: (c) => c.pct_international_ug != null, cell: (c) => <Figure>{fmtPct(c.pct_international_ug)}</Figure> },
        ],
      },
      {
        title: t("college.secAdmissions"),
        rows: [
          { label: t("college.admitRate"), has: (c) => c.admit_rate != null, cell: (c) => rate(c.admit_rate) },
          { label: t("college.intlAdmitRate"), has: (c) => c.intl_admit_rate != null, cell: (c) => rate(c.intl_admit_rate) },
          { label: t("college.edAdmitRate"), has: (c) => c.ed_admit_rate != null, cell: (c) => rate(c.ed_admit_rate) },
        ],
      },
      {
        title: t("college.secScores"),
        rows: [
          {
            label: t("college.rowSatRange"),
            has: (c) => c.sat_p25 != null && c.sat_p75 != null,
            cell: (c) => <CompareRange test="sat" p25={Number(c.sat_p25)} p50={num(c.sat_p50)} p75={Number(c.sat_p75)} lo={sat.lo} hi={sat.hi} />,
          },
          {
            label: t("college.rowActRange"),
            has: (c) => c.act_p25 != null && c.act_p75 != null,
            cell: (c) => <CompareRange test="act" p25={Number(c.act_p25)} p50={num(c.act_p50)} p75={Number(c.act_p75)} lo={act.lo} hi={act.hi} />,
          },
          { label: t("college.rowAvgGpa"), has: (c) => c.gpa_avg != null, cell: (c) => <Figure>{Number(c.gpa_avg).toFixed(2)}</Figure> },
          { label: t("college.rowTesting"), has: (c) => c.test_policy != null, cell: (c) => <Pill>{TEST_POLICY[c.test_policy!] ?? c.test_policy}</Pill> },
          { label: t("college.rowEnglish"), has: (c) => c.english_policy != null, cell: (c) => ENGLISH_POLICY[c.english_policy!] ?? c.english_policy },
        ],
      },
      {
        title: t("college.secDeadlines"),
        rows: [
          {
            label: t("college.rowDeadlines"),
            has: (c) => appDeadlines(c.id).length > 0,
            cell: (c) => {
              const rows = appDeadlines(c.id);
              // Judged as /colleges judges them: only rows with a plan go into narrowFlags. A plan-less row is a program or
              // applicant-group date by nature, so it always names what it is for.
              const planned = rows.filter((d) => d.plan_key);
              const flags = narrowFlags(planned.map((d) => d.label));
              const narrow = new Map(planned.map((d, i) => [d.id, flags[i]]));
              const repeated = (plan: string | null) => rows.filter((d) => d.plan_key === plan).length > 1;
              return (
                <ul className="space-y-2.5">
                  {rows.map((d) => {
                    const days = daysUntil(d.due_date!);
                    const tone = referenceTone(days);
                    const scoped = d.label && (!d.plan_key || narrow.get(d.id) || repeated(d.plan_key));
                    return (
                      <li key={d.id} title={d.label ?? undefined} className="flex items-start gap-2">
                        <span className={`mt-0.5 shrink-0 rounded-full border p-0.5 ${toneClass(tone)}`}>
                          <StatusIcon tone={tone} />
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="font-semibold">{d.plan_key}</span> <span className="tabular-nums">{fmtDate(d.due_date)}</span>
                          <span className={`block text-[13px] ${days < 0 ? "text-zinc-500" : days <= URGENT_DAYS ? "font-semibold text-urgent" : "text-zinc-600"}`}>
                            {days < 0 ? t("status.deadline.passed") : days === 0 ? t("status.deadline.today") : days === 1 ? t("status.deadline.tomorrow") : t("status.deadline.days", { n: days })}
                          </span>
                          {scoped && <span className="mt-0.5 block text-[13px] text-zinc-700 [overflow-wrap:break-word]">{d.label}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              );
            },
          },
        ],
      },
      {
        title: t("college.secCost"),
        rows: [
          { label: t("college.totalCoa"), has: (c) => c.total_coa_usd != null, cell: (c) => <Figure>{fmtUsd(c.total_coa_usd)}</Figure> },
          { label: t("college.rowTuitionBase"), has: (c) => c.tuition_usd != null, cell: (c) => <Figure>{fmtUsd(c.tuition_usd)}</Figure> },
          { label: t("college.tuitionOut"), has: (c) => c.tuition_out_of_state_usd != null, cell: (c) => <Figure>{fmtUsd(c.tuition_out_of_state_usd)}</Figure> },
          {
            label: t("college.rowAidIntl"),
            has: (c) => c.country_code === "US" || c.intl_aid_policy != null,
            cell: (c) => (c.intl_aid_policy ? (INTL_AID[c.intl_aid_policy] ?? c.intl_aid_policy) : <span className="text-zinc-400">{t("college.notVerified")}</span>),
          },
          {
            label: t("college.rowAppFee"),
            has: (c) => appFees[c.id] != null,
            cell: (c) => (Number(appFees[c.id]) === 0 ? <Pill tone="green">{t("colleges.tag.no_app_fee")}</Pill> : <Figure>{fmtUsd(appFees[c.id])}</Figure>),
          },
        ],
      },
      {
        title: t("college.secFields"),
        rows: lookups.categories
          .filter((k) => k.key !== "general")
          .map((k) => ({ label: k.label, has: (c: CollegeSummary) => c.tiers?.[k.key] != null, cell: (c: CollegeSummary) => <TierBadge tier={c.tiers?.[k.key]} size="sm" /> })),
      },
    ];
    const shown = sections.map((s) => ({ ...s, rows: s.rows.filter((r) => picked.some(r.has)) })).filter((s) => s.rows.length > 0);
    const hidden = sections.some((s) => s.rows.some((r) => !picked.some(r.has)));

    const canAdd = !example && picked.length < MAX_COMPARE;
    const dash = <span className="text-zinc-400">—</span>;

    return (
      <div className="space-y-4">
        {!example && <CompareFitHint />}
        <CompareTable
          names={[...picked.map(displayName), ...(canAdd ? [t("college.compareAdd")] : [])]}
          heads={picked.map((c) => (
            <CollegeCard
              key={c.slug}
              c={c}
              t={t}
              removeHref={example ? undefined : compareHref(pickedSlugs.filter((s) => s !== c.slug))}
              tags={applyTags(collegeSupplements(c.slug), appFees[c.id])}
            />
          ))}
          add={
            canAdd ? (
              <div className="flex h-full min-h-36 flex-col justify-center gap-3 rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 p-3 text-left md:p-4">
                <span className="font-display text-base font-bold text-ink">{t("college.compareAdd")}</span>
                <CompareAdd options={options} picked={pickedSlugs} />
              </div>
            ) : undefined
          }
          sections={shown.map((sec) => ({
            title: sec.title,
            rows: sec.rows.map((r) => ({ label: r.label, cells: picked.map((c) => <Fragment key={c.slug}>{r.has(c) ? r.cell(c) : dash}</Fragment>) })),
          }))}
          titleTag={example ? "h3" : "h2"}
        />
        {hidden && <p className="text-[13px] text-zinc-600">{t("college.compareHiddenRows")}</p>}
      </div>
    );
  };

  if (picked.length > 0) return table(picked);
  // Nothing picked: the first ready-made comparison, live from the data, as the page's example.
  const ideas = IDEAS.map((i) => ({ key: i.key, colleges: i.slugs.flatMap((slug) => bySlug.get(slug) ?? []) })).filter((i) => i.colleges.length >= 2);
  const example = ideas[0];
  return <EmptyCompare t={t} options={options} ideas={ideas} example={example ? { key: example.key, slugs: example.colleges.map((c) => c.slug), table: table(example.colleges, true) } : null} />;
}

type Row = { label: string; has: (c: CollegeSummary) => boolean; cell: (c: CollegeSummary) => React.ReactNode };
type Section = { title: string; rows: Row[] };

function Figure({ children }: { children: React.ReactNode }) {
  return <span className="font-display text-base font-bold tabular-nums">{children}</span>;
}

/** A percentage with a bar under it (0-100). */
function RateBar({ value }: { value: number | null }) {
  if (value == null) return <span className="text-zinc-300">—</span>;
  return (
    <div className="space-y-1.5">
      <Figure>{fmtPct(value)}</Figure>
      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-100" aria-hidden="true">
        <div className="h-full rounded-full bg-blue-400" style={{ width: `${Math.max(1, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function CollegeCard({ c, t, removeHref, tags }: { c: CollegeSummary; t: TFunction; removeHref?: string; tags: ReturnType<typeof applyTags> }) {
  const name = displayName(c);
  return (
    <div className={`flex h-full flex-col gap-2 rounded-2xl bg-zinc-50 p-3 text-left md:p-4 ${removeHref ? "min-h-36" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SchoolLogo slug={c.slug} />
          <TierBadge tier={c.general_tier} />
        </div>
        {removeHref && (
          <Link
            href={removeHref}
            scroll={false}
            aria-label={t("college.compareRemove", { name })}
            title={t("college.compareRemove", { name })}
            className="-mr-1.5 -mt-1.5 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-ink"
          >
            ×
          </Link>
        )}
      </div>
      <Link href={`/colleges/${c.slug}`} className="font-display text-base font-bold leading-snug text-ink hover:underline underline-offset-4">
        {name}
      </Link>
      <span className="-mt-1.5 text-[13px] text-zinc-600">{placeOf(c)}</span>
      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
        <CompareFitBadge college={c} />
        <ApplyTags tags={tags} />
      </div>
      {c.country_code !== "US" && (
        <Link href={`/colleges/${c.slug}`} className="text-[13px] font-semibold text-blue-700 hover:underline underline-offset-4">
          {t("college.byCourse")}
        </Link>
      )}
    </div>
  );
}

type Idea = { key: (typeof IDEAS)[number]["key"]; colleges: CollegeSummary[] };

function EmptyCompare({
  t,
  options,
  ideas,
  example,
}: {
  t: TFunction;
  options: CompareOption[];
  ideas: Idea[];
  example: { key: Idea["key"]; slugs: string[]; table: React.ReactNode } | null;
}) {
  const others = ideas.filter((i) => i.key !== example?.key);
  return (
    <div className="space-y-12">
      {example && (
        <section aria-labelledby="compare-example" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl space-y-1">
              <h2 id="compare-example" className={SECTION_TITLE}>
                {t("college.compareExampleTitle", { name: t(`college.compareIdea.${example.key}`) })}
              </h2>
              <p className="text-[15px] text-zinc-700">{t("college.compareExampleNote")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href="#compare-start" className={buttonClass("primary", "sm")}>
                {t("college.compareExampleStart")}
              </a>
              <Link href={compareHref(example.slugs)} className={buttonClass("secondary", "sm")}>
                {t("college.compareExampleEdit")}
              </Link>
            </div>
          </div>
          {example.table}
        </section>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section id="compare-start" aria-labelledby="compare-start-title" className={`scroll-mt-28 space-y-6 ${PANEL} p-6 sm:p-8`}>
          <div className="space-y-3">
            <h2 id="compare-start-title" className={SECTION_TITLE}>
              {t("college.compareEmptyTitle")}
            </h2>
            <CompareAdd options={options} picked={[]} />
          </div>
          <CompareFromList options={options} />
          <p className="text-[15px] text-ink">
            {t("college.orTick")}{" "}
            <Link className="font-semibold text-blue-700 underline underline-offset-4" href="/colleges">
              {t("college.collegesLink")}
            </Link>{" "}
            {t("college.pageAndPress")}
          </p>
        </section>
        {others.length > 0 && (
          <section aria-labelledby="compare-ideas" className="space-y-3">
            <h2 id="compare-ideas" className={SECTION_TITLE}>
              {t("college.compareIdeas")}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {others.map((i) => (
                <li key={i.key}>
                  <Link
                    href={compareHref(i.colleges.map((c) => c.slug))}
                    className="group flex h-full flex-col gap-3 rounded-2xl bg-zinc-50 p-4 transition-colors hover:bg-zinc-100"
                  >
                    <span className="flex items-center justify-between gap-2 font-display font-bold text-ink">
                      {t(`college.compareIdea.${i.key}`)}
                      <span aria-hidden="true" className="text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                        →
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {i.colleges.map((c) => (
                        <span key={c.slug} className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[13px] font-semibold text-zinc-700">
                          <span className="-ml-1.5 empty:hidden">
                            <SchoolLogo slug={c.slug} size="sm" />
                          </span>
                          {displayName(c)}
                        </span>
                      ))}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
