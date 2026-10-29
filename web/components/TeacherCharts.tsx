"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { btn } from "@/components/TeacherClassCard";
import { TeacherGate } from "@/components/TeacherGate";
import { errorText, statusText } from "@/components/TeacherText";
import { useT } from "@/lib/i18n/client";
import type { TFunction } from "@/lib/i18n";
import { teacherOutcomes } from "@/lib/charts-api";
import {
  buildChart,
  CHART_BOX,
  defaultMetric,
  MIN_STUDENTS,
  OUTCOME_LABEL,
  OUTCOMES,
  outcomeCounts,
  type ClassOutcomes,
  type CollegeOutcomes,
  type Outcome,
  type TestMetric,
} from "@/lib/class-charts";
import { loadTeacherOverview } from "@/lib/links-api";
import { buttonClass } from "@/lib/ui";
import { useLoad } from "@/lib/use-load";

// Full literal class strings (Tailwind scans source). Colours are the status tokens; shape carries the meaning too.
const MARK_COLOR: Record<Outcome, string> = { admitted: "text-done", waitlisted: "text-soon", denied: "text-urgent" };
const SHAPE_KEY = { admitted: "teacher.charts.shapeCircle", waitlisted: "teacher.charts.shapeTriangle", denied: "teacher.charts.shapeCross" } as const;

const metricText = (t: TFunction, metric: TestMetric) => t(metric === "sat" ? "teacher.charts.metricSat" : "teacher.charts.metricAct");

function Marker({ outcome, x, y, size = 5 }: { outcome: Outcome; x: number; y: number; size?: number }) {
  const cls = MARK_COLOR[outcome];
  if (outcome === "admitted") return <circle cx={x} cy={y} r={size} className={cls} fill="currentColor" stroke="white" strokeWidth={1} />;
  if (outcome === "waitlisted") {
    const h = size * 1.15;
    return <polygon points={`${x},${y - h} ${x + h},${y + h * 0.8} ${x - h},${y + h * 0.8}`} className={cls} fill="currentColor" stroke="white" strokeWidth={1} />;
  }
  return (
    <g className={cls} stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
      <line x1={x - size} y1={y - size} x2={x + size} y2={y + size} />
      <line x1={x - size} y1={y + size} x2={x + size} y2={y - size} />
    </g>
  );
}

function Legend({ college }: { college: CollegeOutcomes }) {
  const t = useT();
  const counts = outcomeCounts(college.points);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label={t("teacher.charts.legendAria")}>
      {OUTCOMES.map((o) => (
        <li key={o} className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <Marker outcome={o} x={8} y={8} size={5} />
          </svg>
          <span>
            {statusText(t, OUTCOME_LABEL[o])} <span className="font-semibold">{counts[o]}</span>
            <span className="sr-only"> {t("teacher.charts.shapeMarker", { shape: t(SHAPE_KEY[o]) })}</span>
          </span>
        </li>
      ))}
      <li className="text-zinc-500">{t("teacher.charts.studentsInAll", { n: counts.total })}</li>
    </ul>
  );
}

