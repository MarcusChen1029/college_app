import assert from "node:assert/strict";
import { test } from "node:test";
import {
  cgFieldId,
  matShownText,
  ngValues,
  PageChanged,
  readCgDialog,
  readNgOptions,
  readOverlayOptions,
  selectMatOption,
  selectNgOption,
  setText,
  TIMING,
  waitFor,
} from "./dom.ts";
import { fixture, html } from "./test-dom.ts";

TIMING.stepMs = 5;
TIMING.panelMs = 200;
TIMING.valueMs = 200;

test("cgFieldId builds the dialog's element ids", () => {
  assert.equal(cgFieldId("grade1", 1, 3), "grade1Control_T1C3");
  assert.equal(cgFieldId("grade4", 1, 1), "grade4Control_T1C1");
  assert.equal(cgFieldId("gradefinal", 1, 2), "gradeFinalControl_T1C2");
  assert.equal(cgFieldId("credit", 1, 1), "creditFinalControl_T1C1");
  assert.equal(cgFieldId("creditNA", 1, 3), "creditNA_T1C3-input");
  assert.equal(cgFieldId("subject", 1, 2), "subjectControl_T1C2");
  assert.equal(cgFieldId("courseName", 1, 2), "courseNameControl_T1C2");
  assert.equal(cgFieldId("level", 1, 2), "levelControl_T1C2");
});

test("readCgDialog reads the rows of the open dialog", () => {
  assert.deepEqual(readCgDialog(fixture("cg-dialog.html")), { courseCount: 3, names: ["Test Algebra", "Test Biology", "Test English"] });
});

test("readCgDialog is null when no dialog is open", () => {
  assert.equal(readCgDialog(html("<main><h1>9th Grade</h1><button id='addCG'>Add 9th grade</button></main>")), null);
});

test("readOverlayOptions lists the open grade list without 'Clear selection'", () => {
  const opts = readOverlayOptions(fixture("cg-overlay-grades.html"));
  assert.ok(opts.includes("A+"));
  assert.ok(opts.includes("E"));
  assert.ok(opts.includes("Pass - (Pass/Fail)"));
  assert.ok(!opts.includes("Clear selection"));
  assert.equal(opts.length, 23);
});

test("readOverlayOptions is empty when no list is open", () => {
  assert.deepEqual(readOverlayOptions(fixture("cg-dialog.html")), []);
});

test("matShownText reads a mat-select's chosen text", () => {
  const doc = fixture("cg-dialog.html");
  assert.equal(matShownText(doc.getElementById("gradingScaleControl1")!), "A-F");
  assert.equal(matShownText(doc.getElementById("grade2Control_T1C1")!), "B+");
});

test("setText sets the value and fires input, change and blur", () => {
  const doc = fixture("cg-dialog.html");
  const input = doc.getElementById("courseNameControl_T1C1") as HTMLInputElement;
  const seen: string[] = [];
  for (const t of ["input", "change", "blur"]) input.addEventListener(t, () => seen.push(`${t}:${input.value}`));
  setText(input, "Algebra I");
  assert.equal(input.value, "Algebra I");
  assert.deepEqual(seen, ["input:Algebra I", "change:Algebra I", "blur:Algebra I"]);
});

test("waitFor rejects with 'timeout'", async () => {
  await assert.rejects(waitFor(() => null, { timeoutMs: 50, intervalMs: 5 }), { message: "timeout" });
});

test("waitFor resolves once the probe returns a value", async () => {
  let n = 0;
  assert.equal(await waitFor(() => (++n >= 3 ? "ok" : null), { timeoutMs: 1000, intervalMs: 5 }), "ok");
  assert.equal(n, 3);
});

/** Plays Angular's part on the overlay fixture: a click on a mat-option shows its text in the select and closes the list. */
function fakeMatSelect(doc: Document, selectId: string, clicks: string[], updateShown = true): void {
  for (const opt of doc.querySelectorAll(`#${selectId}-panel mat-option`)) {
    opt.addEventListener("click", () => {
      const text = (opt.textContent ?? "").trim();
      clicks.push(text);
      const shown = doc.getElementById(selectId)!.querySelector(".mat-mdc-select-value-text .mat-mdc-select-min-line");
      if (updateShown && shown) shown.textContent = text === "Clear selection" ? "" : text;
      doc.getElementById(`${selectId}-panel`)!.closest(".cdk-overlay-pane")!.remove();
    });
  }
}

