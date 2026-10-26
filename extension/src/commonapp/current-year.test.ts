import assert from "node:assert/strict";
import { test } from "node:test";
import { cyCountInput, cyField, cyRadios, readCurrentYear } from "./current-year.ts";
import { ngValues, selectNgOption, TIMING } from "./dom.ts";
import { fixture } from "./test-dom.ts";

TIMING.stepMs = 5;
TIMING.panelMs = 200;
TIMING.valueMs = 200;

test("cyField finds a course's field by its visible label, not by id arithmetic", () => {
  const doc = fixture("current-year.html");
  assert.equal(cyField(doc, 1, "subject")?.id, "text_ques_1073");
  assert.equal(cyField(doc, 2, "name")?.id, "text_ques_312");
  assert.equal(cyField(doc, 2, "level")?.id, "text_ques_313");
  assert.equal(cyField(doc, 3, "schedule")?.id, "text_ques_319");
  assert.equal(cyField(doc, 4, "subject"), null);
});

test("cyCountInput finds the 'How many courses' select", () => {
  assert.equal(cyCountInput(fixture("current-year.html"))?.id, "text_ques_307");
});

test("cyRadios lists the scheduling systems and which is checked", () => {
  const radios = cyRadios(fixture("current-year.html"));
  assert.deepEqual(radios.map((r) => r.label), ["Semester", "Trimester", "Quarter", "Yearly"]);
  assert.deepEqual(radios.map((r) => r.checked), [true, false, false, false]);
});

test("readCurrentYear reads the course count and each course", () => {
  assert.deepEqual(readCurrentYear(fixture("current-year.html")), {
    count: 3,
    courses: [
      { n: 1, name: "Test Geometry", blank: false },
      { n: 2, name: "Test Chemistry", blank: false },
      { n: 3, name: "Test English II", blank: false },
    ],
  });
});

test("readCurrentYear: an empty course inside the count is blank", () => {
  const doc = fixture("current-year-open-schedule.html");
  assert.deepEqual(readCurrentYear(doc), { count: 1, courses: [{ n: 1, name: "", blank: true }] });
});

test("a semester-wording schedule under the Quarter system is left blank (exact match fails)", async () => {
  const doc = fixture("current-year-open-schedule.html");
  const input = doc.getElementById("text_ques_311")!;
  const ng = input.closest("ng-select")!;
  let clicked = false;
  for (const o of ng.querySelectorAll(".ng-option")) o.addEventListener("click", () => (clicked = true));
  input.addEventListener("keydown", () => ng.querySelector("ng-dropdown-panel")?.remove());
  assert.equal(await selectNgOption(input, "First Semester"), null);
  assert.equal(clicked, false);
  assert.deepEqual(ngValues(input), []);
  assert.equal(ng.querySelector("ng-dropdown-panel"), null);
});
