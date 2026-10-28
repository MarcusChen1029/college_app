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
    return (
      <button
        type="button"
        className={`${buttonClass(inList ? "secondary" : "primary", "sm")} whitespace-nowrap`}
        onClick={() => (inList ? student.remove(r.c.slug) : student.add(r.c))}
      >
        {inList ? t("colleges.inList") : t("colleges.myListAdd")}
      </button>
    );
  };

  const compareBox = (r: ExploreRow, withLabel = false) => (
    <label className={`inline-flex items-center gap-1.5 ${withLabel ? "text-xs font-semibold text-zinc-600" : ""}`}>
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

  const fitCell = (r: ExploreRow) =>
    r.fit ? <FitBadge fit={r.fit.fit} result={r.fit} /> : <span className="text-xs text-zinc-400">{hasScores ? "—" : <Link href="/start" className="underline-offset-4 hover:underline">{t("colleges.addScoresShort")}</Link>}</span>;

  const ariaSort = (keys: SortKey[]) => (keys.includes(sort.key) ? (SORT_DESC[sort.key] !== sort.reverse ? "descending" : "ascending") : undefined);
  const sortButton = (key: SortKey, label: React.ReactNode) => {
    const on = sort.key === key;
    const desc = SORT_DESC[key] !== sort.reverse;
    return (
      <button type="button" onClick={() => onSort(key)} className={`inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-ink ${on ? "text-ink" : ""}`}>
        {label}
        <span aria-hidden="true" className={on ? "" : "opacity-0"}>
          {desc ? "↓" : "↑"}
        </span>
      </button>
    );
  };
  const th = (key: SortKey | null, label: React.ReactNode, cls = "", title?: string) => (
    <th key={key ?? undefined} scope="col" className={`p-2 font-semibold ${cls}`} aria-sort={key ? ariaSort([key]) : undefined} title={title}>
      {key ? sortButton(key, label) : label}
    </th>
  );

  const empty = <p className="rounded-2xl bg-zinc-50 p-6 text-center text-sm text-zinc-500">{t("colleges.noFilterMatch")}</p>;

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-blue-100 bg-blue-50 px-3 py-2 text-sm">
          <span>
            {t("colleges.selectedCount", { n: selected.length })}
            {selected.length >= 4 ? t("colleges.maxFour") : ""}
          </span>
          <Link className="font-semibold text-blue-700 underline" href={`/compare?c=${selected.join(",")}`}>
            {t("colleges.compareSideBySide")}
          </Link>
          <button type="button" className="ml-auto text-zinc-500 hover:underline" onClick={() => setSelected([])}>
            {t("colleges.clear")}
          </button>
        </div>
      )}

      {/* Phones and tablets: one card per college */}
      <ul className="grid gap-2 sm:grid-cols-2 lg:hidden">
        {visible.map((r) => (
          <li key={r.c.slug} className="rounded-2xl border-2 border-zinc-100 bg-white p-3">
            <div className="flex items-start gap-2.5">
              <SchoolLogo slug={r.c.slug} />
              <TierBadge tier={tierFor(r)} />
              <div className="min-w-0 flex-1">
                <Link href={`/colleges/${r.c.slug}`} className="block font-semibold leading-tight hover:underline">
                  {r.c.name}
                </Link>
                <p className="truncate text-xs text-zinc-500">{place(t, r)}</p>
                <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" />
              </div>
              {isUS && r.fit && <FitBadge fit={r.fit.fit} result={r.fit} />}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
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
      <div className="hidden overflow-x-auto rounded-2xl border-2 border-zinc-100 bg-white lg:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left text-[11px] uppercase tracking-wide text-zinc-500">
            <tr>
              <th scope="col" className="w-8 p-2">
                <span className="sr-only">{t("colleges.compare")}</span>
              </th>
              <th scope="col" className="min-w-[14rem] p-2 font-semibold" aria-sort={ariaSort(["tier", "name"])}>
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
                      {myScores[k] != null && <span className="block text-[10px] font-semibold normal-case tracking-normal text-coral">{t("colleges.thYouScore", { n: myScores[k]! })}</span>}
                    </span>,
                    "text-right",
                  ),
                )}
              {th("tuition", t("colleges.thTuition"), "text-right", t("colleges.thTuitionTitle"))}
              {showEnglish && th(null, t("colleges.thEnglish"))}
              {isUS && th(null, hasScores ? t("colleges.thYourFit") : t("colleges.thFit"))}
              {th("deadline", t("colleges.thNextDeadline"), "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thTesting"), "hidden xl:table-cell")}
              {isUS && th(null, t("colleges.thPlans"), "hidden 2xl:table-cell")}
              <th scope="col" className="p-2">
                <span className="sr-only">{t("colleges.thMyList")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.c.slug} className="border-t border-zinc-100 align-middle hover:bg-zinc-50">
                <td className="p-2">{compareBox(r)}</td>
                <td className="p-2">
                  <div className="flex items-center gap-2.5">
                    <SchoolLogo slug={r.c.slug} />
                    <TierBadge tier={tierFor(r)} />
                    <div className="min-w-0">
                      <Link href={`/colleges/${r.c.slug}`} className="font-semibold hover:underline">
                        {r.c.name}
                      </Link>
                      <div className="text-xs text-zinc-500">{place(t, r)}</div>
                      <ApplyTags tags={applyTags[r.c.slug]} className="mt-1" />
                    </div>
                  </div>
                </td>
                {showAdmit && (
                  <td className="p-2 text-right">
                    <AdmitCell r={r} />
                  </td>
                )}
                {isUS &&
                  tests.map((k) => (
                    <td key={k} className="p-2 text-right">
                      <MedianCell m={r[k]} test={k} you={myScores[k]} />
                    </td>
                  ))}
                <td className="p-2 text-right">
                  <TuitionCell tu={r.tuition} />
                </td>
                {showEnglish && (
                  <td className="p-2">
                    <EnglishFitBadge fit={r.english} />
                  </td>
                )}
                {isUS && <td className="p-2">{fitCell(r)}</td>}
                <td className="hidden p-2 whitespace-nowrap tabular-nums xl:table-cell">{fmtDate(r.c.next_deadline)}</td>
                {isUS && (
                  <td className="hidden whitespace-nowrap p-2 xl:table-cell">
                    {r.c.test_policy ? <Pill>{r.c.test_policy in TEST_POLICY ? t(`colleges.testPolicy.${r.c.test_policy}` as MessageKey) : r.c.test_policy}</Pill> : <span className="text-zinc-400">—</span>}
                  </td>
                )}
                {isUS && <td className="hidden p-2 text-xs 2xl:table-cell">{[...(r.c.plans ?? [])].sort().join(" · ") || <span className="text-zinc-400">—</span>}</td>}
                <td className="p-2 text-right">{listButton(r)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-2">{empty}</div>}
      </div>

      {shown.hasMore && <LoadMore key={shown.count} count={shown.count} onVisible={shown.more} />}
      <p className="text-xs text-zinc-500">{isUS ? t("colleges.footnote") : t("colleges.footnoteNonUS")}</p>
    </div>
  );
}

