// fillCgGrade end to end on the dialog fixture, with fakeCommonApp playing Angular and recording every click.
import assert from "node:assert/strict";
import { test } from "node:test";
import type { CgGradePlan, FillRow } from "../../../web/lib/commonapp-fill.ts";
import { cgRows, changedToYesNote, fillCgGrade } from "./cg.ts";
import { TIMING } from "./dom.ts";
import { fakeCommonApp } from "./fake-commonapp.ts";
import { fixture, html } from "./test-dom.ts";

Object.assign(TIMING, { stepMs: 2, panelMs: 200, valueMs: 200, pageMs: 300, saveMs: 300 });

const at = (pathname: string) => ((globalThis as { location?: unknown }).location = { pathname });

/** The 9th-grade page with its dialog already open (as after inspect pressed "Edit 9th grade"). */
function ninthGrade(): Document {
  at("/common/13/55");
  const doc = fixture("cg-dialog.html");
  const add = doc.createElement("button");
  add.id = "addCG";
  add.textContent = "Edit 9th grade";
  doc.body.prepend(add);
  return doc;
}

const row = (o: Partial<FillRow>): FillRow => ({ trackerId: "t1", name: "Algebra I", subject: "Algebra", level: "Honors", grades: { "1": "95", "2": "88", final: "91" }, credits: { final: "1" }, creditNA: false, ...o });
const plan = (o: Partial<CgGradePlan>): CgGradePlan => ({
  grade: "9", schoolName: "West Lafayette Junior-Senior High School", schoolYear: "2023-24", scale: "A-F", scheduleStem: "semester",
  rows: [row({})], skipped: [], warnings: [], ...o,
});
const isCloseOrContinue = (l: string) => l === "click:changePreferencesClose" || l.startsWith("click:Continue");
const setShown = (doc: Document, id: string, text: string) => (doc.getElementById(id)!.querySelector(".mat-mdc-select-min-line")!.textContent = text);
const input = (doc: Document, id: string) => doc.getElementById(id) as HTMLInputElement;

test("Replace: Remove + confirm once per row 2+, Grading Scale and Schedule before any grade, then Continue", async () => {
  const doc = ninthGrade();
  setShown(doc, "scheduleControl1", "Trimesters");
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ scale: "1-100" }), "replace", doc);
  assert.deepEqual(result, { filled: 1, blanks: [] });

  const { log } = fake;
  assert.equal(log.filter((l) => l === "click:Remove course").length, 2);
  assert.equal(log.filter((l) => l === "click:alert_rc_r").length, 2);
  assert.ok(!log.includes("click:alert_rc_c"));
  const firstGrade = log.findIndex((l) => l.startsWith("pick:grade"));
  assert.ok(firstGrade > 0);
  assert.ok(log.indexOf("pick:gradingScaleControl1=1-100") >= 0 && log.indexOf("pick:gradingScaleControl1=1-100") < firstGrade);
  assert.ok(log.indexOf("pick:scheduleControl1=Semesters") >= 0 && log.indexOf("pick:scheduleControl1=Semesters") < firstGrade);
  for (const p of ["pick:grade1Control_T1C1=95", "pick:grade2Control_T1C1=88", "pick:gradeFinalControl_T1C1=91"]) assert.ok(log.includes(p), p);
  assert.ok(log[log.length - 1]!.startsWith("click:Continue"));
  assert.ok(!log.includes("click:changePreferencesClose"));

  const dialog = fake.closed!;
  assert.equal(dialog.querySelectorAll("ca-cng-course").length, 1);
  assert.equal((dialog.querySelector("#courseNameControl_T1C1") as HTMLInputElement).value, "Algebra I");
  assert.equal((dialog.querySelector("#credit1Control_T1C1") as HTMLInputElement).value, "");
  assert.equal((dialog.querySelector("#creditFinalControl_T1C1") as HTMLInputElement).value, "1");
});

test("a locator failure once the dialog is open presses neither Continue nor X, and leaves the dialog open", async () => {
  const doc = ninthGrade();
  [...doc.querySelectorAll("button")].find((b) => (b.textContent ?? "").trim() === "Add another course")!.remove();
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ rows: [row({}), row({ trackerId: "t2", name: "Biology" })] }), "replace", doc);
  assert.equal(result.filled, 1);
  assert.match(result.stoppedReason ?? "", /^Common App's page changed \(no "Add another course" button\)\. Nothing is saved for this grade yet: press X/);
  assert.ok(!fake.log.some(isCloseOrContinue), fake.log.join("\n"));
  assert.ok(doc.getElementById("changePreferencesTitle"), "dialog still open");
});

