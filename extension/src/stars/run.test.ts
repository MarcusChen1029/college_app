import assert from "node:assert/strict";
import { test } from "node:test";
import type { StarsPagePlan, StarsRow } from "../../../web/lib/stars-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { planForPage, runStarsYear, type StarsTab } from "./run.ts";

const row = (name: string, o: Partial<StarsRow> = {}): StarsRow => ({
  trackerId: name, name, academicLevel: "Equivalent to U.S. High School 9th Grade", subject: "Mathematics", title: "ALGEBRA 1", level: "Standard",
  length: "Semester", scaleOptions: ["100-Point (100-90=A, 80-89=B...Pass=70)", "100-Point (100-90=A, 80-89=B...Pass=60)"], boxes: [{ grade: "93", credit: null }], ...o,
});
const plan = (rows: StarsRow[]): StarsPagePlan => ({ kind: "intl", endYear: 2024, schoolName: "X", scaleQuestions: [], rows, skipped: [], warnings: [], titleOther: [], creditsSplit: 0 });

/** A fake STARS tab: saves what it is sent unless told to fail. */
function fakeTab(existing: string[], opts: { year?: number; failSave?: boolean; notSaved?: boolean } = {}) {
  const sent: AssistMessage[] = [];
  let pending: string | null = null;
  const tab: StarsTab = {
    async send(msg): Promise<AssistResponse> {
      sent.push(msg);
      if (msg.type === "starsPage") return { type: "starsPage", year: opts.year ?? 2024, kind: "intl", existing: [...existing], pageText: "", errors: [] };
      if (msg.type === "starsFill") {
        if (opts.notSaved) return { type: "starsFill", ok: true, saved: false, blanks: ["Grading Scale"] };
        pending = msg.row.name.toUpperCase();
        return { type: "starsFill", ok: true, saved: true, blanks: [] };
      }
      throw new Error("unexpected");
    },
    async afterSave() {
      if (pending && !opts.failSave) existing.push(pending);
      pending = null;
    },
  };
  return { tab, sent };
}

test("adds every course not on the page, confirming each one after the reload", async () => {
  const { tab, sent } = fakeTab(["ALGEBRA 1"]);
  const r = await runStarsYear(plan([row("Algebra 1"), row("Geometry")]), ["100-Point (100-90=A, 80-89=B...Pass=60)"], "English", tab, () => false, () => {});
  assert.deepEqual(r, { added: ["Geometry"], skippedExisting: 1, stopped: null, left: [] });
  const fill = sent.find((m) => m.type === "starsFill");
  assert.equal(fill?.type === "starsFill" && fill.scale, "100-Point (100-90=A, 80-89=B...Pass=60)");
});

test("stops on the wrong year page without filling", async () => {
  const { tab, sent } = fakeTab([], { year: 2025 });
  const r = await runStarsYear(plan([row("Geometry")]), [], "English", tab, () => false, () => {});
  assert.match(r.stopped ?? "", /2023-24 coursework page/);
  assert.ok(!sent.some((m) => m.type === "starsFill"));
});

test("stops when STARS did not save the course", async () => {
  const { tab } = fakeTab([], { failSave: true });
  const r = await runStarsYear(plan([row("Geometry"), row("Biology")]), [], "English", tab, () => false, () => {});
  assert.deepEqual(r.added, []);
  assert.match(r.stopped ?? "", /did not save Geometry/);
});

test("a course filled but not saved (a box the student must choose) stops the run and says which", async () => {
  const { tab } = fakeTab([], { notSaved: true });
  const r = await runStarsYear(plan([row("Geometry")]), [], "English", tab, () => false, () => {});
  assert.match(r.stopped ?? "", /choose Grading Scale on STARS and press Save Course/);
});

test("Stop between courses", async () => {
  const { tab } = fakeTab([]);
  let n = 0;
  const r = await runStarsYear(plan([row("A"), row("B")]), [], "English", tab, () => n++ > 0, () => {});
  assert.deepEqual(r.added, ["A"]);
  assert.equal(r.stopped, "Stopped.");
});

test("planForPage matches page kind and year, and the school name when two schools share them", () => {
  const a = { ...plan([row("A")]), schoolName: "Kang Chiao Intl Sch Linkou Cmp" };
  const us1 = { ...plan([row("B")]), kind: "us" as const, endYear: 2025, schoolName: "Northern Valley Regional Demarest High School" };
  const us2 = { ...plan([row("C")]), kind: "us" as const, endYear: 2025, schoolName: "Lincoln High School" };
  assert.equal(planForPage([a, us1], { year: 2024, kind: "intl", pageText: "" }), a);
  assert.equal(planForPage([a, us1], { year: 2024, kind: "us", pageText: "" }), null);
  assert.equal(planForPage([us1, us2], { year: 2025, kind: "us", pageText: "Selected School: NORTHERN VALLEY REGIONAL DEMAREST HIGH SCHOOL" }), us1);
  assert.equal(planForPage([us1, us2], { year: 2025, kind: "us", pageText: "no name here" }), null);
});

test("planForPage tolerates other spellings of the school and prefers its code (selCeeb)", () => {
  const kc = { ...plan([row("A")]), schoolName: "Kang Chiao International School Linkou Campus", schoolCode: "694132" };
  const other = { ...plan([row("B")]), schoolName: "Taipei American School", schoolCode: "694100" };
  assert.equal(planForPage([kc, other], { year: 2024, kind: "intl", pageText: "Selected School: KANG CHIAO INTL SCH LINKOU CMP" }), kc);
  assert.equal(planForPage([kc, other], { year: 2024, kind: "intl", pageText: "694100 Selected School: TAS" }), other);
});
