import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "../../web/lib/transcript.ts";
import type { PageResult } from "./commonapp/dom.ts";
import {
  askText,
  blankText,
  buildPlans,
  filledText,
  needsSaveGuidance,
  offersFor,
  offerText,
  OPEN_RELOADS_NOTE,
  runFill,
  startFill,
  STATUS,
  type Driver,
  type FillMode,
  type Plans,
  type Target,
} from "./runner.ts";

type Call = string;

/** A fake Common App: `existing` rows per target, `results` per target (or a function to throw). */
function fakeDriver(opts: { existing?: Partial<Record<Target, string[]>>; fill?: Partial<Record<Target, PageResult | Error>> } = {}) {
  const calls: Call[] = [];
  const driver: Driver = {
    async open(t) {
      calls.push(`open:${t}`);
    },
    async inspect(t) {
      calls.push(`inspect:${t}`);
      return { existing: opts.existing?.[t] ?? [] };
    },
    async fill(t, mode) {
      calls.push(`fill:${t}:${mode}`);
      const r = opts.fill?.[t] ?? { filled: 3, blanks: [] };
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return { driver, calls };
}

const neverStop = () => false;
const askKeep = async (): Promise<FillMode> => "keep";

test("asks only for targets that already have courses", async () => {
  const { driver, calls } = fakeDriver({ existing: { "9": ["Drama"], "10": [] } });
  const asked: Array<[Target, number]> = [];
  const { items, stopped } = await runFill(
    ["9", "10"],
    driver,
    async (t, n) => {
      asked.push([t, n]);
      return "replace";
    },
    neverStop,
  );
  assert.deepEqual(asked, [["9", 1]]);
  assert.equal(stopped, false);
  assert.deepEqual(items.map((i) => i.target), ["9", "10"]);
  assert.ok(calls.includes("fill:9:replace"));
  assert.ok(calls.includes("fill:10:keep"));
});

test("a page is opened, inspected, then filled, in that order, before the next page", async () => {
  const { driver, calls } = fakeDriver();
  await runFill(["9", "current"], driver, askKeep, neverStop);
  assert.deepEqual(calls, ["open:9", "inspect:9", "fill:9:keep", "open:current", "inspect:current", "fill:current:keep"]);
});

test("driver error stops the run", async () => {
  const { driver, calls } = fakeDriver({ fill: { "10": new Error("dialog closed") } });
  const { items, stopped } = await runFill(["9", "10", "11"], driver, askKeep, neverStop);
  assert.equal(stopped, true);
  assert.ok(!calls.some((c) => c.startsWith("fill:11")));
  assert.ok(!calls.some((c) => c.startsWith("open:11")));
  assert.equal(items.length, 2);
  assert.equal(items.at(-1)!.target, "10");
  assert.equal(items.at(-1)!.note, "Stopped: dialog closed");
});

test("an error while opening a page stops the run too", async () => {
  const { driver } = fakeDriver();
  driver.open = async () => {
    throw new Error("Common App did not load");
  };
  const { items, stopped } = await runFill(["9", "10"], driver, askKeep, neverStop);
  assert.equal(stopped, true);
  assert.deepEqual(items.map((i) => [i.target, i.note]), [["9", "Stopped: Common App did not load"]]);
});

test("stoppedReason ends the run and is kept verbatim with what was filled", async () => {
  const blank = { where: "10" as const, course: "Art", field: "grade", reason: "not in list" };
  const { driver, calls } = fakeDriver({ fill: { "10": { filled: 2, blanks: [blank], stoppedReason: "Answer Yes on the Courses & Grades intro first" } } });
  const { items, stopped } = await runFill(["9", "10", "11"], driver, askKeep, neverStop);
  assert.equal(stopped, true);
  assert.ok(!calls.some((c) => c.includes("11")));
  const last = items.at(-1)!;
  assert.equal(last.target, "10");
  assert.equal(last.filled, 2);
  assert.deepEqual(last.blanks, [blank]);
  assert.equal(last.note, "Answer Yes on the Courses & Grades intro first");
});

test("Stop button: shouldStop true after the first target means only one fill", async () => {
  const { driver, calls } = fakeDriver();
  let stop = false;
  const wrapped: Driver = {
    ...driver,
    async fill(t, m) {
      const r = await driver.fill(t, m);
      stop = true;
      return r;
    },
  };
  const { items, stopped } = await runFill(["9", "10", "11"], wrapped, askKeep, () => stop);
  assert.equal(stopped, true);
  assert.equal(calls.filter((c) => c.startsWith("fill:")).length, 1);
  assert.deepEqual(items.map((i) => i.target), ["9"]);
});

// ---- startFill and the offers, on a real plan -------------------------------------------------------------------------

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States", ...o });
const graded = (term: Term["term"], grade: string): Term => ({ term, grade, status: "graded" });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Drama", academicYear: 2023, gradeLevel: 9, credit: 1, terms: [graded("S1", "A")], ...o });

const fakeMake = (d: Driver) => (_plans: Plans) => d;

test("signed out never fills", async () => {
  let ran = false;
  const out = await startFill(
    async () => ({ ok: false, reason: "signed_out" }),
    async () => {
      ran = true;
      return { items: [], stopped: false };
    },
    { targets: ["9"], makeDriver: fakeMake(fakeDriver().driver), ask: askKeep, shouldStop: neverStop },
  );
  assert.equal(ran, false);
  assert.equal(out.ok, false);
  assert.equal(out.status, "Sign in again");
});

test("a failed load never fills, and a thrown load counts as a network failure", async () => {
  let ran = false;
  const run: typeof runFill = async () => {
    ran = true;
    return { items: [], stopped: false };
  };
  const base = { targets: ["9"] as Target[], makeDriver: fakeMake(fakeDriver().driver), ask: askKeep, shouldStop: neverStop };
  const a = await startFill(async () => ({ ok: false, reason: "students_only" }), run, base);
  assert.equal(a.status, STATUS.studentsOnly);
  const b = await startFill(async () => { throw new Error("boom"); }, run, base);
  assert.equal(b.status, STATUS.network);
  assert.equal(ran, false);
});

test("a grade whose courses are all in progress is not offered and is not filled", async () => {
  const inProgress: Term = { term: "S1", grade: "", status: "in_progress" };
  const schools = [school()];
  const courses = [
    course({ id: "a", gradeLevel: 9, academicYear: 2023, terms: [graded("S1", "A")] }),
    course({ id: "b", name: "Art", gradeLevel: 10, academicYear: 2024, terms: [inProgress] }),
  ];
  const plans = buildPlans(schools, courses);
  const targets = offersFor(plans).map((o) => o.target);
  assert.ok(targets.includes("9"));
  assert.ok(!targets.includes("10"), "10th grade has no rows to enter");

  const { driver, calls } = fakeDriver();
  const out = await startFill(async () => ({ ok: true, schools, courses }), runFill, { targets: ["9", "10"], makeDriver: fakeMake(driver), ask: askKeep, shouldStop: neverStop });
  assert.equal(out.ok, true);
  assert.ok(calls.includes("fill:9:keep"));
  assert.ok(!calls.some((c) => c.includes("10")));
});

test("nothing ticked, or nothing offered, does not run", async () => {
  let ran = false;
  const run: typeof runFill = async () => {
    ran = true;
    return { items: [], stopped: false };
  };
  const out = await startFill(async () => ({ ok: true, schools: [school()], courses: [course()] }), run, { targets: [], makeDriver: fakeMake(fakeDriver().driver), ask: askKeep, shouldStop: neverStop });
  assert.equal(out.ok, false);
  assert.equal(out.status, STATUS.nothing);
  assert.equal(ran, false);
});

test("ticked targets run in page order whatever order they were ticked in; the outcome says Done or Stopped", async () => {
  const schools = [school()];
  const courses = [course()];
  const { driver, calls } = fakeDriver();
  const out = await startFill(async () => ({ ok: true, schools, courses }), runFill, { targets: ["current", "9"], makeDriver: fakeMake(driver), ask: askKeep, shouldStop: neverStop });
  assert.equal(out.ok && out.status, STATUS.done);
  assert.deepEqual(calls.filter((c) => c.startsWith("open:")), ["open:9", "open:current"]);

  const { driver: d2 } = fakeDriver({ fill: { "9": new Error("x") } });
  const out2 = await startFill(async () => ({ ok: true, schools, courses }), runFill, { targets: ["9", "current"], makeDriver: fakeMake(d2), ask: askKeep, shouldStop: neverStop });
  assert.equal(out2.ok && out2.status, STATUS.stopped);
  assert.equal(out2.ok && out2.stopped, true);
});

test("offers carry the grade label and course count", () => {
  const plans = buildPlans([school()], [course({ id: "a" }), course({ id: "b", name: "Art" })]);
  const nine = offersFor(plans).find((o) => o.target === "9")!;
  assert.equal(nine.count, 2);
  assert.equal(offerText(nine), "9th grade (2 courses)");
  assert.equal(offerText({ target: "9", label: "9th grade", count: 1 }), "9th grade (1 course)");
});

test("report wording", () => {
  assert.equal(askText("10", 5), "10th grade already has 5 courses on Common App.");
  assert.equal(askText("10", 1), "10th grade already has 1 course on Common App.");
  assert.equal(filledText({ target: "9", filled: 12, blanks: [] }), "Filled 12 courses");
  assert.equal(filledText({ target: "9", filled: 1, blanks: [] }), "Filled 1 course");
  assert.equal(blankText({ where: "9", course: "Drama", field: "grade 1", reason: "grade 'A-' not in Common App's list" }), "Drama: grade 1 left blank: grade 'A-' not in Common App's list");
});

// ---- fix round 1: Stop is honoured at every step ----------------------------------------------------------------------

const fillCalls = (calls: string[]) => calls.filter((c) => c.startsWith("fill:"));

test("stop during open: no inspect, no fill", async () => {
  const { driver, calls } = fakeDriver();
  let stop = false;
  const d: Driver = { ...driver, async open(t) { await driver.open(t); stop = true; } };
  const { items, stopped } = await runFill(["9", "10"], d, askKeep, () => stop);
  assert.equal(stopped, true);
  assert.deepEqual(calls, ["open:9"]);
  assert.deepEqual(items, []);
});

test("stop during inspect: zero fill calls", async () => {
  const { driver, calls } = fakeDriver({ existing: { "9": ["Drama"] } });
  let stop = false;
  let asked = false;
  const d: Driver = { ...driver, async inspect(t) { const r = await driver.inspect(t); stop = true; return r; } };
  const { stopped } = await runFill(["9", "10"], d, async () => { asked = true; return "keep"; }, () => stop);
  assert.equal(stopped, true);
  assert.equal(fillCalls(calls).length, 0);
  assert.equal(asked, false);
});

test("stop while the Replace/Keep question is pending: zero fill calls", async () => {
  const { driver, calls } = fakeDriver({ existing: { "9": ["Drama"] } });
  let stop = false;
  let release: (m: FillMode) => void = () => {};
  const ask = () => new Promise<FillMode>((resolve) => (release = resolve));
  const run = runFill(["9", "10"], driver, ask, () => stop);
  await new Promise((r) => setTimeout(r, 5));
  stop = true; // the panel's Stop sets the flag, then dismisses the prompt
  release("keep");
  const { items, stopped } = await run;
  assert.equal(stopped, true);
  assert.equal(fillCalls(calls).length, 0);
  assert.deepEqual(items, []);
});

// ---- fix round 1: the "nothing was saved" guidance ---------------------------------------------------------------------

test("save guidance only for a Courses & Grades item that stopped on a page stoppedReason", async () => {
  // page stoppedReason on a grade: guidance
  const a = fakeDriver({ fill: { "10": { filled: 2, blanks: [], stoppedReason: "Common App did not close the dialog" } } });
  const ra = await runFill(["9", "10"], a.driver, askKeep, neverStop);
  assert.equal(needsSaveGuidance(ra.items[0]!), false, "grade 9 was filled and saved before the stop");
  assert.equal(needsSaveGuidance(ra.items[1]!), true);

  // page stoppedReason on Current Year: no dialog, no guidance
  const b = fakeDriver({ fill: { current: { filled: 0, blanks: [], stoppedReason: "Stopped." } } });
  const rb = await runFill(["current"], b.driver, askKeep, neverStop);
  assert.equal(needsSaveGuidance(rb.items[0]!), false);

  // navigation / open error: no dialog opened
  const c = fakeDriver();
  c.driver.open = async () => { throw new Error("Common App did not finish loading"); };
  const rc = await runFill(["9"], c.driver, askKeep, neverStop);
  assert.equal(needsSaveGuidance(rc.items[0]!), false);

  // a thrown error during fill is the driver's, not a page stop
  const d = fakeDriver({ fill: { "9": new Error("The Common App page stopped responding") } });
  const rd = await runFill(["9"], d.driver, askKeep, neverStop);
  assert.equal(needsSaveGuidance(rd.items[0]!), false);

  // Stop between grades: a stopped run whose last item filled normally
  let stop = false;
  const e = fakeDriver();
  const wrapped: Driver = { ...e.driver, async fill(t, m) { const r = await e.driver.fill(t, m); stop = true; return r; } };
  const re = await runFill(["9", "10"], wrapped, askKeep, () => stop);
  assert.equal(re.stopped, true);
  assert.equal(needsSaveGuidance(re.items.at(-1)!), false);
});

// ---- final review fixes -------------------------------------------------------------------------------------------------

test("a page's notes reach the report item as changes, on a finished page and on a stopped one", async () => {
  const note = "Changed your answer to 'courses to report' to Yes for 12th grade.";
  const a = fakeDriver({ fill: { "12": { filled: 1, blanks: [], notes: [note] } } });
  const ra = await runFill(["12"], a.driver, askKeep, neverStop);
  assert.deepEqual(ra.items, [{ target: "12", filled: 1, blanks: [], changes: [note] }]);

  const b = fakeDriver({ fill: { "12": { filled: 0, blanks: [], notes: [note], stoppedReason: "Stopped." } } });
  const rb = await runFill(["12"], b.driver, askKeep, neverStop);
  assert.deepEqual(rb.items[0]!.changes, [note]);
  assert.equal(rb.items[0]!.note, "Stopped.");

  // No notes: no changes key at all.
  const c = fakeDriver();
  const rc = await runFill(["9"], c.driver, askKeep, neverStop);
  assert.equal("changes" in rc.items[0]!, false);
});

test("the reload warning for the Open links says what is lost", () => {
  assert.equal(OPEN_RELOADS_NOTE, "Opening reloads the page: anything not yet saved in an open popup is discarded.");
});