test("Keep never changes a non-blank row, including a credits-only row and an N/A-only row", async () => {
  const doc = ninthGrade();
  // Row 2: N/A ticked and nothing else. Row 3: a Final credit and nothing else.
  for (const n of [2, 3]) {
    input(doc, `courseNameControl_T1C${n}`).value = "";
    for (const s of doc.getElementById(`courseNameControl_T1C${n}`)!.closest("ca-cng-course")!.querySelectorAll(".mat-mdc-select-min-line")) s.textContent = "";
    for (const c of ["credit1", "credit2", "creditFinal"]) input(doc, `${c}Control_T1C${n}`).value = "";
  }
  input(doc, "creditFinalControl_T1C3").value = "1";
  assert.deepEqual(cgRows(doc).map((r) => r.blank), [false, false, false]);
  const na2 = doc.getElementById("creditNA_T1C2-input")!;
  const credit3 = input(doc, "creditFinalControl_T1C3");
  const before = [1, 2, 3].map((n) => doc.getElementById(`courseNameControl_T1C${n}`)!.closest("ca-cng-course")!.outerHTML);

  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ rows: [row({ name: "New Course", subject: "Biology", level: "Regular/Standard", grades: { final: "A" } })] }), "keep", doc);
  assert.deepEqual(result, { filled: 1, blanks: [] });

  const { log } = fake;
  assert.ok(!log.includes("click:Remove course"));
  assert.ok(!log.some((l) => /_T1C[123](=|$)/.test(l)), log.join("\n"));
  assert.ok(log.includes("click:Add another course"));
  assert.ok(na2.hasAttribute("checked"));
  assert.equal(credit3.value, "1");
  const dialog = fake.closed!;
  const after = [1, 2, 3].map((n) => dialog.querySelector(`#courseNameControl_T1C${n}`)!.closest("ca-cng-course")!.outerHTML);
  assert.deepEqual(after, before);
  assert.equal((dialog.querySelector("#courseNameControl_T1C4") as HTMLInputElement).value, "New Course");
  assert.ok(log.includes("pick:gradeFinalControl_T1C4=A"));
});

test("12th grade: the 'courses to report?' question with no Yes radio stops without pressing anything", async () => {
  at("/common/13/58");
  const doc = html(`<main><h1>12th Grade</h1>
<p id="title_ques_1927">Do you have 12th grade courses on your transcript with official grades?</p>
<mat-radio-group id="radioGroup1927"><input type="radio" name="q1927" id="option_ques_1927_2372-input"><label for="option_ques_1927_2372-input"> No </label></mat-radio-group>
<button id="clear_ques_1927">Clear answer</button>
<button id="addCG">Add 12th grade</button></main>`);
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ grade: "12" }), "replace", doc);
  assert.equal(result.filled, 0);
  assert.match(result.stoppedReason ?? "", /^Common App's page changed \(the 'courses to report\?' question has no Yes answer\)\.$/);
  assert.deepEqual(fake.log, []);
});

test("Other Courses: the question's Yes is clicked before the Add button", async () => {
  at("/common/13/59");
  const doc = html(`<main><h1>Other Courses</h1>
<p id="title_ques_1933">Do you have any other courses on your transcript with grades?</p>
<mat-radio-group id="radioGroup1933"><input type="radio" name="q1933" id="option_ques_1933_2371-input"><label for="option_ques_1933_2371-input"> Yes </label>
<input type="radio" name="q1933" id="option_ques_1933_2372-input"><label for="option_ques_1933_2372-input"> No </label></mat-radio-group>
<button id="addCG">Add Other Courses</button></main>`);
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ grade: "other" }), "replace", doc);
  // The fake has no dialog to open on this page, so the fill stops there; the point is the order of clicks.
  assert.deepEqual(fake.log.slice(0, 2), ["click:option_ques_1933_2371-input", "click:addCG"]);
  assert.match(result.stoppedReason ?? "", /dialog did not open/);
});

test("a school that is not in Common App's list names the options read and both ways out, and fills nothing", async () => {
  const doc = ninthGrade();
  setShown(doc, "schoolNameControl1", "");
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ schoolName: "Lincoln High" }), "replace", doc);
  assert.equal(result.filled, 0);
  assert.equal(result.stoppedReason, undefined);
  assert.equal(result.blanks.length, 1);
  assert.equal(result.blanks[0]!.field, "school");
  assert.ok(
    result.blanks[0]!.reason.startsWith(
      "Your tracker school 'Lincoln High' doesn't match any school in Common App's list ('West Lafayette Junior-Senior High School'). Rename it in the tracker to match, or add it in Common App's Education section.",
    ),
    result.blanks[0]!.reason,
  );
  assert.ok(!fake.log.some(isCloseOrContinue), fake.log.join("\n"));
  // Closing the empty School Name list goes through "Clear selection" (a pick of nothing); no value is ever picked.
  assert.ok(!fake.log.some((l) => /^pick:[^=]+=./.test(l)), fake.log.join("\n"));
});

