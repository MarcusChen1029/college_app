"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { btn } from "@/components/TeacherClassCard";
import { TeacherGate } from "@/components/TeacherGate";
import { teacherOutcomes } from "@/lib/charts-api";
import {
  buildChart,
  CHART_BOX,
  defaultMetric,
  METRIC_LABEL,
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
const SHAPE_NAME: Record<Outcome, string> = { admitted: "circle", waitlisted: "triangle", denied: "cross" };

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
  const counts = outcomeCounts(college.points);
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm" aria-label="Legend and counts">
      {OUTCOMES.map((o) => (
        <li key={o} className="flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <Marker outcome={o} x={8} y={8} size={5} />
          </svg>
          <span>
            {OUTCOME_LABEL[o]} <span className="font-semibold">{counts[o]}</span>
            <span className="sr-only"> ({SHAPE_NAME[o]} marker)</span>
          </span>
        </li>
      ))}
      <li className="text-zinc-500">{counts.total} students in all</li>
    </ul>
  );
}

function Scatter({ college, metric }: { college: CollegeOutcomes; metric: TestMetric }) {
  const m = buildChart(college.points, metric);
  const b = CHART_BOX;
  const plotBottom = b.height - b.bottom;
  const plotRight = b.width - b.right;
  const counts = outcomeCounts(college.points);
  const label = `${college.name}: ${METRIC_LABEL[metric]} against GPA for ${counts.total} students. ${counts.admitted} admitted, ${counts.waitlisted} waitlisted, ${counts.denied} denied.`;
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
          GPA (unweighted, rounded to 0.05)
        </text>
        <text x={14} y={(b.top + plotBottom) / 2} textAnchor="middle" transform={`rotate(-90 14 ${(b.top + plotBottom) / 2})`} className="fill-zinc-700 text-[12px] font-semibold">
          {METRIC_LABEL[metric]}
        </text>
        {m.points.map((p, i) => (
          <Marker key={i} outcome={p.outcome} x={p.x} y={p.y} />
        ))}
      </svg>
      {m.unplotted > 0 && (
        <figcaption className="text-xs text-zinc-500">
          {m.unplotted} {m.unplotted === 1 ? "student has" : "students have"} no GPA or {metric.toUpperCase()} on file, so {m.unplotted === 1 ? "is" : "are"} counted above but not
          drawn.
        </figcaption>
      )}
    </figure>
  );
}

function PointTable({ college, metric }: { college: CollegeOutcomes; metric: TestMetric }) {
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium text-blue-700">Show as a table</summary>
      <table className="mt-2 w-full max-w-md text-left">
        <thead className="text-zinc-500">
          <tr>
            <th className="py-1 pr-4 font-medium">GPA</th>
            <th className="py-1 pr-4 font-medium">{metric.toUpperCase()}</th>
            <th className="py-1 pr-4 font-medium">Plan</th>
            <th className="py-1 font-medium">Outcome</th>
          </tr>
        </thead>
        <tbody>
          {college.points.map((p, i) => (
            <tr key={i} className="border-t border-zinc-100">
              <td className="py-1 pr-4">{p.gpa?.toFixed(2) ?? "-"}</td>
              <td className="py-1 pr-4">{p[metric] ?? "-"}</td>
              <td className="py-1 pr-4">{p.plan ?? "-"}</td>
              <td className="py-1">{OUTCOME_LABEL[p.outcome]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function FloorNotice({ data }: { data: ClassOutcomes }) {
  return (
    <div className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
      <p className="font-semibold text-ink">Not enough results to chart yet.</p>
      <p className="mt-2">
        To keep students anonymous, charts appear once at least {MIN_STUDENTS} students here have recorded a decision (admitted, waitlisted or denied), and a
        college appears only when at least {MIN_STUDENTS} of them applied there. So far: {data.studentsWithOutcomes} of {MIN_STUDENTS}.
      </p>
      <p className="mt-2">
        Students record decisions on their Results page.{" "}
        <Link href="/teacher/students" className="font-semibold text-blue-700 underline underline-offset-4">
          See your students
        </Link>
      </p>
    </div>
  );
}

function OutcomesPanel({ classId }: { classId: string | null }) {
  const load = useCallback(() => teacherOutcomes(classId), [classId]);
  const { data, error, retry } = useLoad(load);
  const [collegeId, setCollegeId] = useState<string | null>(null);
  const [metricChoice, setMetricChoice] = useState<TestMetric | null>(null);

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

  if (!data.enough) return <FloorNotice data={data} />;
  if (data.colleges.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-600">
        No college has decisions from {MIN_STUDENTS} or more of these students yet
        {data.hiddenColleges > 0 ? ` (${data.hiddenColleges} ${data.hiddenColleges === 1 ? "college is" : "colleges are"} below that and hidden)` : ""}.
      </p>
    );
  }

  const college = data.colleges.find((c) => c.collegeId === collegeId) ?? data.colleges[0];
  const metric = metricChoice ?? defaultMetric(college.points);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm font-medium">
          College
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
        <div role="group" aria-label="Test score axis" className="flex gap-2">
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
          {data.hiddenColleges} more {data.hiddenColleges === 1 ? "college has" : "colleges have"} decisions from fewer than {MIN_STUDENTS} of these students and{" "}
          {data.hiddenColleges === 1 ? "is" : "are"} not shown.
        </p>
      )}
    </div>
  );
}

function ChartsView() {
  const loadClasses = useCallback(async () => (await loadTeacherOverview()).classes, []);
  const classes = useLoad(loadClasses).data ?? [];
  const [classId, setClassId] = useState<string>("");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-3xl font-bold">Class charts</h1>
          <p className="max-w-2xl text-sm text-zinc-600">
            How your students did at each college: GPA against test score, by decision. Points are anonymous, with no names and no order, and only groups of{" "}
            {MIN_STUDENTS} or more students are shown.
          </p>
        </div>
        <label className="text-sm font-medium">
          Students
          <select value={classId} onChange={(e) => setClassId(e.target.value)} className="ml-2 rounded-md border border-zinc-300 px-3 py-2 text-sm">
            <option value="">All my students</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (archived)" : ""}
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
