"use client";

import Link from "next/link";
import { FlagPills } from "@/components/TeacherFlags";
import { studentHref } from "@/components/TeacherRosterTable";
import { teacherRoster } from "@/lib/links-api";
import { ALL_CLASSES, buildRows, viewRows } from "@/lib/roster-view";
import { useLoad } from "@/lib/use-load";

const TOP = 5;

async function fetchAttention() {
  const rows = buildRows(await teacherRoster(), new Date());
  const flagged = viewRows(rows, { query: "", classId: ALL_CLASSES, attentionOnly: true }, "attention");
  return { total: rows.length, flagged: flagged.length, top: flagged.slice(0, TOP) };
}

/** Dashboard card: the students with the most attention flags. A failure here only shows a muted line. */
export function TeacherAttention() {
  const { data, error, retry } = useLoad(fetchAttention);

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 p-5" aria-labelledby="attention-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attention-heading" className="font-display text-xl font-bold">
          Needs attention
        </h2>
        {data && data.total > 0 && (
          <Link href="/teacher/students" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
            View all {data.total} students
          </Link>
        )}
      </div>
      {!data ? (
        error ? (
          <p role="alert" className="text-sm text-zinc-500">
            Couldn&apos;t load your students just now.{" "}
            <button type="button" className="font-semibold text-blue-700 underline underline-offset-4" onClick={retry}>
              Try again
            </button>
          </p>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : data.total === 0 ? (
        <p className="text-sm text-zinc-500">No students are linked yet. Share a class code or your one-on-one code below.</p>
      ) : data.top.length === 0 ? (
        <p className="text-sm text-zinc-500">Nobody needs attention right now.</p>
      ) : (
        <>
          {data.flagged > data.top.length && (
            <p className="text-sm text-zinc-500">
              Showing {data.top.length} of {data.flagged} students with flags.
            </p>
          )}
          <ul className="divide-y divide-zinc-100">
            {data.top.map(({ student, flags }) => (
              <li key={student.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <Link href={studentHref(student.studentId)} className="font-medium text-blue-700 underline-offset-4 hover:underline">
                  {student.displayName}
                </Link>
                <FlagPills flags={flags} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
