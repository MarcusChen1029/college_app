import assert from "node:assert/strict";
import { test } from "node:test";
import { cgGradeBox, cgRows, headerMismatch, otherGradeBox, unreachableReason } from "./cg.ts";
import { fixture, html } from "./test-dom.ts";
import type { CgGradePlan } from "../../../web/lib/commonapp-fill.ts";

test("cgRows reads each transcript-1 row with its name and whether it is blank", () => {
  assert.deepEqual(cgRows(fixture("cg-dialog.html")), [
    { n: 1, name: "Test Algebra", blank: false },
    { n: 2, name: "Test Biology", blank: false },
    { n: 3, name: "Test English", blank: false },
  ]);
});

/** Empties course n of the fixture: name, every select, every credit box, N/A. */
function emptyRow(doc: Document, n: number): void {
  (doc.getElementById(`courseNameControl_T1C${n}`) as HTMLInputElement).value = "";
  const row = doc.getElementById(`courseNameControl_T1C${n}`)!.closest("ca-cng-course")!;
  for (const t of row.querySelectorAll(".mat-mdc-select-min-line")) t.textContent = "";
  for (const c of row.querySelectorAll('input[id^="credit"][id*="Control_"]')) (c as HTMLInputElement).value = "";
  doc.getElementById(`creditNA_T1C${n}-input`)!.removeAttribute("checked");
}

test("cgRows marks a row with nothing in any box and N/A unticked as blank", () => {
  const doc = fixture("cg-dialog.html");
  emptyRow(doc, 3);
  assert.deepEqual(cgRows(doc)[2], { n: 3, name: "", blank: true });
  // Name gone but a grade still there: not blank.
  const doc2 = fixture("cg-dialog.html");
  (doc2.getElementById("courseNameControl_T1C3") as HTMLInputElement).value = "";
  assert.equal(cgRows(doc2)[2]!.blank, false);
});

test("cgRows: a row with only a credit, or only N/A ticked, is not blank", () => {
  const doc = fixture("cg-dialog.html");
  emptyRow(doc, 3);
  (doc.getElementById("credit2Control_T1C3") as HTMLInputElement).value = "0.5";
  assert.equal(cgRows(doc)[2]!.blank, false);
  const doc2 = fixture("cg-dialog.html");
  emptyRow(doc2, 3);
  doc2.getElementById("creditNA_T1C3-input")!.setAttribute("checked", "");
  assert.equal(cgRows(doc2)[2]!.blank, false);
});

test("cgGradeBox finds a select grade column by id, and null when the schedule has no such column", () => {
  const doc = fixture("cg-dialog.html");
  assert.equal(cgGradeBox(doc, "A-F", 1, "1")?.id, "grade1Control_T1C1");
  assert.equal(cgGradeBox(doc, "A-F", 2, "final")?.id, "gradeFinalControl_T1C2");
  assert.equal(cgGradeBox(doc, "A-F", 1, "3"), null);
});

const OTHER_ROW = `<ca-cng-course><div class="course"><input id="courseNameControl_T1C1" value="x">
<div class="course__grades">
<input id="gradeControl_T1C1" aria-label="Transcript 1, Course 1, Semester 1undefined" maxlength="12">
<input id="gradeControl_T1C1" aria-label="Transcript 1, Course 1, Semester 2undefined" maxlength="12">
<input id="gradeControl_T1C1" aria-label="Transcript 1, Course 1, Finalundefined" maxlength="12">
</div></div></ca-cng-course>`;

test("scale Other: each grade text box is found by its aria-label, not its shared id (Ruling J)", () => {
  const doc = html(OTHER_ROW);
  assert.equal(otherGradeBox(doc, 1, "1")?.getAttribute("aria-label"), "Transcript 1, Course 1, Semester 1undefined");
  assert.equal(otherGradeBox(doc, 1, "2")?.getAttribute("aria-label"), "Transcript 1, Course 1, Semester 2undefined");
  assert.equal(otherGradeBox(doc, 1, "final")?.getAttribute("aria-label"), "Transcript 1, Course 1, Finalundefined");
  assert.equal(otherGradeBox(doc, 1, "3"), null);
  assert.equal(cgGradeBox(doc, "Other", 1, "final")?.getAttribute("aria-label"), "Transcript 1, Course 1, Finalundefined");
});

test("scale Other: two boxes for one term are not unique, so none is used", () => {
  const doc = html(OTHER_ROW.replace("Semester 2undefined", "Semester 1undefined"));
  assert.equal(otherGradeBox(doc, 1, "1"), null);
});

test("unreachableReason explains the C&G redirects (Ruling L)", () => {
  assert.equal(unreachableReason("/common/13/not-required"), "Add your school in Education first");
  assert.equal(unreachableReason("/common/13/54"), "Answer Yes on the Courses & Grades intro first");
  assert.equal(unreachableReason("/common/13/55"), null);
});

const plan = (o: Partial<CgGradePlan>): CgGradePlan => ({
  grade: "9", schoolName: "West Lafayette Junior-Senior High School", schoolYear: "2023-24", scale: "A-F", scheduleStem: "semester",
  rows: [], skipped: [], warnings: [], ...o,
});

test("Keep mode never changes a header the existing rows depend on", () => {
  const doc = fixture("cg-dialog.html");
  assert.equal(headerMismatch(doc, plan({})), null);
  assert.match(headerMismatch(doc, plan({ scale: "1-100" })) ?? "", /Grading Scale 'A-F'.*'1-100'/);
  assert.match(headerMismatch(doc, plan({ scheduleStem: "quarter" })) ?? "", /Schedule 'Semesters'/);
  assert.match(headerMismatch(doc, plan({ schoolYear: "2024-25" })) ?? "", /School Year '2023-24'/);
});
