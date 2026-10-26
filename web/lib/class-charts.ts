// Class charts (roadmap #11): anonymous scattergrams of how a teacher's own linked students did at each college.
// Data comes from the teacher_outcomes RPC (migration 0033), which already applies the privacy floor; the parser
// below applies it again so a bad or older payload can never draw a chart for fewer than MIN_STUDENTS students.
// Pure code only (no React, no Supabase) so it can be unit-tested. Spec: docs/superpowers/specs/2026-10-27-class-charts-design.md

import type { Tone } from "./status.ts";

/** Privacy floor. Mirrors `min_students` in supabase/migrations/0033_class_outcomes.sql; keep the two in step. */
export const MIN_STUDENTS = 5;

export const OUTCOMES = ["admitted", "waitlisted", "denied"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export const OUTCOME_LABEL: Record<Outcome, string> = { admitted: "Admitted", waitlisted: "Waitlisted", denied: "Denied" };
export const OUTCOME_TONE: Record<Outcome, Tone> = { admitted: "done", waitlisted: "soon", denied: "urgent" };

export type OutcomePoint = { gpa: number | null; sat: number | null; act: number | null; outcome: Outcome; plan: string | null };
export type CollegeOutcomes = { collegeId: string; slug: string; name: string; points: OutcomePoint[] };
export type ClassOutcomes = {
  minStudents: number;
  studentsWithOutcomes: number;
  enough: boolean;
  hiddenColleges: number;
  colleges: CollegeOutcomes[];
};

export const EMPTY_OUTCOMES: ClassOutcomes = { minStudents: MIN_STUDENTS, studentsWithOutcomes: 0, enough: false, hiddenColleges: 0, colleges: [] };

/** True when a group of `n` distinct students is large enough to show. */
export const passesFloor = (n: number): boolean => Number.isFinite(n) && n >= MIN_STUDENTS;

const num = (v: unknown): number | null => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const isOutcome = (v: unknown): v is Outcome => typeof v === "string" && (OUTCOMES as readonly string[]).includes(v);

/** GPA rounded to the nearest 0.05, as the RPC does (kept here so a point is never shown more precisely). */
export const roundGpa = (g: number): number => Math.round(g * 20) / 20;

function parsePoint(v: unknown): OutcomePoint | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  if (!isOutcome(r.outcome)) return null;
  const gpa = num(r.gpa);
  return { gpa: gpa == null ? null : roundGpa(gpa), sat: num(r.sat), act: num(r.act), outcome: r.outcome, plan: str(r.plan) };
}

/**
 * Reads the teacher_outcomes payload. Only the documented fields are kept, and the floor is enforced again:
 * below MIN_STUDENTS students overall nothing is returned, and a college with fewer than MIN_STUDENTS points is dropped.
 */
export function parseClassOutcomes(raw: unknown): ClassOutcomes {
  if (!raw || typeof raw !== "object") return EMPTY_OUTCOMES;
  const r = raw as Record<string, unknown>;
  const students = num(r.students_with_outcomes) ?? 0;
  const enough = r.enough === true && passesFloor(students);
  const list = Array.isArray(r.colleges) ? r.colleges : [];
  const colleges: CollegeOutcomes[] = [];
  let dropped = 0;
  if (enough) {
    for (const c of list) {
      if (!c || typeof c !== "object") continue;
      const o = c as Record<string, unknown>;
      const id = str(o.college_id);
      const points = (Array.isArray(o.points) ? o.points : []).map(parsePoint).filter((p): p is OutcomePoint => p !== null);
      if (!id || !passesFloor(points.length)) {
        dropped++;
        continue;
      }
      colleges.push({ collegeId: id, slug: str(o.slug) ?? "", name: str(o.name) ?? "Unnamed college", points: sortPoints(points) });
    }
  }
  return {
    minStudents: MIN_STUDENTS,
    studentsWithOutcomes: students,
    enough,
    hiddenColleges: enough ? (num(r.hidden_colleges) ?? 0) + dropped : 0,
    colleges,
  };
}

const cmpNullLast = (a: number | null, b: number | null) => (a == null ? (b == null ? 0 : 1) : b == null ? -1 : a - b);

/** Value order (never input order), so the list position says nothing about who a point is. */
export function sortPoints(points: readonly OutcomePoint[]): OutcomePoint[] {
  return [...points].sort(
    (a, b) =>
      cmpNullLast(a.gpa, b.gpa) ||
      cmpNullLast(a.sat, b.sat) ||
      cmpNullLast(a.act, b.act) ||
      OUTCOMES.indexOf(a.outcome) - OUTCOMES.indexOf(b.outcome) ||
      (a.plan ?? "").localeCompare(b.plan ?? ""),
  );
}

export type OutcomeCounts = Record<Outcome, number> & { total: number };

export function outcomeCounts(points: readonly OutcomePoint[]): OutcomeCounts {
  const c: OutcomeCounts = { admitted: 0, waitlisted: 0, denied: 0, total: 0 };
  for (const p of points) {
    c[p.outcome]++;
    c.total++;
  }
  return c;
}

// ───────── chart geometry ─────────

