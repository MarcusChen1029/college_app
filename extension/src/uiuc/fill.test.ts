import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import type { UiucRow } from "../../../web/lib/uiuc-fill.ts";
import { html } from "../commonapp/test-dom.ts";
import { DIALOG_CONTROL, DIALOG_REPORT, installDialogHook, pageDialogs } from "./dialogs.ts";
import { fillUiucArea, NEVER_CLICK_ID, parseRow, safeClick, UIUC_DOM, UIUC_TIMING, uiucPageInfo, uiucPageKind, uiucSave, type UiucDialogs } from "./fill.ts";

Object.assign(UIUC_TIMING, { stepMs: 2, rowMs: 300, gapMs: 1, optionMs: 40, dialogMs: 30, settleMs: 30 });
UIUC_DOM.visible = (el) => !!el && (el as HTMLElement).style.display !== "none";

const LOWER = { pathname: "/Apply/Application/FreshmanSRAR", search: "" };
const UPPER = { pathname: "/Apply/Application/FreshmanSRAR", search: "?IsLower=False" };
const PREVIEW = { pathname: "/Apply/Application/Preview", search: "" };

const opts = (pairs: [string, string][]) => pairs.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
const TERMS: [string, string][] = [[".2.1", "1st Semester"], [".2.2", "2nd Semester"], [".5.1", "Summer"], [".1.1", "All Year"]];
const SUBJECTS: [string, string][] = [["ENG", "English"], ["M", "Mathematics"], ["SCI", "Science"], ["S", "Social Science"], ["FL", "Language Other Than English"], ["OTH", "Other"], ["TECH", "Technical"]];
const TYPES: [string, string][] = [["None", "Regular"], ["AP", "AP Course"], ["Honors", "Honors"], ["A Level", "A Level"]];
const AF: [string, string][] = ["A+", "A", "A-", "B+", "B", "F", "P"].map((g) => [g, g]);

const savedRow = (name: string, grade: string, year: string, term: string) =>
  `<div><span>${name}</span> <span>${grade}</span> <span>Year: ${year}</span> <span>Term: ${term}</span> <span>Subject: Mathematics</span> <span>Type: Regular</span> <span>Repeated: No</span> <a>Copy</a> <a>Edit</a> <a>Delete</a></div>`;

