import assert from "node:assert/strict";
import { test } from "node:test";
import {
  axisDomain,
  buildChart,
  CHART_BOX,
  chartsErrorMessage,
  defaultMetric,
  MIN_STUDENTS,
  outcomeCounts,
  parseClassOutcomes,
  passesFloor,
  roundGpa,
  scaleLinear,
  sortPoints,
  ticks,
  type OutcomePoint,
} from "./class-charts.ts";

const pt = (gpa: number | null, sat: number | null, outcome: OutcomePoint["outcome"], act: number | null = null): OutcomePoint => ({
  gpa,
  sat,
  act,
  outcome,
  plan: null,
});

const rawCollege = (id: string, n: number, extra: Record<string, unknown> = {}) => ({
  college_id: id,
  slug: id,
  name: `College ${id}`,
  points: Array.from({ length: n }, (_, i) => ({ gpa: 3 + i / 10, sat: 1200 + i * 10, act: null, outcome: "admitted", plan: "RD", ...extra })),
});

test("floor constant is 5 and passesFloor checks it", () => {
  assert.equal(MIN_STUDENTS, 5);
  assert.equal(passesFloor(4), false);
  assert.equal(passesFloor(5), true);
  assert.equal(passesFloor(Number.NaN), false);
});

test("parseClassOutcomes: below the overall floor returns no colleges, even if the payload has some", () => {
  const r = parseClassOutcomes({ enough: true, students_with_outcomes: 4, hidden_colleges: 2, colleges: [rawCollege("x", 5)] });
  assert.equal(r.enough, false);
  assert.deepEqual(r.colleges, []);
  assert.equal(r.hiddenColleges, 0);
  assert.equal(r.studentsWithOutcomes, 4);
});

test("parseClassOutcomes: enough=false from the server is respected", () => {
  const r = parseClassOutcomes({ enough: false, students_with_outcomes: 9, colleges: [rawCollege("x", 6)] });
  assert.equal(r.enough, false);
  assert.deepEqual(r.colleges, []);
});

test("parseClassOutcomes: a college under the per-college floor is dropped and counted as hidden", () => {
  const r = parseClassOutcomes({ enough: true, students_with_outcomes: 7, hidden_colleges: 1, colleges: [rawCollege("x", 5), rawCollege("y", 4)] });
  assert.equal(r.enough, true);
  assert.deepEqual(
    r.colleges.map((c) => c.collegeId),
    ["x"],
  );
  assert.equal(r.hiddenColleges, 2);
});

test("parseClassOutcomes: keeps only documented point fields, drops bad outcomes, rounds GPA", () => {
  const raw = rawCollege("x", 6, { student_id: "leak", name: "Ann", email: "a@b.c" });
  raw.points[0] = { ...raw.points[0], gpa: 3.87 } as (typeof raw.points)[number];
  const r = parseClassOutcomes({ enough: true, students_with_outcomes: 6, colleges: [raw] });
  const p = r.colleges[0].points;
  assert.equal(p.length, 6);
  for (const x of p) assert.deepEqual(Object.keys(x).sort(), ["act", "gpa", "outcome", "plan", "sat"]);
  assert.ok(p.some((x) => x.gpa === 3.85));

  const bad = rawCollege("x", 5);
  bad.points[0] = { ...bad.points[0], outcome: "deferred" };
  assert.deepEqual(parseClassOutcomes({ enough: true, students_with_outcomes: 5, colleges: [bad] }).colleges, []);
});

test("parseClassOutcomes: garbage input is empty", () => {
  assert.equal(parseClassOutcomes(null).enough, false);
  assert.deepEqual(parseClassOutcomes("x").colleges, []);
  assert.deepEqual(parseClassOutcomes({ enough: true, students_with_outcomes: "5", colleges: "no" }).colleges, []);
});

test("roundGpa rounds to 0.05", () => {
  assert.equal(roundGpa(3.87), 3.85);
  assert.equal(roundGpa(3.88), 3.9);
  assert.equal(roundGpa(4), 4);
});

