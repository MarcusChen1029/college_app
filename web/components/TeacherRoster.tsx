"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { errorText } from "@/components/TeacherText";
import { TeacherRosterTable } from "@/components/TeacherRosterTable";
import { btn } from "@/components/TeacherClassCard";
import { CSV_BOM } from "@/lib/csv";
import { downloadText } from "@/lib/download";
import { useT } from "@/lib/i18n/client";
import { loadTeacherOverview, teacherRoster } from "@/lib/links-api";
import { rosterCsv, rosterCsvFilename } from "@/lib/roster-export";
import { ALL_CLASSES, buildRows, NO_CLASS, ROSTER_SORTS, viewRows, type RosterRow, type RosterSort } from "@/lib/roster-view";
import { useLoad } from "@/lib/use-load";

const SORT_KEYS = {
  attention: "teacher.students.sortAttention",
  name: "teacher.students.sortName",
  deadline: "teacher.students.sortDeadline",
  active: "teacher.students.sortActive",
} as const;

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
  const t = useT();
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

  const activeClasses = data.classes.filter((c) => !c.archived);

  return (
    <div className="space-y-5">
      <h1 className="font-display text-3xl font-bold">{t("teacher.students.heading")}</h1>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
          {t("teacher.students.emptyPre")}
          <Link href="/teacher/classes" className="font-semibold text-blue-700 underline underline-offset-4">
            {t("teacher.students.emptyLink")}
          </Link>
          {t("teacher.students.emptyPost")}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-zinc-200 p-4">
            <label className="min-w-48 flex-1 text-sm font-medium">
              {t("teacher.students.search")}
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} className={field} placeholder={t("teacher.students.searchPlaceholder")} />
            </label>
            <label className="w-52 text-sm font-medium">
              {t("teacher.students.class")}
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className={field}>
                <option value={ALL_CLASSES}>{t("teacher.students.all")}</option>
                {activeClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option value={NO_CLASS}>{t("teacher.students.oneOnOne")}</option>
              </select>
            </label>
            <label className="w-52 text-sm font-medium">
              {t("teacher.students.sortBy")}
              <select value={sort} onChange={(e) => setSort(e.target.value as RosterSort)} className={field}>
                {ROSTER_SORTS.map(([value]) => (
                  <option key={value} value={value}>
                    {t(SORT_KEYS[value])}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={attentionOnly} onChange={(e) => setAttentionOnly(e.target.checked)} />
              {t("teacher.students.attentionOnly")}
            </label>
            <button type="button" className={btn} disabled={shown.length === 0} onClick={downloadCsv}>
              {t("teacher.students.downloadCsv", { n: shown.length })}
            </button>
          </div>
          <p className="text-xs text-zinc-500">{t("teacher.students.csvNote")}</p>

          <p className="text-sm text-zinc-500" aria-live="polite">
            {t("teacher.students.showing", { shown: shown.length, total: data.rows.length })}
          </p>
          {shown.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">{t("teacher.students.noMatch")}</p>
          ) : (
            <TeacherRosterTable rows={shown} classNames={classNames} now={data.now} />
          )}
        </>
      )}
    </div>
  );
}