test("selectMatOption clicks the exactly matching option and returns the shown text", async () => {
  const doc = fixture("cg-overlay-grades.html");
  const clicks: string[] = [];
  fakeMatSelect(doc, "grade1Control_T1C3", clicks);
  assert.equal(await selectMatOption(doc.getElementById("grade1Control_T1C3")!, " a- "), "A-");
  assert.deepEqual(clicks, ["A-"]);
  assert.equal(doc.getElementById("grade1Control_T1C3-panel"), null);
});

test("selectMatOption never picks a near value: no match closes the list on the chosen option and returns null", async () => {
  const doc = fixture("cg-overlay-grades.html");
  const clicks: string[] = [];
  fakeMatSelect(doc, "grade1Control_T1C3", clicks);
  assert.equal(await selectMatOption(doc.getElementById("grade1Control_T1C3")!, "A-plus"), null);
  // " B " is the option already chosen (aria-selected) in the fixture: re-clicking it closes the list without a change.
  assert.deepEqual(clicks, ["B"]);
  assert.equal(doc.getElementById("grade1Control_T1C3-panel"), null);
});

test("selectMatOption rejects with PageChanged when the shown value does not follow the click", async () => {
  const doc = fixture("cg-overlay-grades.html");
  fakeMatSelect(doc, "grade1Control_T1C3", [], false);
  await assert.rejects(selectMatOption(doc.getElementById("grade1Control_T1C3")!, "A"), PageChanged);
});

test("selectMatOption rejects with PageChanged when no list opens", async () => {
  const doc = fixture("cg-dialog.html");
  await assert.rejects(selectMatOption(doc.getElementById("grade1Control_T1C1")!, "A"), PageChanged);
});

test("readNgOptions lists an open ng-select's options", () => {
  const doc = fixture("current-year-open-schedule.html");
  assert.deepEqual(readNgOptions(doc.getElementById("text_ques_311")!), ["Full Year", "First Quarter", "Second Quarter", "Third Quarter", "Fourth Quarter"]);
  assert.deepEqual(readNgOptions(doc.getElementById("text_ques_1073")!), []);
});

test("ngValues reads single (input value) and multi (chips) selections", () => {
  const doc = fixture("current-year.html");
  assert.deepEqual(ngValues(doc.getElementById("text_ques_1073")!), ["Geometry"]);
  assert.deepEqual(ngValues(doc.getElementById("text_ques_311")!), ["First Semester"]);
  assert.deepEqual(ngValues(doc.getElementById("text_ques_307")!), ["3"]);
});

/** Plays ng-select's part: a click on an option adds a chip (multi stays open); Escape closes the panel. */
function fakeNgMulti(doc: Document, inputId: string, events: string[]): void {
  const input = doc.getElementById(inputId)!;
  const ng = input.closest("ng-select")!;
  for (const opt of ng.querySelectorAll(".ng-option")) {
    opt.addEventListener("click", () => {
      const text = (opt.textContent ?? "").trim();
      events.push(`click:${text}`);
      const chip = doc.createElement("div");
      chip.className = "ng-value";
      chip.innerHTML = `<span class="ng-value-label">${text}</span><span class="ng-value-icon left"></span>`;
      ng.querySelector(".ng-value-container")!.prepend(chip);
    });
  }
  input.addEventListener("keydown", () => {
    events.push("keydown");
    ng.querySelector("ng-dropdown-panel")?.remove();
  });
}

test("selectNgOption picks the exact option of a multi-select and closes the list", async () => {
  const doc = fixture("current-year-open-schedule.html");
  const events: string[] = [];
  fakeNgMulti(doc, "text_ques_311", events);
  assert.equal(await selectNgOption(doc.getElementById("text_ques_311")!, "second quarter"), "Second Quarter");
  assert.deepEqual(events, ["click:Second Quarter", "keydown"]);
  assert.deepEqual(ngValues(doc.getElementById("text_ques_311")!), ["Second Quarter"]);
});
