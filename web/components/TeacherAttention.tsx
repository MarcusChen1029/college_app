"use client";

import Link from "next/link";
import { FlagPills } from "@/components/TeacherFlags";
import { studentHref } from "@/components/TeacherRosterTable";
import { useT } from "@/lib/i18n/client";
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
  const t = useT();
  const { data, error, retry } = useLoad(fetchAttention);

  return (
    <section className="space-y-3 rounded-2xl border border-zinc-200 p-5" aria-labelledby="attention-heading">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="attention-heading" className="font-display text-xl font-bold">
          {t("teacher.attention.heading")}
        </h2>
        {data && data.total > 0 && (
          <Link href="/teacher/students" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
            {t("teacher.attention.viewAll", { n: data.total })}
          </Link>
        )}
      </div>
      {!data ? (
        error ? (
          <p role="alert" className="text-sm text-zinc-500">
            {t("teacher.attention.loadError")}{" "}
            <button type="button" className="font-semibold text-blue-700 underline underline-offset-4" onClick={retry}>
              {t("teacher.tryAgain")}
            </button>
          </p>
        ) : (
          <div className="h-16 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : data.total === 0 ? (
        <p className="text-sm text-zinc-500">
          {t("teacher.attention.nonePre")}
          <Link href="/teacher/classes" className="font-semibold text-blue-700 underline underline-offset-4">
            {t("teacher.classes.title")}
          </Link>
          {t("teacher.attention.nonePost")}
        </p>
      ) : data.top.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("teacher.attention.nobody")}</p>
      ) : (
        <>
          {data.flagged > data.top.length && (
            <p className="text-sm text-zinc-500">
              {t("teacher.attention.showing", { shown: data.top.length, total: data.flagged })}
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