/** A fake myIllini courses page shaped like the live one (2026-10-28): one school block, its saved rows, its course editor. */
function myIllini(o: { grading?: "2" | "3"; upper?: boolean; saved?: string; locked?: boolean } = {}) {
  const grading = o.grading ?? "3";
  const years: [string, string][] = o.upper ? [["4", "12th Year"], ["5", "Post-12th"]] : [["0", "Pre-High School"], ["1", "9th Year"], ["2", "10th Year"], ["3", "11th Year"]];
  const grade = grading === "2"
    ? `<select class="CourseGrade">${opts([...(o.upper ? [["In Progress", "In Progress"] as [string, string]] : []), ...AF])}</select>`
    : `<input class="CourseGrade" maxlength="10" value="${o.upper ? "In Progress" : ""}">`;
  const doc = html(`${o.locked ? "<p>You must first complete and submit the Education section</p>" : ""}
    <div class="SchoolArea"><h4>KANG CHIAO INTL SCH LINKOU CMP</h4><p>New Taipei City, Taiwan</p>
      <div class="gradeArea">${o.saved ?? ""}</div>
      <div class="GradeEditor"><input type="hidden" class="GradingScaleTypeID" value="${grading}">
        <select class="TermYear">${opts(years)}</select><select class="Term">${opts(TERMS)}</select><select class="CourseTypeID">${opts(SUBJECTS)}</select>
        <input class="CourseName" maxlength="255">${grade}<select class="AdvancedTypeID">${opts(TYPES)}</select><input type="checkbox" class="IsRepeat">
        <input type="button" class="addGrade" value="Add Course"></div></div>
    <input type="button" id="btn_save" value="Save Progress"><input type="button" id="btn_submit" value="Submit Page">
    <div id="termDialog" style="display:none"><input type="radio" name="topGradeTerm" value="1"><input type="radio" name="topGradeTerm" value="4"><button id="termDialogSubmit">OK</button></div>`);
  // linkedom's <select> has no value setter: give each one value <-> selectedIndex like a browser.
  for (const sel of doc.querySelectorAll("select") as unknown as HTMLSelectElement[]) {
    let idx = 0;
    Object.defineProperty(sel, "selectedIndex", { get: () => idx, set: (i: number) => (idx = i), configurable: true });
    Object.defineProperty(sel, "value", { get: () => sel.options[idx]?.value ?? "", set: (v: string) => (idx = [...sel.options].findIndex((x) => x.value === v)), configurable: true });
  }
  const $ = <T extends Element>(s: string) => doc.querySelector(s) as unknown as T;
  const clicks: string[] = [];
  for (const id of ["btn_save", NEVER_CLICK_ID, "termDialogSubmit"]) $(`#${id}`).addEventListener("click", () => clicks.push(id));
  const dialog = $<HTMLElement>("#termDialog");
  const sayings: string[] = [];
  // "All Year" on the 9-11 page opens the term dialog; OK closes it.
  $(".Term").addEventListener("change", () => {
    if (!o.upper && $<HTMLSelectElement>(".Term").value === ".1.1") dialog.style.display = "block";
  });
  $("#termDialogSubmit").addEventListener("click", () => (dialog.style.display = "none"));
  // Add Course: posts, then appends the row (or alerts an error), like AddGradePost.
  $(".addGrade").addEventListener("click", () => {
    const sel = (c: string) => $<HTMLSelectElement>(`.GradeEditor .${c}`);
    const name = $<HTMLInputElement>(".CourseName").value;
    setTimeout(() => {
      if (name === "Bad Course") return void sayings.push("Error: the course could not be added");
      const text = (s: HTMLSelectElement) => s.options[s.selectedIndex]!.textContent;
      const g = $<HTMLInputElement | HTMLSelectElement>(".CourseGrade");
      const gradeText = g.tagName === "SELECT" ? (g as HTMLSelectElement).value : g.value;
      const area = $(".gradeArea");
      area.insertAdjacentHTML("beforeend", savedRow(name, gradeText, text(sel("TermYear"))!, text(sel("Term"))!));
      (area.lastElementChild as HTMLElement).dataset.fields = JSON.stringify({ subject: sel("CourseTypeID").value, type: sel("AdvancedTypeID").value, repeat: $<HTMLInputElement>(".IsRepeat").checked });
    }, 3);
  });
  const dialogs: UiucDialogs & { on: boolean } = {
    on: false,
    start() { this.on = true; },
    take: () => sayings.splice(0),
    stop() { this.on = false; },
  };
  const savedRows = () => [...$(".gradeArea").children].map((e) => ({ text: e.textContent!.replace(/\s+/g, " "), ...JSON.parse((e as HTMLElement).dataset.fields ?? "{}") }));
  return { doc, clicks, dialogs, savedRows };
}

const row = (o: Partial<UiucRow> = {}): UiucRow => ({
  trackerId: "c", name: "Algebra 1", year: "1", term: ".2.1", termLabel: "1st Semester", subject: "M", type: "None", grade: "93", repeat: false, blocked: null, ...o,
});

test("page kinds: the two courses pages, Education, Other Academic, and anything like Review/View counts as preview", () => {
  assert.equal(uiucPageKind(LOWER), "lower");
  assert.equal(uiucPageKind(UPPER), "upper");
  assert.equal(uiucPageKind({ pathname: "/Apply/Application/FreshmanSRAR", search: "?isLower=false&x=1" }), "upper");
  assert.equal(uiucPageKind({ pathname: "/Apply/Application/Education", search: "" }), "education");
  assert.equal(uiucPageKind({ pathname: "/Apply/Application/OtherAcademic", search: "" }), "otherAcademic");
  assert.equal(uiucPageKind(PREVIEW), "preview");
  assert.equal(uiucPageKind({ pathname: "/Apply/Application/ViewApplication", search: "" }), "preview");
  assert.equal(uiucPageKind({ pathname: "/Apply/Application/Status", search: "" }), "other");
});

