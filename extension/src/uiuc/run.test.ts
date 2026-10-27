import assert from "node:assert/strict";
import { test } from "node:test";
import { UIUC_PAGE_PATH, type UiucGradePlan, type UiucRow } from "../../../web/lib/uiuc-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import type { UiucArea, UiucExistingRow, UiucPageKind } from "./fill.ts";
import { groupLeft } from "./panel.ts";
import { runUiucPlans, uiucAreaFor, UIUC_EDITOR_DIRTY, UIUC_LOCKED, type UiucTab } from "./run.ts";

const TRACKER_NAME = "Kang Chiao International School - Linkou Campus";
const area = (rows: UiucExistingRow[] = [], name = "Kang Chiao Intl Sch Linkou Cmp"): UiucArea => ({ name, text: `${name} New Taipei City Taiwan`, gradingType: "3", rows });

test("uiucAreaFor: myIllini's abbreviated name is the tracker's school; another school is not", () => {
  assert.equal(uiucAreaFor({ schoolName: TRACKER_NAME }, [area()]), 0);
  assert.equal(uiucAreaFor({ schoolName: TRACKER_NAME }, [area([], "Taipei American School"), area()]), 1);
  assert.match(uiucAreaFor({ schoolName: "Lincoln High School" }, [area()]) as string, /matches none/);
  assert.match(uiucAreaFor({ schoolName: TRACKER_NAME }, []) as string, /no school/);
});

test("groupLeft puts one course's terms on one line when the reason is the same", () => {
  assert.deepEqual(groupLeft([{ course: "Web Design (1st Semester)", why: "x" }, { course: "Web Design (2nd Semester)", why: "x" }, { course: "Drama (1st Semester)", why: "y" }]), [
    { course: "Web Design (1st Semester, 2nd Semester)", why: "x" },
    { course: "Drama (1st Semester)", why: "y" },
  ]);
});

const row = (name: string, year: string, term = ".2.1"): UiucRow => ({ trackerId: name, name, year, term, termLabel: term === ".2.1" ? "1st Semester" : "2nd Semester", subject: "M", type: "None", grade: "90", repeat: false, blocked: null });
const plan = (gradeLevel: number, rows: UiucRow[]): UiucGradePlan => ({
  schoolName: TRACKER_NAME, gradeLevel, year: `${2014 + gradeLevel} - ${2015 + gradeLevel}`, page: gradeLevel === 12 ? "upper" : "lower",
  path: UIUC_PAGE_PATH[gradeLevel === 12 ? "upper" : "lower"], rows, skipped: [], warnings: [],
});

