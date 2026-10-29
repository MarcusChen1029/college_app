"use client";

import Link from "next/link";
import { useState } from "react";
import type { ApplyTag } from "@/lib/apply-tags";
import { SORT_DESC, type ExploreRow, type Median, type SortKey, type SortState } from "@/lib/explore-filters";
import { fmtDate, fmtPct, TEST_POLICY } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import type { AdmissionTest } from "@/lib/test-plan";
import { fmtMoney, type TuitionEstimate } from "@/lib/tuition";
import type { TierCode } from "@/lib/types";
import { buttonClass } from "@/lib/ui";
import { EnglishFitBadge } from "./EnglishFit";
import { ApplyTags, FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";

const TEST_NAME: Record<AdmissionTest, string> = { sat: "SAT", act: "ACT" };

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

  // Without scores there is no fit to show: a dash per row, and the way to get one once, in the column's header.
  const fitCell = (r: ExploreRow) => (r.fit ? <FitBadge fit={r.fit.fit} result={r.fit} /> : <span className="text-zinc-500">—</span>);
  const fitHeader = hasScores ? (
    t("colleges.thYourFit")
  ) : (
    <>
      {t("colleges.thFit")}
      <Link href="/start" className="block font-semibold whitespace-nowrap text-blue-700 underline-offset-4 hover:underline">
        {t("colleges.addScoresShort")}
      </Link>
    </>
  );

  const ariaSort = (keys: SortKey[]) => (keys.includes(sort.key) ? (SORT_DESC[sort.key] !== sort.reverse ? "descending" : "ascending") : undefined);
  const sortButton = (key: SortKey, label: React.ReactNode) => {
    const on = sort.key === key;
    const desc = SORT_DESC[key] !== sort.reverse;
    return (
      <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 whitespace-nowrap hover:text-ink ${on ? "text-ink" : ""}`}>
        {label}
        <span aria-hidden="true" className={on ? "" : "opacity-0"}>
          {desc ? "↓" : "↑"}
        </span>
      </button>
    );
  };
  const th = (key: SortKey | null, label: React.ReactNode, cls = "", title?: string) => (
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

      {/* Phones and tablets: one card per college */}
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {visible.map((r) => (
          <li key={r.c.slug} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start gap-2.5">
              <SchoolLogo slug={r.c.slug} />
              <TierBadge tier={tierFor(r)} />
              <div className="min-w-0 flex-1">
                <Link href={`/colleges/${r.c.slug}`} className="block text-base font-semibold leading-tight text-ink hover:underline">
                  {r.c.name}
                </Link>
                <p className="mt-0.5 truncate text-sm text-zinc-600">{place(t, r)}</p>
                <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" />
              </div>
              {isUS && r.fit && <FitBadge fit={r.fit.fit} result={r.fit} />}
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
              <Stat label={t("colleges.thTuition")}>
                <TuitionCell tu={r.tuition} />
              </Stat>
              {showEnglish && (
                <Stat label={t("colleges.thEnglish")}>
                  <EnglishFitBadge fit={r.english} />
                </Stat>
              )}
              <Stat label={t("colleges.thNextDeadline")}>
                <span className="tabular-nums">{fmtDate(r.c.next_deadline)}</span>
              </Stat>
            </dl>
            <div className="mt-3 flex items-center justify-between gap-2">
              {compareBox(r, true)}
              {listButton(r)}
            </div>
          </li>
        ))}
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
              <th scope="col" className="min-w-[16rem] px-3 py-2.5 font-semibold" aria-sort={ariaSort(["tier", "name"])}>
                <span className="inline-flex items-center gap-2">
                  {sortButton("tier", t("colleges.thTier"))}
                  <span aria-hidden="true">·</span>
                  {sortButton("name", t("colleges.thCollege"))}
                </span>
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
              {th("tuition", t("colleges.thTuition"), "text-right", t("colleges.thTuitionTitle"))}
              {showEnglish && th(null, t("colleges.thEnglish"))}
              {isUS && th(null, fitHeader)}
              {th("deadline", t("colleges.thNextDeadline"), "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thTesting"), "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thPlans"), "hidden 2xl:table-cell")}
              <th scope="col" className="py-2.5 pl-3 pr-4">
                <span className="sr-only">{t("colleges.thMyList")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.c.slug} className="border-t border-zinc-100 align-middle first:border-t-0 hover:bg-zinc-50">
                <td className="py-3 pl-4 pr-1">{compareBox(r)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center">
                      <SchoolLogo slug={r.c.slug} />
                    </span>
                    <TierBadge tier={tierFor(r)} />
                    <div className="min-w-0">
                      <Link href={`/colleges/${r.c.slug}`} className="text-base font-semibold text-ink hover:underline">
                        {r.c.name}
                      </Link>
                      <div className="text-[13px] text-zinc-600">{place(t, r)}</div>
                      <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" />
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
                  <TuitionCell tu={r.tuition} />
                </td>
                {showEnglish && (
                  <td className="px-3 py-3">
                    <EnglishFitBadge fit={r.english} />
                  </td>
                )}
                {isUS && <td className="px-3 py-3">{fitCell(r)}</td>}
                <td className="hidden px-3 py-3 whitespace-nowrap tabular-nums xl:table-cell">{fmtDate(r.c.next_deadline)}</td>
                {isUS && (
                  <td className="hidden whitespace-nowrap px-3 py-3 xl:table-cell">
                    {r.c.test_policy ? <Pill>{r.c.test_policy in TEST_POLICY ? t(`colleges.testPolicy.${r.c.test_policy}` as MessageKey) : r.c.test_policy}</Pill> : <span className="text-zinc-500">—</span>}
                  </td>
                )}
                {isUS && <td className="hidden px-3 py-3 text-[13px] 2xl:table-cell">{[...(r.c.plans ?? [])].sort().join(" · ") || <span className="text-zinc-500">—</span>}</td>}
                <td className="py-3 pl-3 pr-4 text-right">{listButton(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-2">{empty}</div>}
      </div>

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

function TuitionCell({ tu }: { tu: TuitionEstimate }) {
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
      <span className="block whitespace-nowrap text-[13px] text-zinc-600">
        {tu.max != null
          ? t("colleges.tuitionUpTo", { amount: fmtMoney(tu.max, tu.currency) })
          : tu.outOfState != null
            ? t("colleges.tuitionOos", { amount: fmtMoney(tu.outOfState, tu.currency) })
            : t(`colleges.tuitionBasis.${tu.basis}`)}
      </span>
    </span>
  );
}
