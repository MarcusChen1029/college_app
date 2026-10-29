"use client";

import Link from "next/link";
import { DeadlineChip } from "@/components/StatusPill";
import { FlagPills } from "@/components/TeacherFlags";
import { relativeText } from "@/components/TeacherText";
import { useT } from "@/lib/i18n/client";
import { relativeTime, type RosterRow } from "@/lib/roster-view";

const th = "px-3 py-2 text-left text-[13px] font-medium text-zinc-600";
const td = "px-3 py-3 align-top";

export const studentHref = (id: string) => `/teacher/students?s=${encodeURIComponent(id)}`;

function Scores({ row }: { row: RosterRow }) {
  const t = useT();
  const { satTotal, actComposite, gpaUnweighted, isInternational } = row.student;
  const parts = [satTotal != null && `SAT ${satTotal}`, actComposite != null && `ACT ${actComposite}`, gpaUnweighted != null && `GPA ${gpaUnweighted}`].filter(Boolean);
  return (
    <div className="space-y-0.5">
      {parts.length === 0 ? <span className="text-zinc-400">-</span> : parts.map((p) => <p key={String(p)}>{p}</p>)}
      {isInternational && <span className="inline-block rounded bg-blue-50 px-1.5 text-[11px] font-semibold text-blue-700">{t("teacher.col.intl")}</span>}
    </div>
  );
}

function ChecklistBar({ done, total }: { done: number; total: number }) {
  const t = useT();
  if (total === 0) return <span className="text-zinc-400">-</span>;
  return (
    <div className="flex items-center gap-2">
      <div
        role="progressbar"
        aria-label={t("teacher.col.checklistProgress")}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 w-20 overflow-hidden rounded-full bg-zinc-200"
      >
        <div className={`h-full rounded-full ${done === total ? "bg-done" : "bg-zinc-500"}`} style={{ width: `${Math.round((done / total) * 100)}%` }} />
      </div>
      <span className="text-xs tabular-nums text-zinc-600">
        {done}/{total}
      </span>
    </div>
  );
}

type Props = { rows: RosterRow[]; classNames: Map<string, string>; now: Date };

/** The roster table: one row per student, scores, progress, next deadline and attention flags. */
export function TeacherRosterTable({ rows, classNames, now }: Props) {
  const t = useT();
  return (
    <div className="overflow-x-auto rounded-2xl border border-zinc-200">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th scope="col" className={th}>{t("teacher.student")}</th>
            <th scope="col" className={th}>{t("teacher.col.scores")}</th>
            <th scope="col" className={th}>{t("teacher.col.colleges")}</th>
            <th scope="col" className={th}>{t("teacher.checklist")}</th>
            <th scope="col" className={th}>{t("teacher.col.nextDeadline")}</th>
            <th scope="col" className={th}>{t("teacher.col.flags")}</th>
            <th scope="col" className={th}>{t("teacher.col.lastActive")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => {
            const s = row.student;
            return (
              <tr key={s.studentId}>
                <td className={td}>
                  <Link href={studentHref(s.studentId)} className="font-medium text-blue-700 underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                    {s.displayName}
                  </Link>
                  <p className="text-xs text-zinc-500 [overflow-wrap:anywhere]">{s.email}</p>
                  {s.classIds.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {s.classIds.map((id) => (
                        <span key={id} className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-700">
                          {classNames.get(id) ?? t("teacher.col.classFallback")}
                        </span>
                      ))}
                    </p>
                  )}
                </td>
                <td className={td}>
                  <Scores row={row} />
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {t("teacher.col.activeTotal", { active: row.activeColleges, total: s.colleges.length })}
                </td>
                <td className={td}>
                  <ChecklistBar {...row.checklist} />
                </td>
                <td className={td}>
                  {row.next ? (
                    <div className="space-y-1">
                      {/* Only active (not yet submitted) colleges get a next deadline, so it is never done. */}
                      <DeadlineChip date={row.next.date} days={row.next.days} done={false} />
                      <p className="text-xs">{row.next.collegeName}</p>
                    </div>
                  ) : (
                    <span className="text-zinc-400">-</span>
                  )}
                </td>
                <td className={td}>
                  <FlagPills flags={row.flags} emptyLabel={t("teacher.flag.none")} />
                </td>
                <td className={`${td} whitespace-nowrap text-zinc-600`}>{relativeText(t, relativeTime(s.lastActive, now))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
