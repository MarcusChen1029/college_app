"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";
import type { ApplyTag } from "@/lib/apply-tags";
import {
  dayHeading,
  monthDay,
  SORT_DESC,
  type DueGroup,
  type DueWindow,
  type ExploreRow,
  type Median,
  type NextDue,
  type SortKey,
  type SortState,
} from "@/lib/explore-filters";
import { fmtDate, fmtPct, TEST_POLICY } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/core";
import { deadlineTone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import type { AdmissionTest } from "@/lib/test-plan";
import { fmtMoney, type TuitionEstimate } from "@/lib/tuition";
import type { TierCode } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
import { EnglishFitBadge } from "./EnglishFit";
import { ApplyTags, FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";

const TEST_NAME: Record<AdmissionTest, string> = { sat: "SAT", act: "ACT" };

// Plan codes on file (lib/i18n application.planLabel.* names each in full). EA, ED, ED2, REA and RD stay codes in every
// language (the zh labels carry them too); ROLLING is a word, so it is translated.
const PLAN_CODES = ["ED", "ED2", "EA", "REA", "RD", "ROLLING"];
export const planShort = (t: TFunction, plan: string): string => (plan === "ROLLING" ? t("colleges.planRolling") : plan);
const planTitle = (t: TFunction, plan: string): string => (PLAN_CODES.includes(plan) ? t(`application.planLabel.${plan}` as MessageKey) : plan);
const daysLeft = (t: TFunction, days: number): string =>
  days === 0 ? t("status.deadline.today") : days === 1 ? t("status.deadline.tomorrow") : t("status.deadline.days", { n: days });
// Text-only deadline tones (the chips use toneClass, which also sets a fill).
const TONE_TEXT = { urgent: "text-urgent", soon: "text-soon", neutral: "text-zinc-600", done: "text-done", progress: "text-progress" } as const;

/**
 * A college's next application deadline as a line of the timetable: plan, date and days left ("EA · Nov 1 · 3 days"), in the
 * deadline tones (urgent within 7 days, soon within 21). 13px, unlike the 12px DeadlineChip, to keep this page at 13px or more.
 * `withDays` is off in the HTML sent before hydration (the server does not know the reader's date).
 */
export function DueChip({ due, withDays = true }: { due: NextDue; withDays?: boolean }) {
  const t = useT();
  const locale = useLocale();
  return (
    <span
      title={planTitle(t, due.plan)}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[13px] font-semibold whitespace-nowrap tabular-nums ${toneClass(deadlineTone(due.days, false))}`}
    >
      {dueText(t, locale, due, withDays)}
    </span>
  );
}

/** The chip's words, also used in the map's hover label: "EA · Nov 1 · 3 days" (the date in the reader's language). */
export function dueText(t: TFunction, locale: Locale, due: NextDue, withDays = true): string {
  return [planShort(t, due.plan), monthDay(due.date, locale), withDays ? daysLeft(t, due.days) : null].filter(Boolean).join(" · ");
}

/** In the timetable the day is in the heading, so a row shows only its plan (its full name on hover). */
export function PlanChip({ plan }: { plan: string }) {
  const t = useT();
  return (
    <span title={planTitle(t, plan)} className="inline-flex items-center rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[13px] font-semibold whitespace-nowrap text-ink">
      {planShort(t, plan)}
    </span>
  );
}

/** The plan as a word in a line of text ("Stanford, CA · 4% admit · REA"), its full name on hover. */
export function PlanText({ plan }: { plan: string }) {
  const t = useT();
  return (
    <span title={planTitle(t, plan)} className="font-semibold text-ink">
      {planShort(t, plan)}
    </span>
  );
}

/** A day of the timetable: "Sun, Nov 1 · 3 days" and how many of the colleges shown close on it. */
export function DayHead({ group, withDays = true }: { group: DueGroup; withDays?: boolean }) {
  const t = useT();
  const locale = useLocale();
  return (
    <span className="flex items-baseline justify-between gap-3">
      <span className="text-[15px] font-semibold text-ink">
        {dayHeading(group.date, locale)}
        {withDays && <span className={`font-semibold ${TONE_TEXT[deadlineTone(group.days, false)]}`}> · {daysLeft(t, group.days)}</span>}
      </span>
      <span className="text-[13px] tabular-nums text-zinc-600">{group.n === 1 ? t("colleges.groupCountOne") : t("colleges.groupCount", { n: group.n })}</span>
    </span>
  );
}

/** The table (wide screens) and card list (phones, tablets) of the Explore page. Rows arrive filtered and sorted. */
export function CollegeBrowser({
  rows,
  resetKey,
  isUS,
  tests,
  myScores,
  showEnglish,
  hasScores,
  sort,
  onSort,
  tierFor,
  applyTags,
  dueFor,
  lens,
  groups,
  hydrated,
}: {
  rows: ExploreRow[];
  resetKey: string;
  isUS: boolean;
  /** Median columns to show (lib/test-plan.ts testsToCompare). */
  tests: AdmissionTest[];
  /** The student's own SAT/ACT, for the "you" hints. */
  myScores: Partial<Record<AdmissionTest, number>>;
  showEnglish: boolean;
  hasScores: boolean;
  sort: SortState;
  onSort: (key: SortKey) => void;
  tierFor: (r: ExploreRow) => TierCode | null;
  applyTags: Record<string, ApplyTag[]>;
  /** The college's next application deadline from today (lib/explore-filters.ts nextDue), for the lens chips. */
  dueFor: (r: ExploreRow) => NextDue | null;
  /** The "when" lens window, when on: rows arrive narrowed to it and sorted by date, printed as a timetable (a heading per day). */
  lens: DueWindow | null;
  /** The timetable's days, keyed by the slug of each day's first row (lib/explore-filters.ts dueGroups). */
  groups: Map<string, DueGroup>;
  /** False in the HTML sent before hydration: days-left words wait for the reader's own date. */
  hydrated: boolean;
}) {
  const t = useT();
  const student = useStudent();
  const [selected, setSelected] = useState<string[]>([]);
  const shown = useVisibleCount(resetKey, rows.length);
  const toggle = (slug: string) => setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= 4 ? s : [...s, slug]));
  const visible = rows.slice(0, shown.count);
  // Colleges outside the US mostly publish no overall admit rate (they admit by course): skip an all-dash column.
  const showAdmit = isUS || rows.some((r) => r.c.admit_rate != null);

  const listButton = (r: ExploreRow) => {
    const inList = student.has(r.c.slug);
    if (!inList && !student.canAdd)
      return (
        <Link href="/pricing" className={`${buttonClass("secondary", "sm")} whitespace-nowrap`} title={t("colleges.planFull", { plan: student.plan.name })}>
          {t("colleges.upgrade")}
        </Link>
      );
    // Repeated on every row, so a quiet outline: one ink button per row would be a column louder than the data.
    return (
      <button
        type="button"
        aria-pressed={inList}
        className={`${buttonClass("ghost", "sm", inList)} whitespace-nowrap`}
        onClick={() => (inList ? student.remove(r.c.slug) : student.add(r.c))}
      >
        {inList ? t("colleges.inList") : t("colleges.myListAdd")}
      </button>
    );
  };

  const compareBox = (r: ExploreRow, withLabel = false) => (
    <label className={`inline-flex items-center gap-1.5 ${withLabel ? "text-[13px] font-semibold text-zinc-600" : ""}`}>
      <input
        type="checkbox"
        className="h-4 w-4 accent-ink"
        aria-label={withLabel ? undefined : t("colleges.selectToCompare", { name: r.c.name })}
        checked={selected.includes(r.c.slug)}
        disabled={!selected.includes(r.c.slug) && selected.length >= 4}
        onChange={() => toggle(r.c.slug)}
      />
      {withLabel && t("colleges.compare")}
    </label>
  );

  // The Fit column exists only once the student has scores (without them it would be a column of dashes; the title row asks for
  // the scores instead). A college the fit can't be worked out for gets a dash.
  const showFit = isUS && hasScores;
  const fitCell = (r: ExploreRow) => (r.fit ? <FitBadge fit={r.fit.fit} result={r.fit} size="md" /> : <span className="text-zinc-500">—</span>);
  // With the lens on, the day is in the timetable heading above, so the row shows only its plan; otherwise the plain date.
  const deadlineCell = (r: ExploreRow) => {
    const due = lens ? dueFor(r) : null;
    return due ? <PlanChip plan={due.plan} /> : <span className="tabular-nums">{fmtDate(r.c.next_deadline)}</span>;
  };
  // The timetable heading printed before the first row of each day.
  const headFor = (r: ExploreRow) => (lens ? groups.get(r.c.slug) : undefined);
  // Tier badges differ in width (S++, S+, S): a fixed slot keeps every college name on one edge.
  const tierSlot = (r: ExploreRow) => (
    <span className="w-11 shrink-0">
      <TierBadge tier={tierFor(r)} />
    </span>
  );

  const ariaSort = (keys: SortKey[]) => (keys.includes(sort.key) ? (SORT_DESC[sort.key] !== sort.reverse ? "descending" : "ascending") : undefined);
  // While the lens orders the rows by date (`sort` then says deadline), the headers are labels, not sort buttons.
  const sortButton = (key: SortKey, label: ReactNode) => {
    const on = sort.key === key;
    const desc = SORT_DESC[key] !== sort.reverse;
    const arrow = (
      <span aria-hidden="true" className={on ? "" : "opacity-0"}>
        {desc ? "↓" : "↑"}
      </span>
    );
    if (lens)
      return (
        <span className={`inline-flex items-center gap-1 whitespace-nowrap ${on ? "text-ink" : ""}`}>
          {label}
          {on && arrow}
        </span>
      );
    return (
      <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${on ? "text-ink" : ""}`}>
        {label}
        {arrow}
      </button>
    );
  };
  const th = (key: SortKey | null, label: ReactNode, cls = "", title?: string) => (
    <th key={key ?? undefined} scope="col" className={`px-3 py-2.5 font-semibold ${cls}`} aria-sort={key ? ariaSort([key]) : undefined} title={title}>
      {key ? sortButton(key, label) : label}
    </th>
  );

  const empty = <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-600">{t("colleges.noFilterMatch")}</p>;

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        // Sticks to the top while scrolling, so it floats: the one bar here with a shadow.
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border border-zinc-200 bg-white px-4 py-2.5 text-sm shadow-[0_10px_28px_-14px_rgb(18_48_74/0.4)]">
          <span>
            {t("colleges.selectedCount", { n: selected.length })}
            {selected.length >= 4 ? t("colleges.maxFour") : ""}
          </span>
          <Link className="font-semibold text-blue-700 underline" href={`/compare?c=${selected.join(",")}`}>
            {t("colleges.compareSideBySide")}
          </Link>
          <button type="button" className="ml-auto font-semibold text-zinc-600 hover:text-ink hover:underline" onClick={() => setSelected([])}>
            {t("colleges.clear")}
          </button>
        </div>
      )}

      {/* Phones and tablets: one card per college (under a heading per day with the lens on). The usual tuition basis is said
          once, here, not on every card. */}
      <p className="text-[13px] text-zinc-600 lg:hidden">{t("colleges.tuitionNote")}</p>
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {visible.map((r) => {
          const head = headFor(r);
          return (
          <Fragment key={r.c.slug}>
          {head && (
            <li className="pt-3 sm:col-span-2">
              <DayHead group={head} withDays={hydrated} />
            </li>
          )}
          <li className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start gap-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center">
                <SchoolLogo slug={r.c.slug} name={r.c.short_name ?? r.c.name} />
              </span>
              {tierSlot(r)}
              <div className="min-w-0 flex-1">
                <Link href={`/colleges/${r.c.slug}`} className="block text-base font-semibold leading-tight text-ink hover:underline">
                  {r.c.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-zinc-600">{place(t, r)}</p>
                <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" size="md" />
              </div>
              {isUS && r.fit && <FitBadge fit={r.fit.fit} result={r.fit} size="md" />}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 text-sm">
              {showAdmit && (
                <Stat label={t("colleges.thAdmitRate")}>
                  <AdmitCell r={r} />
                </Stat>
              )}
              {isUS &&
                tests.map((k) => (
                  <Stat key={k} label={t(k === "sat" ? "colleges.thSatMedian" : "colleges.thActMedian")}>
                    <MedianCell m={r[k]} test={k} you={myScores[k]} />
                  </Stat>
                ))}
              <Stat label={`${t("colleges.thTuition")}*`}>
                <TuitionCell tu={r.tuition} quietPublished />
              </Stat>
              {showEnglish && (
                <Stat label={t("colleges.thEnglish")}>
                  <EnglishFitBadge fit={r.english} />
                </Stat>
              )}
              <Stat label={t("colleges.thNextDeadline")}>{deadlineCell(r)}</Stat>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-2">
              {compareBox(r, true)}
              {listButton(r)}
            </div>
          </li>
          </Fragment>
          );
        })}
        {rows.length === 0 && <li className="sm:col-span-2">{empty}</li>}
      </ul>

      {/* Wide screens: the table. Lower-priority columns appear as room allows. */}
      <div className="hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white lg:block">
        <table className="w-full text-sm">
          <thead className="border-b border-zinc-200 text-left text-[13px] text-zinc-600">
            <tr>
              <th scope="col" className="w-8 py-2.5 pl-4 pr-1">
                <span className="sr-only">{t("colleges.compare")}</span>
              </th>
              <th scope="col" className="w-16 px-3 py-2.5 font-semibold" aria-sort={ariaSort(["tier"])}>
                {sortButton("tier", t("colleges.thTier"))}
              </th>
              {/* The college column takes the table's spare width, so the number columns sit at their own widths side by side. */}
              <th scope="col" className="w-[40%] min-w-[16rem] px-3 py-2.5 font-semibold" aria-sort={ariaSort(["name"])}>
                {sortButton("name", t("colleges.thCollege"))}
              </th>
              {showAdmit && th("admit", t("colleges.thAdmitRate"), "text-right")}
              {isUS &&
                tests.map((k) =>
                  th(
                    k,
                    <span className="text-right">
                      {t(k === "sat" ? "colleges.thSatMedian" : "colleges.thActMedian")}
                      {myScores[k] != null && <span className="block text-[13px] font-normal text-zinc-600">{t("colleges.thYouScore", { n: myScores[k]! })}</span>}
                    </span>,
                    "text-right",
                  ),
                )}
              {/* One line, so the column is as wide as its figures; the usual basis is the footnote under the table, and a cell
                  names its basis only when it is another one (in-state, by course…). */}
              {th("tuition", `${t("colleges.thTuition")}*`, "text-right", t("colleges.thTuitionTitle"))}
              {showEnglish && th(null, t("colleges.thEnglish"))}
              {showFit && th(null, t("colleges.thYourFit"))}
              {th("deadline", t("colleges.thNextDeadline"), lens ? "" : "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thTesting"), "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thPlans"), "hidden 2xl:table-cell")}
              <th scope="col" className="py-2.5 pl-3 pr-4">
                <span className="sr-only">{t("colleges.thMyList")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const head = headFor(r);
              return (
              <Fragment key={r.c.slug}>
              {/* The timetable: a heading row before each deadline day (it spans every column shown). */}
              {head && (
                <tr className="border-t border-zinc-200 first:border-t-0">
                  <th scope="colgroup" colSpan={20} className="px-4 pb-2 pt-4 text-left font-normal">
                    <DayHead group={head} withDays={hydrated} />
                  </th>
                </tr>
              )}
              <tr className="border-t border-zinc-100 align-middle first:border-t-0 hover:bg-zinc-50">
                <td className="py-3 pl-4 pr-1">{compareBox(r)}</td>
                <td className="px-3 py-3">
                  <TierBadge tier={tierFor(r)} />
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center">
                      <SchoolLogo slug={r.c.slug} name={r.c.short_name ?? r.c.name} />
                    </span>
                    <div className="min-w-0">
                      <Link href={`/colleges/${r.c.slug}`} className="text-base font-semibold text-ink hover:underline">
                        {r.c.name}
                      </Link>
                      <div className="text-[13px] text-zinc-600">{place(t, r)}</div>
                      <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" size="md" />
                    </div>
                  </div>
                </td>
                {showAdmit && (
                  <td className="px-3 py-3 text-right">
                    <AdmitCell r={r} />
                  </td>
                )}
                {isUS &&
                  tests.map((k) => (
                    <td key={k} className="px-3 py-3 text-right">
                      <MedianCell m={r[k]} test={k} you={myScores[k]} />
                    </td>
                  ))}
                <td className="px-3 py-3 text-right">
                  <TuitionCell tu={r.tuition} quietPublished />
                </td>
                {showEnglish && (
                  <td className="px-3 py-3">
                    <EnglishFitBadge fit={r.english} />
                  </td>
                )}
                {showFit && <td className="px-3 py-3">{fitCell(r)}</td>}
                <td className={`px-3 py-3 whitespace-nowrap tabular-nums ${lens ? "" : "hidden xl:table-cell"}`}>{deadlineCell(r)}</td>
                {isUS && (
                  <td className="hidden whitespace-nowrap px-3 py-3 xl:table-cell">
                    {r.c.test_policy ? <Pill size="md">{r.c.test_policy in TEST_POLICY ? t(`colleges.testPolicy.${r.c.test_policy}` as MessageKey) : r.c.test_policy}</Pill> : <span className="text-zinc-500">—</span>}
                  </td>
                )}
                {isUS && <td className="hidden px-3 py-3 text-[13px] 2xl:table-cell">{[...(r.c.plans ?? [])].sort().join(" · ") || <span className="text-zinc-500">—</span>}</td>}
                <td className="py-3 pl-3 pr-4 text-right">{listButton(r)}</td>
              </tr>
              </Fragment>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-2">{empty}</div>}
      </div>
      <p className="hidden text-[13px] text-zinc-600 lg:block">{t("colleges.tuitionNote")}</p>

      {shown.hasMore && <LoadMore key={shown.count} count={shown.count} onVisible={shown.more} />}
      <p className="text-[13px] text-zinc-600">{isUS ? t("colleges.footnote") : t("colleges.footnoteNonUS")}</p>
    </div>
  );
}