const otherCoursesPage = (checked: "yes" | "no" | null) => {
  at("/common/13/59");
  const on = (a: "yes" | "no") => (checked === a ? " checked" : "");
  return html(`<main><h1>Other Courses</h1>
<p id="title_ques_1933">Do you have any other courses on your transcript with grades?</p>
<mat-radio-group id="radioGroup1933"><input type="radio" name="q1933" id="option_ques_1933_2371-input"${on("yes")}><label for="option_ques_1933_2371-input"> Yes </label>
<input type="radio" name="q1933" id="option_ques_1933_2372-input"${on("no")}><label for="option_ques_1933_2372-input"> No </label></mat-radio-group>
<button id="addCG">Add Other Courses</button></main>`);
};

test("a 'courses to report?' answer changed from No to Yes is noted for the report", async () => {
  const doc = otherCoursesPage("no");
  fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ grade: "other" }), "replace", doc);
  assert.deepEqual(result.notes, ["Changed your answer to 'courses to report' to Yes for Other Courses."]);
  assert.equal(changedToYesNote("12"), "Changed your answer to 'courses to report' to Yes for 12th grade.");
});

test("no note when the question was unanswered or already Yes", async () => {
  for (const checked of [null, "yes"] as const) {
    const doc = otherCoursesPage(checked);
    fakeCommonApp(doc);
    const result = await fillCgGrade(plan({ grade: "other" }), "replace", doc);
    assert.equal(result.notes, undefined, String(checked));
  }
});

test("per-term credits and No Grade: grades picked exactly, then each credit box typed exactly", async () => {
  const doc = ninthGrade();
  const fake = fakeCommonApp(doc);
  const r = row({ grades: { "1": "88", "2": "No Grade", final: "88" }, credits: { "1": "2", "2": "0", final: "2" } });
  const result = await fillCgGrade(plan({ scale: "1-100", rows: [r] }), "replace", doc);
  assert.deepEqual(result, { filled: 1, blanks: [] });
  for (const p of ["pick:grade1Control_T1C1=88", "pick:grade2Control_T1C1=No Grade", "pick:gradeFinalControl_T1C1=88"]) assert.ok(fake.log.includes(p), p);
  const dialog = fake.closed!;
  const value = (id: string) => (dialog.querySelector(`#${id}`) as HTMLInputElement).value;
  assert.deepEqual([value("credit1Control_T1C1"), value("credit2Control_T1C1"), value("creditFinalControl_T1C1")], ["2", "0", "2"]);
});

test("a grade list without No Grade: that grade and its credit stay blank and are reported, never a closest option", async () => {
  const doc = ninthGrade();
  const fake = fakeCommonApp(doc, { words: ["Incomplete", "Pass - (Pass/Fail)"] });
  const r = row({ name: "Band", grades: { "1": "90", "2": "No Grade", final: "90" }, credits: { "1": "1", "2": "0", final: "1" } });
  const result = await fillCgGrade(plan({ scale: "1-100", rows: [r] }), "replace", doc);
  assert.equal(result.stoppedReason, undefined);
  assert.deepEqual(result.blanks, [{ where: "9", course: "Band", field: "term 2 grade", reason: "'No Grade' is not in Common App's list" }]);
  assert.ok(!fake.log.some((l) => /^pick:grade2Control_T1C1=./.test(l)), fake.log.join("\n"));
  const dialog = fake.closed!;
  const value = (id: string) => (dialog.querySelector(`#${id}`) as HTMLInputElement).value;
  assert.deepEqual([value("credit1Control_T1C1"), value("credit2Control_T1C1"), value("creditFinalControl_T1C1")], ["1", "", "1"]);
});

test("N/A ticked: no credit box is typed into", async () => {
  const doc = ninthGrade();
  const fake = fakeCommonApp(doc);
  const result = await fillCgGrade(plan({ scale: "1-100", rows: [row({ grades: { "1": "90" }, credits: {}, creditNA: true })] }), "replace", doc);
  assert.deepEqual(result, { filled: 1, blanks: [] });
  const dialog = fake.closed!;
  assert.ok(dialog.querySelector("#creditNA_T1C1-input")!.hasAttribute("checked"));
  for (const id of ["credit1Control_T1C1", "credit2Control_T1C1", "creditFinalControl_T1C1"]) assert.equal((dialog.querySelector(`#${id}`) as HTMLInputElement).value, "", id);
});
