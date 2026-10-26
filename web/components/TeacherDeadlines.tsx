"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { btn } from "@/components/TeacherClassCard";
import { studentHref } from "@/components/TeacherRosterTable";
import { TeacherGate } from "@/components/TeacherGate";
import { isSubmitted } from "@/lib/application";
import { teacherDeadlines } from "@/lib/links-api";
import { daysUntil } from "@/lib/roster";
import { groupDeadlines, statusLabel, statusTone } from "@/lib/roster-view";
import type { Status } from "@/lib/student-store";
import { useLoad } from "@/lib/use-load";

const RANGES = [30, 60, 90, 180] as const;

function DeadlineList({ days }: { days: number }) {
  const load = useCallback(async () => ({ list: await teacherDeadlines(days), now: new Date() }), [days]);
  const { data, error, retry } = useLoad(load);

  if (!data) {
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
        <button type="button" className={btn} onClick={retry}>
          Try again
        </button>
      </div>
    ) : (
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
    );
  }

  const groups = groupDeadlines(data.list, data.now);
  if (groups.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No deadlines in the next {days} days. If you expected some,{" "}
        <Link href="/teacher/students" className="font-semibold text-blue-700 underline underline-offset-4">
          check that your students have added colleges
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.date} aria-label={g.heading} className="space-y-2">
          <h2 className="font-display text-lg font-bold">{g.heading}</h2>
          <ul className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 px-5">
            {g.items.map((d) => (
              <li key={`${d.studentId}-${d.collegeSlug}-${d.kind}-${d.label}`} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span className="[overflow-wrap:anywhere]">
                  <Link href={studentHref(d.studentId)} className="font-medium text-blue-700 underline-offset-4 hover:underline">
                    {d.studentName}
                  </Link>
                  <span className="text-zinc-500"> - {d.collegeName}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span>{d.label}</span>
                  {/* The teacher feed carries no checklist, so "done" means an application deadline that is already submitted. */}
                  <DeadlineChip date={d.dueDate} days={daysUntil(d.dueDate, data.now)} done={d.kind === "application" && isSubmitted(d.status as Status)} />
                  <StatusPill tone={statusTone(d.status)}>{statusLabel(d.status)}</StatusPill>
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** Deadlines coming up across all linked students, grouped by date. */
export function TeacherDeadlines() {
  const [days, setDays] = useState<number>(60);
  return (
    <TeacherGate returnTo="/teacher/deadlines">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="font-display text-3xl font-bold">Upcoming deadlines</h1>
          <label className="text-sm font-medium">
            Show the next
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="ml-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
              {RANGES.map((n) => (
                <option key={n} value={n}>
                  {n} days
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
