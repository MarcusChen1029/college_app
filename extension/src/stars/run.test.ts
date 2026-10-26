import assert from "node:assert/strict";
import { test } from "node:test";
import type { StarsPagePlan, StarsRow } from "../../../web/lib/stars-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { runStarsYear, type StarsTab } from "./run.ts";

const row = (name: string, o: Partial<StarsRow> = {}): StarsRow => ({
  trackerId: name, name, academicLevel: "Equivalent to U.S. High School 9th Grade", subject: "Mathematics", title: "ALGEBRA 1", level: "Standard",
  length: "Semester", scaleOptions: ["100-Point (100-90=A, 80-89=B...Pass=70)", "100-Point (100-90=A, 80-89=B...Pass=60)"], boxes: [{ grade: "93", credit: null }], ...o,
});
const plan = (rows: StarsRow[]): StarsPagePlan => ({ endYear: 2024, schoolName: "X", scaleQuestions: [], rows, skipped: [], warnings: [] });

/** A fake STARS tab: saves what it is sent unless told to fail. */
function fakeTab(existing: string[], opts: { year?: number; failSave?: boolean; notSaved?: boolean } = {}) {
  const sent: AssistMessage[] = [];
  let pending: string | null = null;
  const tab: StarsTab = {
    async send(msg): Promise<AssistResponse> {
      sent.push(msg);
      if (msg.type === "starsPage") return { type: "starsPage", year: opts.year ?? 2024, existing: [...existing] };
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
  const r = await runStarsYear(plan([row("Algebra 1"), row("Geometry")]), ["100-Point (100-90=A, 80-89=B...Pass=60)"], tab, () => false, () => {});
  assert.deepEqual(r, { added: ["Geometry"], skippedExisting: 1, stopped: null });
  const fill = sent.find((m) => m.type === "starsFill");
  assert.equal(fill?.type === "starsFill" && fill.scale, "100-Point (100-90=A, 80-89=B...Pass=60)");
});

test("stops on the wrong year page without filling", async () => {
  const { tab, sent } = fakeTab([], { year: 2025 });
  const r = await runStarsYear(plan([row("Geometry")]), [], tab, () => false, () => {});
  assert.match(r.stopped ?? "", /2023-24 coursework page/);
  assert.ok(!sent.some((m) => m.type === "starsFill"));
});

test("stops when STARS did not save the course", async () => {
  const { tab } = fakeTab([], { failSave: true });
  const r = await runStarsYear(plan([row("Geometry"), row("Biology")]), [], tab, () => false, () => {});
  assert.deepEqual(r.added, []);
  assert.match(r.stopped ?? "", /did not save Geometry/);
});

test("a course filled but not saved (a box the student must choose) stops the run and says which", async () => {
  const { tab } = fakeTab([], { notSaved: true });
  const r = await runStarsYear(plan([row("Geometry")]), [], tab, () => false, () => {});
  assert.match(r.stopped ?? "", /choose Grading Scale on STARS and press Save Course/);
});

test("Stop between courses", async () => {
  const { tab } = fakeTab([]);
  let n = 0;
  const r = await runStarsYear(plan([row("A"), row("B")]), [], tab, () => n++ > 0, () => {});
  assert.deepEqual(r.added, ["A"]);
  assert.equal(r.stopped, "Stopped.");
});