const place = (t: TFunction, r: ExploreRow) =>
  [[r.c.city, r.c.state_region].filter(Boolean).join(", "), r.c.control === "public" ? t("colleges.public") : r.c.control ? t("colleges.private") : null].filter(Boolean).join(" · ");

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function AdmitCell({ r }: { r: ExploreRow }) {
  const t = useT();
  const student = useStudent();
  const intl = !!student.profile.international && r.c.intl_admit_rate != null;
  if (r.c.admit_rate == null && !intl) return <span className="text-zinc-400" title={t("colleges.notReported")}>—</span>;
  return (
    <span className="tabular-nums">
      {fmtPct(r.c.admit_rate)}
      {intl && <span className="block text-xs text-zinc-500">{t("colleges.intlRate", { pct: fmtPct(r.c.intl_admit_rate) })}</span>}
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
        <span className="text-zinc-400">—</span>
        {range && <span className="block text-[11px] text-zinc-500">{t("colleges.middleRange", { range })}</span>}
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
        <span className="block text-[11px] text-zinc-500">{t("colleges.youDelta", { d: delta === 0 ? "±0" : delta > 0 ? `+${delta}` : `−${Math.abs(delta)}` })}</span>
      )}
    </span>
  );
}

function TuitionCell({ tu }: { tu: TuitionEstimate }) {
  const t = useT();
  if (tu.amount == null || !tu.basis)
    return (
      <span className="cursor-help text-zinc-400" title={t("colleges.tuitionNone")}>
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
      <span className="block whitespace-nowrap text-[11px] text-zinc-500">
        {tu.max != null
          ? t("colleges.tuitionUpTo", { amount: fmtMoney(tu.max, tu.currency) })
          : tu.outOfState != null
            ? t("colleges.tuitionOos", { amount: fmtMoney(tu.outOfState, tu.currency) })
            : t(`colleges.tuitionBasis.${tu.basis}`)}
      </span>
    </span>
  );
}