/** A fake myIllini: two courses pages holding saved rows; Add Course is the fill message, Save Progress reloads. */
function fakeIllini(opts: { locked?: boolean; dropOnSave?: string; signedOut?: boolean; noReload?: boolean; refuse?: string; leavePrompt?: boolean } = {}) {
  const saved: Record<"lower" | "upper", UiucExistingRow[]> = { lower: [], upper: [] };
  let at: UiucPageKind = "other";
  let editorDirty = false;
  const visits: string[] = [];
  const sent: string[] = [];
  let reloadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;
  const tab: UiucTab = {
    async send(msg: AssistMessage): Promise<AssistResponse> {
      sent.push(msg.type);
      const page = at === "lower" || at === "upper" ? at : null;
      switch (msg.type) {
        case "uiucPage":
          return { type: "uiucPage", page: { kind: at, locked: !!opts.locked, areas: page ? [area([...saved[page]])] : [] } };
        case "uiucFill": {
          const added = [];
          let skippedExisting = 0;
          const problems: string[] = [];
          for (const r of msg.rows) {
            if (saved[page!].some((x) => x.name === r.name && x.year === r.year && x.term === r.term)) skippedExisting++;
            else if (r.name === opts.refuse) {
              problems.push(`${r.name} (${r.termLabel}): not added. UIUC said "Error"`);
              editorDirty = true;
            } else {
              saved[page!].push({ name: r.name, grade: r.grade!, year: r.year, term: r.term, text: "" });
              added.push({ name: r.name, year: r.year, term: r.term, label: `${r.name} (${r.termLabel})` });
              editorDirty = false;
            }
          }
          return { type: "uiucFill", ok: true, result: { added, skippedExisting, left: [], problems, editorDirty } };
        }
        case "uiucSave":
          assert.ok(reloadWaiter, "the reload wait is armed before Save Progress is pressed");
          setTimeout(() => {
            if (opts.noReload) return reloadWaiter!.reject(new Error("myIllini did not finish saving (no reload)"));
            if (opts.dropOnSave) for (const k of ["lower", "upper"] as const) saved[k] = saved[k].filter((x) => x.name !== opts.dropOnSave);
            editorDirty = false;
            reloadWaiter!.resolve();
          }, 1);
          return { type: "uiucSave", ok: true };
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
    async go(path) {
      visits.push(path);
      if (opts.leavePrompt && editorDirty) throw new Error("The myIllini page did not open. Check the tab, then run again");
      at = opts.signedOut ? "other" : path.includes("IsLower=False") ? "upper" : "lower";
    },
    afterReload() {
      return new Promise<void>((resolve, reject) => (reloadWaiter = { resolve, reject }));
    },
  };
  return { tab, visits, sent, saved };
}

test("runUiucPlans opens Years 9-11 then Year 12 in the same tab, adds the new rows, saves once per page and checks", async () => {
  const u = fakeIllini();
  u.saved.lower.push({ name: "Algebra 1", grade: "93", year: "1", term: ".2.1", text: "" });
  const r = await runUiucPlans([plan(9, [row("Algebra 1", "1"), row("Biology", "1")]), plan(10, [row("Chemistry", "2")]), plan(12, [row("Calculus", "4")])], u.tab, () => false, () => {});
  assert.deepEqual(u.visits, ["/Apply/Application/FreshmanSRAR", "/Apply/Application/FreshmanSRAR?IsLower=False"]);
  assert.deepEqual(r.reports.map((x) => [x.plan.gradeLevel, x.added.map((a) => a.name), x.skippedExisting, x.problems]), [
    [9, ["Biology"], 1, []],
    [10, ["Chemistry"], 0, []],
    [12, ["Calculus"], 0, []],
  ]);
  assert.equal(u.sent.filter((t) => t === "uiucSave").length, 2);
});

test("nothing new on a page: nothing is pressed", async () => {
  const u = fakeIllini();
  u.saved.lower.push({ name: "Biology", grade: "90", year: "1", term: ".2.1", text: "" });
  const r = await runUiucPlans([plan(9, [row("Biology", "1")])], u.tab, () => false, () => {});
  assert.deepEqual(r.reports[0]!.problems, []);
  assert.equal(r.reports[0]!.skippedExisting, 1);
  assert.ok(!u.sent.includes("uiucSave"));
});

test("a locked courses page is reported with what to do, and nothing is filled", async () => {
  const u = fakeIllini({ locked: true });
  const r = await runUiucPlans([plan(9, [row("Biology", "1")]), plan(12, [row("Calculus", "4")])], u.tab, () => false, () => {});
  assert.deepEqual(r.reports.map((x) => x.problems), [[UIUC_LOCKED], [UIUC_LOCKED]]);
  assert.ok(!u.sent.includes("uiucFill") && !u.sent.includes("uiucSave"));
});

test("signed out (the page didn't open), a school myIllini doesn't show, and rows missing after saving are each reported", async () => {
  const out = await runUiucPlans([plan(9, [row("Biology", "1")])], fakeIllini({ signedOut: true }).tab, () => false, () => {});
  assert.match(out.reports[0]!.problems[0]!, /did not open Courses Years 9-11/);
  const other = { ...plan(9, [row("Biology", "1")]), schoolName: "Lincoln High School" };
  const wrong = await runUiucPlans([other], fakeIllini().tab, () => false, () => {});
  assert.match(wrong.reports[0]!.problems[0]!, /matches none/);
  const dropped = await runUiucPlans([plan(9, [row("Biology", "1"), row("Physics", "1")])], fakeIllini({ dropOnSave: "Physics" }).tab, () => false, () => {});
  assert.deepEqual(dropped.reports[0]!.problems, ["UIUC does not list Physics (1st Semester) after saving: check the page for a message"]);
});

test("Stop ends the run after the current page", async () => {
  const u = fakeIllini();
  let n = 0;
  const r = await runUiucPlans([plan(9, [row("Biology", "1")]), plan(12, [row("Calculus", "4")])], u.tab, () => n++ > 0, () => {});
  assert.equal(r.stopped, true);
  assert.equal(r.reports.length, 1);
  assert.deepEqual(u.visits, ["/Apply/Application/FreshmanSRAR"]);
});

test("Save Progress pressed but no reload: the added rows stay in the report with what to check", async () => {
  const r = await runUiucPlans([plan(9, [row("Biology", "1"), row("Physics", "1")])], fakeIllini({ noReload: true }).tab, () => false, () => {});
  assert.deepEqual(r.reports[0]!.added.map((a) => a.name), ["Biology", "Physics"]);
  assert.deepEqual(r.reports[0]!.problems, ["Added 2 rows (myIllini saves each one as it is added), but the page did not reload after Save Progress: check the page before adding anything by hand"]);
});

test("a course the page refused leaves the editor touched: no save, the report says so, and a blocked page change is explained (not 'signed out')", async () => {
  const u = fakeIllini({ refuse: "Drama", leavePrompt: true });
  const r = await runUiucPlans([plan(9, [row("Drama", "1")]), plan(12, [row("Calculus", "4")])], u.tab, () => false, () => {});
  assert.ok(!u.sent.includes("uiucSave"));
  assert.deepEqual(r.reports[0]!.problems, ['Drama (1st Semester): not added. UIUC said "Error"', UIUC_EDITOR_DIRTY]);
  assert.match(r.reports[1]!.problems[0]!, /stayed on Courses Years 9-11 .*confirm leaving the page \("Leave site\?"\), because its course editor holds a course UIUC did not add/);
  assert.doesNotMatch(r.reports[1]!.problems[0]!, /signed you out/);
});

