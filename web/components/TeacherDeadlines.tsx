"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { btn } from "@/components/TeacherClassCard";
import { ChecklistBar, studentHref } from "@/components/TeacherRosterTable";
import { TeacherGate } from "@/components/TeacherGate";
import { dateHeading, errorText, statusText } from "@/components/TeacherText";
import { DayStamp } from "@/components/teacher/DayStamp";
import { progress } from "@/lib/checklist";
import { useLocale, useT } from "@/lib/i18n/client";
import { teacherDeadlines, teacherRoster } from "@/lib/links-api";
import { daysUntil } from "@/lib/roster";
import { groupDeadlines, statusLabel, statusTone } from "@/lib/roster-view";
import { useLoad } from "@/lib/use-load";

const RANGES = [30, 60, 90, 180] as const;

function DeadlineList({ days }: { days: number }) {
  const t = useT();
  const locale = useLocale();
  // The roster rides along for each college's checklist, so a row shows how far the application is, not only its date.
  const load = useCallback(async () => {
    const [list, roster] = await Promise.all([teacherDeadlines(days), teacherRoster()]);
    const checklists = new Map(roster.flatMap((s) => s.colleges.map((c) => [`${s.studentId}|${c.slug}`, progress(c.checklist)] as const)));
    return { list, checklists, now: new Date() };
  }, [days]);
  const { data, error, retry } = useLoad(load);

  if (!data) {
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {errorText(t, error)}
        </p>
        <button type="button" className={btn} onClick={retry}>
          {t("teacher.tryAgain")}
        </button>
      </div>
    ) : (
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
    );
  }

  const groups = groupDeadlines(data.list, data.now);
  if (groups.length === 0) {
    return (
      <p className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">
        {t("teacher.deadlines.nonePre", { n: days })}
        <Link href="/teacher/students" className="font-semibold text-blue-700 underline underline-offset-4">
          {t("teacher.deadlines.noneLink")}
        </Link>
        {t("teacher.deadlines.nonePost")}
      </p>
    );
  }

  // One planner sheet: the day on the left, that day's deadlines on the right. The status pill says where each
  // application stands (Submitted reads as done, the same tones the student sees).
  return (
    <ol className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
      {groups.map((g) => (
        <li key={g.date} className="grid grid-cols-[4.75rem_minmax(0,1fr)] gap-4 px-4 py-4 sm:grid-cols-[6.5rem_minmax(0,1fr)] sm:px-6">
          <h2 className="sr-only">{dateHeading(t, locale, g.date, data.now)}</h2>
          <DayStamp date={g.date} days={daysUntil(g.date, data.now)} />
          <ul className="divide-y divide-zinc-100">
            {g.items.map((d) => (
              <li
                key={`${d.studentId}-${d.collegeSlug}-${d.kind}-${d.label}`}
                className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5 py-3 first:pt-0 last:pb-0 md:grid md:grid-cols-[minmax(0,1fr)_10rem_9rem_9.5rem] md:gap-x-6"
              >
                <div className="min-w-0">
                  <Link href={studentHref(d.studentId)} className="font-semibold text-blue-700 underline-offset-4 hover:underline">
                    {d.studentName}
                  </Link>
                  <p className="text-[15px] text-ink [overflow-wrap:anywhere]">{d.collegeName}</p>
                  <p className="text-[13px] text-zinc-600 md:hidden">{d.label}</p>
                </div>
                {/* From md up the plan and the checklist get columns, so a day reads across like a timetable row. */}
                <p className="hidden pt-0.5 text-sm text-zinc-700 md:block">{d.label}</p>
                <div className="hidden pt-1.5 md:block">
                  {(() => {
                    const p = data.checklists.get(`${d.studentId}|${d.collegeSlug}`);
                    return p ? <ChecklistBar done={p.done} total={p.total} /> : <span className="text-zinc-500">-</span>;
                  })()}
                </div>
                <span className="md:justify-self-end">
                  <StatusPill tone={statusTone(d.status)}>{statusText(t, statusLabel(d.status))}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

/** Deadlines coming up across all linked students, as one planner sheet grouped by day. */
export function TeacherDeadlines() {
  const t = useT();
  const [days, setDays] = useState<number>(60);
  return (
    <TeacherGate returnTo="/teacher/deadlines">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("teacher.deadlines.title")}</h1>
          <label className="text-sm font-medium">
            {t("teacher.deadlines.showNext")}
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-2 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm">
              {RANGES.map((n) => (
                <option key={n} value={n}>
                  {t("teacher.deadlines.days", { n })}
                </option>
              ))}
            </select>
          </label>
        </div>
        <DeadlineList days={days} />
      </div>
    </TeacherGate>
  );
}