test("a saved row's text gives its name, grade, year and term as the editor's values", () => {
  assert.deepEqual(parseRow("Drama 88 Year: 9th Year Term: 1st Semester Subject: Other Type: Regular Repeated: No Copy Edit Delete", null, null),
    { name: "Drama", grade: "88", year: "1", term: ".2.1", text: "Drama 88 Year: 9th Year Term: 1st Semester Subject: Other Type: Regular Repeated: No Copy Edit Delete" });
  const r = parseRow("AP Calculus BC In Progress Year: 12th Year Term: 2nd Semester Subject: Mathematics Type: AP Course Repeated: No", null, null)!;
  assert.deepEqual([r.name, r.grade, r.year, r.term], ["AP Calculus BC", "In Progress", "4", ".2.2"]);
});

test("uiucPage reads the school block, its grading type and saved rows; a locked page says so", () => {
  const { doc } = myIllini({ saved: savedRow("Algebra 1", "93", "9th Year", "1st Semester") });
  const info = uiucPageInfo(doc, LOWER);
  assert.equal(info.kind, "lower");
  assert.equal(info.locked, false);
  assert.equal(info.areas.length, 1);
  assert.equal(info.areas[0]!.name, "KANG CHIAO INTL SCH LINKOU CMP");
  assert.equal(info.areas[0]!.gradingType, "3");
  assert.deepEqual(info.areas[0]!.rows.map((r) => [r.name, r.grade, r.year, r.term]), [["Algebra 1", "93", "1", ".2.1"]]);
  assert.equal(uiucPageInfo(myIllini({ locked: true }).doc, LOWER).locked, true);
});

test("adds only the rows not there yet, one Add Course each, with every box set; existing and blocked rows are left alone", async () => {
  const p = myIllini({ saved: savedRow("Algebra 1", "93", "9th Year", "1st Semester") });
  const r = await fillUiucArea(p.doc, LOWER, 0, [
    row(), // already there
    row({ term: ".2.2", termLabel: "2nd Semester", grade: "95", repeat: true }),
    row({ name: "English 9", subject: "ENG", type: "Honors", grade: "88" }),
    row({ name: "Web Design", subject: null, blocked: "UIUC subject not chosen" }),
  ], p.dialogs);
  assert.equal(r.skippedExisting, 1);
  assert.deepEqual(r.added.map((a) => a.label), ["Algebra 1 (2nd Semester)", "English 9 (1st Semester)"]);
  assert.deepEqual(r.left, [{ course: "Web Design (1st Semester)", why: "UIUC subject not chosen" }]);
  assert.deepEqual(r.problems, []);
  const saved = p.savedRows();
  assert.equal(saved.length, 3);
  assert.match(saved[1]!.text, /Algebra 1 95 Year: 9th Year Term: 2nd Semester/);
  assert.deepEqual([saved[1]!.subject, saved[1]!.type, saved[1]!.repeat], ["M", "None", true]);
  assert.deepEqual([saved[2]!.subject, saved[2]!.type, saved[2]!.repeat], ["ENG", "Honors", false]);
  assert.deepEqual(p.clicks, []); // neither Save Progress nor Submit
  assert.equal(p.dialogs.on, false); // the alert hook is switched off again
});

test("an A-F school: a letter grade goes in, a numeric grade is left with the Education-page reason (never converted)", async () => {
  const p = myIllini({ grading: "2" });
  const r = await fillUiucArea(p.doc, LOWER, 0, [row({ grade: "A+" }), row({ term: ".2.2", termLabel: "2nd Semester", grade: "93" })], p.dialogs);
  assert.deepEqual(r.added.map((a) => a.label), ["Algebra 1 (1st Semester)"]);
  assert.equal(r.left.length, 1);
  assert.equal(r.left[0]!.why, "UIUC lists this school's grades as A-F; your transcript prints 93. Set the grading scale to Other (with the transcript's conversion) on the Education page, or add it yourself");
});

