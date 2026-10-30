"use client";

import { useCallback } from "react";
import { useLocale, useT } from "@/lib/i18n/client";
import { testPlanText } from "@/lib/i18n/test-plan-text";
import { collegeNames } from "@/lib/links-api";
import { whenText } from "@/components/TeacherText";
import { collegeSummary, englishTests, humanize, interestedNames, sectionScores } from "@/lib/roster-detail";
import { daysLabel, shortDate } from "@/lib/roster-view";
import { useLoad } from "@/lib/use-load";
import type { StudentDetail } from "@/lib/roster";
import { regionLabel } from "@/lib/regions";
import { ACT_SCALE, SAT_SCALE, type ScoreScale, type SectionScores } from "@/lib/scores";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // A cell of one spec sheet: hairlines on top and left, pulled 1px out so the sheet's own border covers the outer ones.
    <div className="-mt-px -ml-px space-y-1 border-t border-l border-zinc-200 p-4 sm:p-5">
      <dt className="text-[13px] font-medium text-zinc-600">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function Missing() {
  const t = useT();
  return <span className="text-zinc-500">{t("teacher.overview.notEntered")}</span>;
}

/** A headline score with the filled-in section scores underneath. */
function Score({ value, scale, sections }: { value: number | null; scale: ScoreScale; sections?: SectionScores }) {
  const parts = sectionScores(scale, sections);
  if (value == null && parts.length === 0) return <Missing />;
  return (
    <>
      {value != null && <p className="font-display text-xl font-bold">{value}</p>}
      {parts.length > 0 && <p className="text-zinc-600">{parts.map((p) => `${p.label} ${p.value}`).join(" · ")}</p>}
    </>
  );
}

/** The first thing a counselor checks, above the profile facts: how the college list stands and what is due next. */
function CollegeSummaryRow({ detail, now }: { detail: StudentDetail; now: Date }) {
  const t = useT();
  const locale = useLocale();
  const s = collegeSummary(detail, now);
  const n = s.total;
  return (
    <p className="mb-4 flex flex-col gap-y-1 rounded-2xl bg-blue-50 px-5 py-3.5 text-[15px] text-ink sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
      <span>
        <strong className="font-semibold">{t(n === 1 ? "teacher.week.colleges.one" : "teacher.week.colleges.other", { n })}</strong>
        {s.submitted > 0 && <span className="text-zinc-700"> · {t("teacher.overview.sumSubmitted", { n: s.submitted })}</span>}
      </span>
      <span aria-hidden="true" className="text-zinc-500 max-sm:hidden">
        ·
      </span>
      {s.next ? (
        <>
          <span className="[overflow-wrap:anywhere]">
            {t("teacher.overview.sumNext")} <strong className="font-semibold">{shortDate(s.next.date, locale, now)}</strong>{" "}
            <span className="text-zinc-700">({whenText(t, daysLabel(s.next.days))})</span> · {s.next.college}
          </span>
          <span aria-hidden="true" className="text-zinc-500 max-sm:hidden">
            ·
          </span>
          <span className="text-zinc-700">{s.next.open === 0 ? t("teacher.week.allDone") : t("teacher.week.open", { n: s.next.open, total: s.next.items })}</span>
        </>
      ) : (
        <span className="text-zinc-700">{t("teacher.overview.sumNoNext")}</span>
      )}
    </p>
  );
}

export function OverviewPanel({ detail, now = new Date() }: { detail: StudentDetail; now?: Date }) {
  const t = useT();
  const locale = useLocale();
  const p = detail.profile;
  // Only a saved choice is shown (the SAT and ACT boxes already show scores); the RPC returns test_details, so no SQL change is needed.
  const testPlan = p.testDetails.plan ? testPlanText(t, locale, p.testDetails) : "";
  const english = englishTests(p.testDetails, { key: p.englishTestKey, score: p.englishScore });
  return (
    <div>
    <CollegeSummaryRow detail={detail} now={now} />
    <dl className="grid overflow-hidden rounded-2xl border border-zinc-200 bg-white sm:grid-cols-2 lg:grid-cols-3">
      <Item label="SAT">
        <Score value={p.satTotal} scale={SAT_SCALE} sections={p.testDetails.sat} />
      </Item>
      <Item label="ACT">
        <Score value={p.actComposite} scale={ACT_SCALE} sections={p.testDetails.act} />
      </Item>
      {testPlan && <Item label={t("profile.test.planLabel")}>{testPlan}</Item>}
      <Item label={t("teacher.overview.gpa")}>{p.gpaUnweighted != null ? <p className="font-display text-xl font-bold">{p.gpaUnweighted}</p> : <Missing />}</Item>
      <Item label={english.length > 1 ? t("teacher.overview.englishTests") : t("teacher.overview.englishTest")}>
        {english.length > 0 ? (
          <ul className="space-y-2">
            {english.map((e) => (
              <li key={e.key}>
                <p>
                  {e.label}
                  {e.total != null && <span className="font-display text-xl font-bold"> {e.total}</span>}
                </p>
                {e.parts.length > 0 && <p className="text-zinc-600">{e.parts.map((s) => `${s.label} ${s.value}`).join(" · ")}</p>}
              </li>
            ))}
          </ul>
        ) : (
          <Missing />
        )}
      </Item>
      <Item label={t("teacher.overview.field")}>{p.intendedCategory ? humanize(p.intendedCategory) : <Missing />}</Item>
      <Item label={t("teacher.overview.regions")}>{p.targetRegions.length > 0 ? p.targetRegions.map(regionLabel).join(", ") : <span className="text-zinc-500">{t("teacher.overview.notChosen")}</span>}</Item>
      <Item label={t("teacher.overview.international")}>{p.isInternational ? t("common.yes") : t("common.no")}</Item>
      <Item label={t("teacher.overview.needsAid")}>{p.needsAid ? t("common.yes") : t("common.no")}</Item>
    </dl>
    {/* When the profile last changed is about the record, not the student: a line under the sheet, not a cell in it. */}
    <p className="mt-2 text-[13px] text-zinc-600">
      {t("teacher.overview.updated")} {p.updatedAt ? shortDate(p.updatedAt, locale) : t("teacher.time.never")}
    </p>
    </div>
  );
}

/** The student's interested colleges in their own order, with names from the database (a title made from the slug if unknown). */
export function InterestedPanel({ detail }: { detail: StudentDetail }) {
  const t = useT();
  const names = interestedNames(detail);
  const slugs = detail.profile.interested;
  const load = useCallback(() => collegeNames(slugs), [slugs]);
  const { data: real, loading } = useLoad(load); // if the lookup fails `real` stays null and the fallback names show
  if (names.length === 0) return <p className="text-sm text-zinc-500">{t("teacher.overview.interestedNone", { name: detail.displayName })}</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-500">{t("teacher.overview.interestedIntro", { name: detail.displayName })}</p>
      <ul className="flex flex-wrap gap-2" aria-busy={loading}>
        {names.map((n) =>
          loading ? (
            <li key={n.slug} aria-hidden="true" className="h-7 w-28 animate-pulse rounded-full bg-zinc-100" />
          ) : (
            <li key={n.slug} className="rounded-full bg-zinc-100 px-3 py-1 text-sm text-zinc-800">
              {real?.get(n.slug) ?? n.name}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