function Scatter({ college, metric }: { college: CollegeOutcomes; metric: TestMetric }) {
  const t = useT();
  const m = buildChart(college.points, metric);
  const b = CHART_BOX;
  const plotBottom = b.height - b.bottom;
  const plotRight = b.width - b.right;
  const counts = outcomeCounts(college.points);
  const label = t("teacher.charts.scatterAria", { college: college.name, metric: metricText(t, metric), total: counts.total, admitted: counts.admitted, waitlisted: counts.waitlisted, denied: counts.denied });
  return (
    <figure className="space-y-2">
      <svg viewBox={`0 0 ${b.width} ${b.height}`} className="w-full max-w-2xl" role="img" aria-label={label}>
        {m.yTicks.map((t) => (
          <g key={`y${t.value}`}>
            <line x1={b.left} x2={plotRight} y1={t.pos} y2={t.pos} className="stroke-zinc-200" strokeWidth={1} />
            <text x={b.left - 8} y={t.pos} textAnchor="end" dominantBaseline="middle" className="fill-zinc-500 text-[11px]">
              {t.value}
            </text>
          </g>
        ))}
        {m.xTicks.map((t) => (
          <g key={`x${t.value}`}>
            <line x1={t.pos} x2={t.pos} y1={b.top} y2={plotBottom} className="stroke-zinc-200" strokeWidth={1} />
            <text x={t.pos} y={plotBottom + 16} textAnchor="middle" className="fill-zinc-500 text-[11px]">
              {t.value.toFixed(1)}
            </text>
          </g>
        ))}
        <line x1={b.left} x2={plotRight} y1={plotBottom} y2={plotBottom} className="stroke-zinc-400" strokeWidth={1} />
        <line x1={b.left} x2={b.left} y1={b.top} y2={plotBottom} className="stroke-zinc-400" strokeWidth={1} />
        <text x={(b.left + plotRight) / 2} y={b.height - 6} textAnchor="middle" className="fill-zinc-700 text-[12px] font-semibold">
          {t("teacher.charts.axisGpa")}
        </text>
        <text x={14} y={(b.top + plotBottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(b.top + plotBottom) / 2})`} className="fill-zinc-700 text-[12px] font-semibold">
          {metricText(t, metric)}
        </text>
        {m.points.map((p, i) => (
          <Marker key={i} outcome={p.outcome} x={p.x} y={p.y} />
        ))}
      </svg>
      {m.unplotted > 0 && (
        <figcaption className="text-xs text-zinc-500">
          {t(m.unplotted === 1 ? "teacher.charts.unplotted.one" : "teacher.charts.unplotted.other", { n: m.unplotted, metric: metric.toUpperCase() })}
        </figcaption>
      )}
    </figure>
  );
}

function PointTable({ college, metric }: { college: CollegeOutcomes; metric: TestMetric }) {
  const t = useT();
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-blue-700">{t("teacher.charts.showTable")}</summary>
      <table className="mt-2 w-full max-w-md text-left">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 pr-4 font-medium">GPA</th>
            <th className="py-1 pr-4 font-medium">{metric.toUpperCase()}</th>
            <th className="py-1 pr-4 font-medium">{t("teacher.charts.thPlan")}</th>
            <th className="py-1 font-medium">{t("teacher.charts.thOutcome")}</th>
          </tr>
        </thead>
        <tbody>
          {college.points.map((p, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <td className="py-1 pr-4">{p.gpa?.toFixed(2) ?? "-"}</td>
              <td className="py-1 pr-4">{p[metric] ?? "-"}</td>
              <td className="py-1 pr-4">{p.plan ?? "-"}</td>
              <td className="py-1">{statusText(t, OUTCOME_LABEL[p.outcome])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function FloorNotice({ data }: { data: ClassOutcomes }) {
  const t = useT();
  return (
    <div className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">
      <p className="font-semibold text-ink">{t("teacher.charts.floorTitle")}</p>
      <p className="mt-2">
        {t("teacher.charts.floorBody", { min: MIN_STUDENTS, n: data.studentsWithOutcomes })}
      </p>
      <p className="mt-2">
        {t("teacher.charts.resultsPage")}
        <Link href="/teacher/students" className="font-semibold text-blue-700 underline underline-offset-4">
          {t("teacher.charts.seeStudents")}
        </Link>
      </p>
    </div>
  );
}

function OutcomesPanel({ classId }: { classId: string | null }) {
  const t = useT();
  const load = useCallback(() => teacherOutcomes(classId), [classId]);
  const { data, error, retry } = useLoad(load);
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [metricChoice, setMetricChoice] = useState<TestMetric | null>(null);

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

  if (!data.enough) return <FloorNotice data={data} />;
  if (data.colleges.length === 0) {
    return (
      <p className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">
        {data.hiddenColleges > 0
          ? t(data.hiddenColleges === 1 ? "teacher.charts.noCollegeHidden.one" : "teacher.charts.noCollegeHidden.other", { min: MIN_STUDENTS, n: data.hiddenColleges })
          : t("teacher.charts.noCollege", { min: MIN_STUDENTS })}
      </p>
    );
  }

  const college = data.colleges.find((c) => c.collegeId === collegeId) ?? data.colleges[0];
  const metric = metricChoice ?? defaultMetric(college.points);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          {t("teacher.charts.college")}
          <select
            value={college.collegeId}
            onChange={(e) => setCollegeId(e.target.value)}
            className="ml-2 max-w-[18rem] rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            {data.colleges.map((c) => (
              <option key={c.collegeId} value={c.collegeId}>
                {c.name} ({c.points.length})
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label={t("teacher.charts.axisGroup")} className="flex gap-2">
          {(["sat", "act"] as const).map((k) => (
            <button key={k} type="button" aria-pressed={metric === k} className={buttonClass("secondary", "sm", metric === k)} onClick={() => setMetricChoice(k)}>
              {k.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <h2 className="font-display text-xl font-bold">{college.name}</h2>
      <Legend college={college} />
      <Scatter college={college} metric={metric} />
      <PointTable college={college} metric={metric} />
      {data.hiddenColleges > 0 && (
        <p className="text-xs text-zinc-500">
          {t(data.hiddenColleges === 1 ? "teacher.charts.hidden.one" : "teacher.charts.hidden.other", { n: data.hiddenColleges, min: MIN_STUDENTS })}
        </p>
      )}
    </div>
  );
}

function ChartsView() {
  const t = useT();
  const loadClasses = useCallback(async () => (await loadTeacherOverview()).classes, []);
  const classes = useLoad(loadClasses).data ?? [];
  const [classId, setClassId] = useState<string>("");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold">{t("teacher.charts.title")}</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            {t("teacher.charts.intro", { min: MIN_STUDENTS })}
          </p>
        </div>
        <label className="text-sm font-medium">
          {t("teacher.students.heading")}
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="ml-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">{t("teacher.charts.allMine")}</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? ` ${t("teacher.charts.archivedSuffix")}` : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <OutcomesPanel key={classId} classId={classId || null} />
    </div>
  );
}

/** Anonymous scattergrams of the teacher's own students' decisions, per college. */
export function TeacherCharts() {
  return (
    <TeacherGate returnTo="/teacher/charts">
      <ChartsView />
    </TeacherGate>
  );
}