const place = (t: TFunction, r: ExploreRow) =>
  [[r.c.city, r.c.state_region].filter(Boolean).join(", "), r.c.control === "public" ? t("colleges.public") : r.c.control ? t("colleges.private") : null].filter(Boolean).join(" · ");

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-zinc-600">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function AdmitCell({ r }: { r: ExploreRow }) {
  const t = useT();
  const student = useStudent();
  const intl = !!student.profile.international && r.c.intl_admit_rate != null;
  if (r.c.admit_rate == null && !intl) return <span className="text-zinc-500" title={t("colleges.notReported")}>—</span>;
  return (
    <span className="tabular-nums">
      {fmtPct(r.c.admit_rate)}
      {intl && <span className="block text-[13px] text-zinc-600">{t("colleges.intlRate", { pct: fmtPct(r.c.intl_admit_rate) })}</span>}
    </span>
  );
}

function MedianCell({ m, test, you }: { m: Median; test: AdmissionTest; you: number | undefined }) {
  const t = useT();
  const name = TEST_NAME[test];
  const range = m.p25 != null && m.p75 != null ? `${m.p25}–${m.p75}` : null;
  if (m.value == null) {
    const why = t("colleges.medianNone") + (range ? ` ${t("colleges.middleRange", { range })}` : "");
    return (
      <span className="cursor-help tabular-nums" title={why}>
        <span className="text-zinc-500">—</span>
        {range && <span className="block text-[13px] text-zinc-600">{t("colleges.middleRange", { range })}</span>}
      </span>
    );
  }
  const title = [
    t("colleges.medianTitle", { test: name, n: m.value }),
    range ? t("colleges.middleRange", { range }) : "",
    m.estimated ? t("colleges.medianEstTitle") : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const delta = you != null ? you - m.value : null;
  return (
    <span className="tabular-nums" title={title}>
      <span className="font-semibold">
        {m.estimated && "≈ "}
        {m.value}
      </span>
      {delta != null && (
        <span className="block text-[13px] text-zinc-600">{t("colleges.youDelta", { d: delta === 0 ? "±0" : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}` })}</span>
      )}
    </span>
  );
}

/** `quietPublished`: the table says "published rate" once in its header, so a cell on that basis shows just the figure. */
function TuitionCell({ tu, quietPublished = false }: { tu: TuitionEstimate; quietPublished?: boolean }) {
  const t = useT();
  if (tu.amount == null || !tu.basis)
    return (
      <span className="cursor-help text-zinc-500" title={t("colleges.tuitionNone")}>
        —
      </span>
    );
  const extra = t("colleges.tuitionExtra");
  const title =
    (tu.maybeLow
      ? t("colleges.tuitionTitle.maybeLow")
      : tu.basis === "in_state" && tu.outOfState != null
        ? t("colleges.tuitionTitle.in_state", { oos: fmtMoney(tu.outOfState, tu.currency) })
        : t(`colleges.tuitionTitle.${tu.basis}`, { oos: "" })) + extra;
  return (
    <span className="tabular-nums" title={title}>
      <span className="font-semibold">
        {fmtMoney(tu.amount, tu.currency)}
        {tu.maybeLow && <span aria-hidden="true">*</span>}
      </span>
      {!(quietPublished && tu.basis === "published" && tu.max == null && tu.outOfState == null) && (
      <span className="block whitespace-nowrap text-[13px] text-zinc-600">
        {tu.max != null
          ? t("colleges.tuitionUpTo", { amount: fmtMoney(tu.max, tu.currency) })
          : tu.outOfState != null
            ? t("colleges.tuitionOos", { amount: fmtMoney(tu.outOfState, tu.currency) })
            : t(`colleges.tuitionBasis.${tu.basis}`)}
      </span>
      )}
    </span>
  );
}
