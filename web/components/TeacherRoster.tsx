"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TeacherRosterTable } from "@/components/TeacherRosterTable";
import { btn } from "@/components/TeacherClassCard";
import { CSV_BOM } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { loadTeacherOverview, teacherRoster } from "@/lib/links-api";
import { rosterCsv, rosterCsvFilename } from "@/lib/roster-export";
import { ALL_CLASSES, buildRows, NO_CLASS, ROSTER_SORTS, viewRows, type RosterRow, type RosterSort } from "@/lib/roster-view";
import { useLoad } from "@/lib/use-load";

const field = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";

type Data = { rows: RosterRow[]; classes: { id: string; name: string; archived: boolean }[]; now: Date };

// Class names are a nicety: if that call fails the roster still loads, with generic chips.
async function fetchRoster(): Promise<Data> {
  const [students, overview] = await Promise.all([teacherRoster(), loadTeacherOverview().catch(() => null)]);
  const now = new Date();
  return { rows: buildRows(students, now), classes: overview?.classes ?? [], now };
}

/** All linked students in one table, with search, class filter, "needs attention" filter and sorting. */
export function TeacherRoster() {
  const { data, error, retry } = useLoad(fetchRoster);
  const [query, setQuery] = useState("");
  const [classId, setClassId] = useState(ALL_CLASSES);
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [sort, setSort] = useState<RosterSort>("attention");

  const classNames = useMemo(() => new Map((data?.classes ?? []).map((c) => [c.id, c.name])), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const activeClassIds = data.classes.filter((c) => !c.archived).map((c) => c.id);
    return viewRows(data.rows, { query, classId, attentionOnly, activeClassIds }, sort);
  }, [data, query, classId, attentionOnly, sort]);

  // The BOM makes Excel read the file as UTF-8, so accented names survive.
  function downloadCsv() {
    downloadText(rosterCsvFilename(new Date()), CSV_BOM + rosterCsv(shown, classNames), "text/csv;charset=utf-8");
  }

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

  const activeClasses = data.classes.filter((c) => !c.archived);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">Students</h1>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          No students are linked to you yet. Create a class or turn on your one-on-one code on the{" "}
          <Link href="/teacher/classes" className="font-semibold text-blue-700 underline underline-offset-4">
            Classes page
          </Link>{" "}
          and share the code with your students.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4">
            <label className="min-w-48 flex-1 text-sm font-medium">
              Search
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={field} placeholder="Name or email" />
            </label>
            <label className="w-52 text-sm font-medium">
              Class
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                <option value={ALL_CLASSES}>All students</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NO_CLASS}>One-on-one only</option>
              </select>
            </label>
            <label className="w-52 text-sm font-medium">
              Sort by
              <select value={sort} onChange={(e) => setSort(e.target.value as RosterSort)} className={field}>
                {ROSTER_SORTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
              Needs attention only
            </label>
            <button type="button" className={btn} disabled={shown.length === 0} onClick={downloadCsv}>
              Download CSV ({shown.length})
            </button>
          </div>
          <p className="text-xs text-zinc-500">CSV export contains what you see here: names, emails, scores, deadlines and flags.</p>

          <p className="text-sm text-zinc-500" aria-live="polite">
            Showing {shown.length} of {data.rows.length} students
          </p>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">No students match these filters.</p>
          ) : (
            <TeacherRosterTable rows={shown} classNames={classNames} now={data.now} />
          )}
        </>
      )}
    </div>
  );
}
