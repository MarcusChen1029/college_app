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

/** SAT / ACT / GPA, each kept whole on its own line (or joined with " · " on a phone card). */
function Scores({ row, inline = false }: { row: RosterRow; inline?: boolean }) {
  const t = useT();
  const { satTotal, actComposite, gpaUnweighted, isInternational } = row.student;
  const parts = [satTotal != null && `SAT ${satTotal}`, actComposite != null && `ACT ${actComposite}`, gpaUnweighted != null && `GPA ${gpaUnweighted}`].filter(Boolean) as string[];
  const intl = isInternational && <span className="inline-block rounded bg-blue-50 px-1.5 text-[13px] font-semibold whitespace-nowrap text-blue-700">{t("teacher.col.intl")}</span>;
  if (inline) {
    return (
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap">{parts.length === 0 ? NONE : parts.join(" · ")}</span>
        {intl}
      </span>
    );
  }
  return (
    <div className="space-y-0.5">
      {parts.length === 0 ? <Missing /> : parts.map((p) => <p key={p} className="whitespace-nowrap tabular-nums">{p}</p>)}
      {intl}
    </div>
  );
}

/** One mark for every missing value in the roster, so a blank never reads three different ways. */
const NONE = "—";
function Missing() {
  return (
    <span className="text-zinc-500">{NONE}</span>
  );
}

const chip = "rounded-full bg-zinc-100 px-2 py-0.5 text-[13px] whitespace-nowrap text-zinc-700";

/** A student's classes on one line: the first class, then "+1" (its title names the rest), so every row is one height. */
function ClassChips({ ids, classNames }: { ids: string[]; classNames: Map<string, string> }) {
  const t = useT();
  if (ids.length === 0) return null;
  const names = ids.map((id) => classNames.get(id) ?? t("teacher.col.classFallback"));
  const rest = names.slice(1);
  return (
    <p className="flex min-w-0 flex-nowrap items-center gap-1">
      <span className={`${chip} min-w-0 truncate`} title={names[0]}>
        {names[0]}
      </span>
      {rest.length > 0 && (
        <span className={`${chip} shrink-0`} title={rest.join(", ")}>
          +{rest.length}
          <span className="sr-only">: {rest.join(", ")}</span>
        </span>
      )}
    </p>
  );
}

/** An email is never broken mid-word: it is cut with an ellipsis and the full address is the title. */
function Email({ email }: { email: string }) {
  return (
    <p className="truncate text-[13px] text-zinc-600" title={email}>
      {email}
    </p>
  );
}

export function ChecklistBar({ done, total }: { done: number; total: number }) {
  const t = useT();
  if (total === 0) return <Missing />;
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
      <span className="text-[13px] tabular-nums text-zinc-600">
        {done}/{total}
      </span>
    </div>
  );
}

type Props = { rows: RosterRow[]; classNames: Map<string, string>; now: Date };

/** Below 768px: one card per student, the same facts stacked, so nothing scrolls sideways. */
function RosterCards({ rows, classNames, now }: Props) {
  const t = useT();
  const label = "text-[13px] font-medium text-zinc-600";
  return (
    <ul className="space-y-3 md:hidden">
      {rows.map((row) => {
        const s = row.student;
        return (
          <li key={s.studentId} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Link href={studentHref(s.studentId)} className="font-semibold text-blue-700 underline-offset-4 hover:underline">
                  {s.displayName}
                </Link>
                <Email email={s.email} />
              </div>
              <span className="shrink-0 text-[13px] text-zinc-600">{relativeText(t, relativeTime(s.lastActive, now))}</span>
            </div>
            {row.flags.length > 0 && <FlagPills flags={row.flags} />}
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div className="col-span-2">
                <dt className={label}>{t("teacher.col.scores")}</dt>
                <dd>
                  <Scores row={row} inline />
                </dd>
              </div>
              <div>
                <dt className={label}>{t("teacher.col.colleges")}</dt>
                <dd>{s.colleges.length === 0 ? <Missing /> : t("teacher.col.activeTotal", { active: row.activeColleges, total: s.colleges.length })}</dd>
              </div>
              <div>
                <dt className={label}>{t("teacher.checklist")}</dt>
                <dd className="pt-1">
                  <ChecklistBar {...row.checklist} />
                </dd>
              </div>
              {row.next && (
                <div className="col-span-2">
                  <dt className={label}>{t("teacher.col.nextDeadline")}</dt>
                  <dd className="mt-1 space-y-1">
                    <DeadlineChip date={row.next.date} days={row.next.days} done={false} />
                    <p className="text-[13px] [overflow-wrap:anywhere]">{row.next.collegeName}</p>
                  </dd>
                </div>
              )}
            </dl>
            <ClassChips ids={s.classIds} classNames={classNames} />
          </li>
        );
      })}
    </ul>
  );
}

/** The roster: a table from 768px up (one row per student, scores, progress, next deadline and flags), cards below. */
export function TeacherRosterTable({ rows, classNames, now }: Props) {
  const t = useT();
  return (
    <>
    <RosterCards rows={rows} classNames={classNames} now={now} />
    {/* relative: the pills' sr-only text is absolutely positioned; without a positioned box here it escaped the scroller. */}
    <div className="relative hidden overflow-x-auto rounded-2xl border border-zinc-200 bg-white md:block">
      <table className="w-full min-w-[60rem] text-sm">
        <thead className="border-b border-zinc-200 bg-zinc-50">
          <tr>
            <th scope="col" className={th}>{t("teacher.student")}</th>
            <th scope="col" className={`${th} min-w-[8.5rem]`}>{t("teacher.col.scores")}</th>
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
                <td className={`${td} max-w-[15rem]`}>
                  <Link href={studentHref(s.studentId)} className="font-medium text-blue-700 underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                    {s.displayName}
                  </Link>
                  <Email email={s.email} />
                  <div className="mt-1">
                    <ClassChips ids={s.classIds} classNames={classNames} />
                  </div>
                </td>
                <td className={`${td} min-w-[8.5rem]`}>
                  <Scores row={row} />
                </td>
                <td className={`${td} whitespace-nowrap`}>
                  {s.colleges.length === 0 ? <Missing /> : t("teacher.col.activeTotal", { active: row.activeColleges, total: s.colleges.length })}
                </td>
                <td className={td}>
                  <ChecklistBar {...row.checklist} />
                </td>
                <td className={td}>
                  {row.next ? (
                    <div className="space-y-1">
                      {/* Only active (not yet submitted) colleges get a next deadline, so it is never done. */}
                      <DeadlineChip date={row.next.date} days={row.next.days} done={false} />
                      <p className="text-[13px]">{row.next.collegeName}</p>
                    </div>
                  ) : (
                    <Missing />
                  )}
                </td>
                <td className={td}>
                  {row.flags.length > 0 ? <FlagPills flags={row.flags} /> : <Missing />}
                </td>
                <td className={`${td} whitespace-nowrap text-zinc-600`}>{relativeText(t, relativeTime(s.lastActive, now))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </>
  );
}