test("Year 12: In Progress goes into the Grade/Mark box", async () => {
  const p = myIllini({ upper: true });
  const r = await fillUiucArea(p.doc, UPPER, 0, [row({ name: "AP Calculus BC", year: "4", type: "AP", grade: "In Progress" })], p.dialogs);
  assert.equal(r.added.length, 1);
  assert.match(p.savedRows()[0]!.text, /AP Calculus BC In Progress Year: 12th Year/);
});

test("All Year opens UIUC's term dialog: Yearly is chosen and the row is added", async () => {
  const p = myIllini();
  const r = await fillUiucArea(p.doc, LOWER, 0, [row({ name: "Chinese", subject: "FL", term: ".1.1", termLabel: "All Year", grade: "97" })], p.dialogs);
  assert.equal(r.added.length, 1);
  assert.ok((p.doc.querySelector('input[name="topGradeTerm"][value="4"]') as HTMLInputElement).checked);
  assert.deepEqual(p.clicks, ["termDialogSubmit"]);
});

test("a page alert is reported for its row and the run goes on", async () => {
  const p = myIllini();
  const r = await fillUiucArea(p.doc, LOWER, 0, [row({ name: "Bad Course" }), row({ name: "Geometry" })], p.dialogs);
  assert.deepEqual(r.added.map((a) => a.name), ["Geometry"]);
  assert.deepEqual(r.problems, ['Bad Course (1st Semester): not added. UIUC said "Error: the course could not be added"']);
});

test("a locked courses page is refused before anything is touched", async () => {
  const p = myIllini({ locked: true });
  await assert.rejects(fillUiucArea(p.doc, LOWER, 0, [row()], p.dialogs), /Submit the Education page on myIllini first/);
  assert.equal(p.savedRows().length, 0);
});

test("SAFETY: nothing runs on Review and Submit (/Preview), and Submit is never clicked anywhere", async () => {
  const p = myIllini();
  await assert.rejects(fillUiucArea(p.doc, PREVIEW, 0, [row()], p.dialogs), /not a myIllini courses page/);
  assert.throws(() => uiucSave(p.doc, PREVIEW), /not a myIllini courses page/);
  assert.throws(() => uiucSave(p.doc, { pathname: "/Apply/Application/Education", search: "" }), /not a myIllini courses page/);
  const submit = p.doc.getElementById(NEVER_CLICK_ID) as HTMLElement;
  assert.throws(() => safeClick(submit, LOWER, p.doc), /never submits/);
  assert.throws(() => safeClick(submit, PREVIEW, p.doc), /not a myIllini courses page/);
  // Even a Save button whose id was swapped, or a button that says "Submit Page", is refused.
  const fake = p.doc.createElement("input");
  fake.value = "I'm done! Submit my record.";
  assert.throws(() => safeClick(fake as HTMLElement, LOWER, p.doc), /never submits/);
  await fillUiucArea(p.doc, LOWER, 0, [row(), row({ name: "Bad Course" })], p.dialogs);
  uiucSave(p.doc, LOWER);
  await new Promise((r) => setTimeout(r, 80));
  assert.deepEqual(p.clicks, ["btn_save"]);
  assert.ok(!p.clicks.includes(NEVER_CLICK_ID));
});