test("sortPoints orders by value, not input order", () => {
  const a = [pt(3.9, 1500, "admitted"), pt(null, 1300, "denied"), pt(3.2, 1100, "waitlisted"), pt(3.2, 1000, "denied")];
  assert.deepEqual(
    sortPoints(a).map((p) => [p.gpa, p.sat]),
    [
      [3.2, 1000],
      [3.2, 1100],
      [3.9, 1500],
      [null, 1300],
    ],
  );
  assert.deepEqual(sortPoints(a), sortPoints([...a].reverse()));
});

test("outcomeCounts", () => {
  assert.deepEqual(outcomeCounts([pt(3, 1, "admitted"), pt(3, 1, "admitted"), pt(3, 1, "denied")]), { admitted: 2, waitlisted: 0, denied: 1, total: 3 });
});

test("defaultMetric prefers SAT unless ACT points outnumber it", () => {
  assert.equal(defaultMetric([pt(3, 1200, "admitted"), pt(3, null, "admitted", 30)]), "sat");
  assert.equal(defaultMetric([pt(3, null, "admitted", 30), pt(3, null, "admitted", 28)]), "act");
  assert.equal(defaultMetric([]), "sat");
});

test("axisDomain snaps outward, widens tiny ranges, clamps to the scale", () => {
  assert.deepEqual(axisDomain([3.2, 3.9], "gpa"), [3, 4]);
  assert.deepEqual(axisDomain([3.6], "gpa"), [3, 4]);
  assert.deepEqual(axisDomain([1180, 1420], "sat"), [1100, 1500]);
  assert.deepEqual(axisDomain([1590], "sat"), [1400, 1600]);
  assert.deepEqual(axisDomain([], "act"), [1, 36]);
});

test("ticks are exact and inclusive", () => {
  assert.deepEqual(ticks(3, 4, 0.5), [3, 3.5, 4]);
  assert.deepEqual(ticks(0.1, 0.3, 0.1), [0.1, 0.2, 0.3]);
  assert.deepEqual(ticks(1, 0, 1), []);
});

test("scaleLinear maps and inverts the y range", () => {
  assert.equal(scaleLinear(5, [0, 10], [0, 100]), 50);
  assert.equal(scaleLinear(0, [0, 10], [300, 20]), 300);
  assert.equal(scaleLinear(3, [3, 3], [0, 100]), 50);
});

test("buildChart: places points inside the plot, counts unplotted, fans out duplicates", () => {
  const pts = [pt(3.5, 1300, "admitted"), pt(3.5, 1300, "denied"), pt(3.5, 1300, "waitlisted"), pt(null, 1200, "admitted"), pt(3.9, null, "denied")];
  const m = buildChart(pts, "sat");
  assert.equal(m.points.length, 3);
  assert.equal(m.unplotted, 2);
  const xs = m.points.map((p) => p.x);
  assert.equal(new Set(xs).size, 3);
  for (const p of m.points) {
    assert.ok(p.y >= CHART_BOX.top && p.y <= CHART_BOX.height - CHART_BOX.bottom);
  }
  assert.ok(m.xTicks.length >= 2 && m.yTicks.length >= 2);
  assert.equal(m.xTicks[0].pos, CHART_BOX.left);
  assert.equal(m.yTicks[0].pos, CHART_BOX.height - CHART_BOX.bottom);
});

test("buildChart with ACT uses the ACT scale", () => {
  const m = buildChart([pt(3.4, null, "admitted", 30), pt(3.8, null, "denied", 34)], "act");
  assert.equal(m.points.length, 2);
  assert.deepEqual(m.yDomain, [30, 34]);
});

test("chartsErrorMessage", () => {
  assert.match(chartsErrorMessage("teachers only"), /teacher and counselor/);
  assert.match(chartsErrorMessage("class not found"), /class/);
  assert.match(chartsErrorMessage("Could not find the function public.teacher_outcomes"), /switched on/);
  assert.equal(chartsErrorMessage("boom"), "boom");
});