export type TestMetric = "sat" | "act";
export const METRIC_LABEL: Record<TestMetric, string> = { sat: "SAT total", act: "ACT composite" };

const SCALE = {
  gpa: { min: 0, max: 4, step: 0.5 },
  sat: { min: 400, max: 1600, step: 100 },
  act: { min: 1, max: 36, step: 2 },
} as const;

/** SAT when at least as many points have an SAT as an ACT; otherwise ACT. */
export function defaultMetric(points: readonly OutcomePoint[]): TestMetric {
  const sat = points.filter((p) => p.sat != null).length;
  const act = points.filter((p) => p.act != null).length;
  return act > sat ? "act" : "sat";
}

/** An axis range around the values, snapped outward to the scale's step and clamped to the test's real range. */
export function axisDomain(values: readonly number[], axis: keyof typeof SCALE): [number, number] {
  const s = SCALE[axis];
  if (values.length === 0) return [s.min, s.max];
  let lo = Math.floor(Math.min(...values) / s.step) * s.step;
  let hi = Math.ceil(Math.max(...values) / s.step) * s.step;
  if (hi - lo < 2 * s.step) {
    lo -= s.step;
    hi += s.step;
  }
  lo = Math.max(s.min, lo);
  hi = Math.min(s.max, hi);
  if (lo >= hi) return [s.min, s.max];
  return [round6(lo), round6(hi)];
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;

/** Tick values from lo to hi (inclusive), every `step`, without floating-point drift. */
export function ticks(lo: number, hi: number, step: number): number[] {
  if (!(step > 0) || hi < lo) return [];
  const out: number[] = [];
  const n = Math.floor((hi - lo) / step + 1e-9);
  for (let i = 0; i <= n; i++) out.push(round6(lo + i * step));
  return out;
}

/** Tick step for an axis: the scale's step, doubled until there are at most `max` ticks. */
export function tickStep(lo: number, hi: number, axis: keyof typeof SCALE, max = 9): number {
  let step: number = SCALE[axis].step;
  while ((hi - lo) / step + 1 > max) step *= 2;
  return step;
}

/** Linear map from [d0, d1] to [r0, r1]. */
export function scaleLinear(v: number, [d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): number {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export type ChartBox = { width: number; height: number; left: number; right: number; top: number; bottom: number };
export const CHART_BOX: ChartBox = { width: 560, height: 360, left: 56, right: 16, top: 16, bottom: 44 };

export type PlottedPoint = { x: number; y: number; outcome: Outcome; gpa: number; score: number };
export type ChartModel = {
  metric: TestMetric;
  xDomain: [number, number];
  yDomain: [number, number];
  xTicks: { value: number; pos: number }[];
  yTicks: { value: number; pos: number }[];
  points: PlottedPoint[];
  /** Points with an outcome but no GPA or no score for this metric: counted, not drawn. */
  unplotted: number;
};

/**
 * Lays out a scatter: x = GPA, y = the chosen test. Identical (GPA, score) pairs are fanned out a few pixels
 * so stacked markers stay visible; the offset depends only on values, never on who the student is.
 */
export function buildChart(points: readonly OutcomePoint[], metric: TestMetric, box: ChartBox = CHART_BOX): ChartModel {
  const usable = sortPoints(points).filter((p) => p.gpa != null && p[metric] != null) as (OutcomePoint & { gpa: number })[];
  const xDomain = axisDomain(usable.map((p) => p.gpa), "gpa");
  const yDomain = axisDomain(usable.map((p) => p[metric] as number), metric);
  const xr: [number, number] = [box.left, box.width - box.right];
  const yr: [number, number] = [box.height - box.bottom, box.top];
  const seen = new Map<string, number>();
  const plotted = usable.map((p) => {
    const score = p[metric] as number;
    const key = `${p.gpa}|${score}`;
    const k = seen.get(key) ?? 0;
    seen.set(key, k + 1);
    // 0, +7, -7, +14, -14 ... px
    const dx = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * 7;
    return { x: round6(scaleLinear(p.gpa, xDomain, xr) + dx), y: round6(scaleLinear(score, yDomain, yr)), outcome: p.outcome, gpa: p.gpa, score };
  });
  const xStep = tickStep(xDomain[0], xDomain[1], "gpa");
  const yStep = tickStep(yDomain[0], yDomain[1], metric);
  return {
    metric,
    xDomain,
    yDomain,
    xTicks: ticks(xDomain[0], xDomain[1], xStep).map((value) => ({ value, pos: round6(scaleLinear(value, xDomain, xr)) })),
    yTicks: ticks(yDomain[0], yDomain[1], yStep).map((value) => ({ value, pos: round6(scaleLinear(value, yDomain, yr)) })),
    points: plotted,
    unplotted: points.length - usable.length,
  };
}

/** Plain wording for the errors teacher_outcomes can return. */
export function chartsErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("teachers only")) return "This page is for teacher and counselor accounts.";
  if (m.includes("class not found")) return "That class wasn't found. Pick another class.";
  if (m.includes("could not find the function") || m.includes("schema cache")) return "Class charts aren't switched on yet. Try again later.";
  return message || "Something went wrong. Please try again.";
}