test("SAFETY (source): no UIUC code path names the Submit button except the guard, and none submits a form", () => {
  const dir = new URL(".", import.meta.url);
  const files = [...readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts")).map((f) => new URL(f, dir)), new URL("../assist-content.ts", dir), new URL("../uiuc-main.ts", dir)];
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    src.split("\n").forEach((line, i) => {
      const code = line.trim();
      const comment = code.startsWith("//") || code.startsWith("*") || code.startsWith("/*");
      if (/btn_submit/.test(line)) assert.ok(comment || /NEVER_CLICK/.test(line), `${f.pathname}:${i + 1} names the Submit button outside the guard`);
      if (!comment) assert.ok(!/\.submit\(|requestSubmit|#btn_submit|"btn_submit"\)/.test(line) || /NEVER_CLICK/.test(line), `${f.pathname}:${i + 1} may submit`);
    });
  }
});

test("the MAIN-world hook records alerts and answers confirm with Cancel only while switched on, then restores the originals", () => {
  const shown: string[] = [];
  const win = Object.assign(new EventTarget(), {
    alert: (m?: string) => void shown.push(`alert:${m}`),
    confirm: (m?: string) => (shown.push(`confirm:${m}`), true),
    CustomEvent,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number,
    clearTimeout: (t: number) => clearTimeout(t as unknown as NodeJS.Timeout),
  });
  installDialogHook(win as never);
  const side = pageDialogs(win as never);
  side.start();
  win.alert("Error: duplicate course");
  assert.equal(win.confirm("A Level?"), false);
  assert.deepEqual(side.take(), ["Error: duplicate course", "(asked) A Level?"]);
  side.stop();
  win.alert("after");
  assert.deepEqual(shown, ["alert:after"]);
  assert.equal(typeof DIALOG_CONTROL, "string");
  assert.notEqual(DIALOG_CONTROL, DIALOG_REPORT);
});

test("a row that can't go in is checked first and leaves the editor untouched (no change events, so no Leave site? prompt)", async () => {
  const p = myIllini({ grading: "2" });
  let changes = 0;
  for (const el of p.doc.querySelectorAll(".GradeEditor select, .GradeEditor input")) el.addEventListener("change", () => changes++);
  const r = await fillUiucArea(p.doc, LOWER, 0, [
    row({ type: "Gifted", grade: "A" }), // not in this page's Type list
    row({ term: ".4.1", termLabel: "1st Quarter", grade: "A" }), // no quarters at this school
    row({ grade: "93" }), // numeric grade on an A-F school
    row({ name: "x".repeat(300), grade: "A" }), // longer than the name box
  ], p.dialogs);
  assert.deepEqual(r.left.map((x) => x.why.split(/[;.:]/)[0]), ["UIUC's Type list has no \"Gifted\"", "UIUC's Term list for this school has no 1st Quarter", "UIUC lists this school's grades as A-F", "the course name is longer than UIUC's 255-character box"]);
  assert.equal(changes, 0);
  assert.equal((p.doc.querySelector(".CourseName") as HTMLInputElement).value, "");
  assert.equal(r.editorDirty, false);
  assert.equal(p.savedRows().length, 0);
});

test("editorDirty: a row the page refused leaves the editor touched; a later added row clears it", async () => {
  const a = myIllini();
  assert.equal((await fillUiucArea(a.doc, LOWER, 0, [row({ name: "Bad Course" })], a.dialogs)).editorDirty, true);
  const b = myIllini();
  assert.equal((await fillUiucArea(b.doc, LOWER, 0, [row({ name: "Bad Course" }), row({ name: "Geometry" })], b.dialogs)).editorDirty, false);
});

test("the hook restores the alert/confirm the page has when a fill starts, not the ones from page load", () => {
  const shown: string[] = [];
  const win = Object.assign(new EventTarget(), {
    alert: (m?: string) => void shown.push(`load:${m}`),
    confirm: (_m?: string) => true,
    CustomEvent,
    setTimeout: (f: () => void, ms: number) => setTimeout(f, ms) as unknown as number,
    clearTimeout: (t: number) => clearTimeout(t as unknown as NodeJS.Timeout),
  });
  installDialogHook(win as never);
  const later = (m?: string) => void shown.push(`later:${m}`);
  win.alert = later; // the page swaps alert after load
  const side = pageDialogs(win as never);
  side.start();
  side.start(); // a second "on" must not capture the hook itself
  win.alert("hidden");
  side.stop();
  assert.equal(win.alert, later);
  win.alert("x");
  assert.deepEqual(shown, ["later:x"]);
});

