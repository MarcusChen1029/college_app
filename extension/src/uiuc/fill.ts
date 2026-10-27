// Fills UIUC's Self-Reported Academic Record courses pages on myIllini (Courses Years 9-11 /Apply/Application/FreshmanSRAR and Courses
// Year 12 ?IsLower=False) from a UiucGradePlan's rows: per row it sets the school's course editor (.GradeEditor) and presses "Add Course"
// (input.addGrade), which posts the row, appends it to .gradeArea and AutoSaves. Read live 2026-10-28: docs/superpowers/research/
// 2026-10-27-portal-dom.md §5. Rows already on the page are never changed or deleted.
//
// SAFETY: the extension acts only on the two courses pages. It never acts on Review and Submit (/Preview) or the record view
// (/ViewApplication), never on Education or Other Academic Information, and never presses the page's Submit button: on /Preview that same
// button is "I'm done! Submit my record.", the FINAL submission. Every click goes through safeClick, which refuses it.

import { sameCourseName } from "../../../web/lib/course-names.ts";
import { UIUC_IN_PROGRESS, UIUC_TERM, type UiucRow } from "../../../web/lib/uiuc-fill.ts";

/** NEVER_CLICK: the id of every page's "Submit Page" button and, on /Preview, of the final "I'm done! Submit my record." button. */
export const NEVER_CLICK_ID = "btn_submit";
/** Button wording that submits something; refused whatever the button's id (Save Progress and Add Course don't match). */
const SUBMIT_WORDING = /submit (page|my record)|i'?m done/i;

export const UIUC_TIMING = { stepMs: 100, rowMs: 10000, gapMs: 250, optionMs: 2000, dialogMs: 800, settleMs: 1500 };
/** Whether an element is shown. Tests swap it (the fake DOM has no layout). */
export const UIUC_DOM = {
  visible(el: Element | null): boolean {
    if (!el) return false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const h = e as HTMLElement;
      if (h.hidden || h.style?.display === "none" || e.getAttribute("aria-hidden") === "true") return false;
    }
    return typeof (el as HTMLElement).getClientRects !== "function" || (el as HTMLElement).getClientRects().length > 0;
  },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export class UiucStop extends Error {}

export type UiucPageKind = "education" | "lower" | "upper" | "otherAcademic" | "preview" | "other";
export type UiucExistingRow = { name: string; grade: string; year: string | null; term: string | null; text: string };
export type UiucArea = { name: string; text: string; gradingType: string | null; rows: UiucExistingRow[] };
export type UiucPageInfo = { kind: UiucPageKind; locked: boolean; areas: UiucArea[] };
export type UiucAdded = { name: string; year: string; term: string; label: string };
/** editorDirty: the course editor holds values that were not added (a row the page refused): leaving the page may ask "Leave site?". */
export type UiucFillResult = { added: UiucAdded[]; skippedExisting: number; left: { course: string; why: string }[]; problems: string[]; editorDirty: boolean };
/** The page's alert()/confirm() texts while a fill runs (recorded by the MAIN-world hook, uiuc/dialogs.ts). */
export type UiucDialogs = { start(): void; take(): string[]; stop(): void };

type Loc = { pathname: string; search: string };

/** Which SRAR page this is. Anything that looks like Review and Submit or the record view counts as "preview" (never acted on). */
export function uiucPageKind(loc: Loc): UiucPageKind {
  const p = loc.pathname.toLowerCase().replace(/\/+$/, "");
  if (p.includes("preview") || p.includes("viewapplication")) return "preview";
  if (p.endsWith("/apply/application/education")) return "education";
  if (p.endsWith("/apply/application/otheracademic")) return "otherAcademic";
  if (p.endsWith("/apply/application/freshmansrar")) return /(^|[?&])islower=false(&|$)/i.test(loc.search.replace(/^\?/, "")) ? "upper" : "lower";
  return "other";
}

/** The courses pages stay locked until the Education page is submitted. */
export const uiucLocked = (doc: Document): boolean => /You must first complete and submit the Education section/i.test(doc.body?.textContent ?? "");

/** Throws unless this is a courses page the filler may act on. Called before every action. */
export function assertFillable(loc: Loc, doc: Document): "lower" | "upper" {
  const kind = uiucPageKind(loc);
  if (kind !== "lower" && kind !== "upper") throw new UiucStop("This is not a myIllini courses page (Courses Years 9-11 or Year 12); the extension acts only there");
  if (uiucLocked(doc)) throw new UiucStop("Submit the Education page on myIllini first (check its grading scale), then run again");
  return kind;
}

/** The only way this module clicks: refuses the Submit button (by id, inside it, or by its wording) and any click off the courses pages. */
export function safeClick(el: HTMLElement, loc: Loc, doc: Document): void {
  assertFillable(loc, doc);
  const label = `${(el as HTMLInputElement).value ?? ""} ${el.textContent ?? ""}`;
  if (el.id === NEVER_CLICK_ID || el.closest?.(`#${NEVER_CLICK_ID}`) || SUBMIT_WORDING.test(label)) throw new UiucStop("Refused to press a Submit button: the extension never submits anything on myIllini");
  el.click();
}

/** Text with a space between elements (textContent glues "Drama" and "88" together when they sit in separate cells). */
function text(el: Element | null, skip?: (e: Element) => boolean): string {
  const parts: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) parts.push(n.textContent ?? "");
    else if (n.nodeType === 1 && !(skip && skip(n as Element))) n.childNodes.forEach(walk);
  };
  if (el) walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function fire(el: Element, type: string): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = view.Event ?? Event;
  el.dispatchEvent(new Ctor(type, { bubbles: true }));
}

/** One block per school (.SchoolArea); a page with one editor and no such block is one area. */
function areaEls(doc: Document): Element[] {
  const areas = [...doc.querySelectorAll(".SchoolArea")];
  if (areas.length) return areas;
  return doc.querySelector(".GradeEditor") ? [doc.body] : [];
}

/** A field of the school's course editor (never one inside the saved rows). */
function editorField<T extends Element>(area: Element, cls: string): T | null {
  const editor = area.querySelector(".GradeEditor") ?? area;
  return ([...editor.querySelectorAll(`.${cls}`)].find((e) => !e.closest(".gradeArea")) as T | undefined) ?? null;
}

const gradeArea = (area: Element) => area.querySelector(".gradeArea");
const rowEls = (area: Element) => [...(gradeArea(area)?.children ?? [])].filter((e) => /\bYear:/.test(text(e)));

/** The option value whose text says `label` ("9th Year" -> "1"), from the editor's own select, else the known wording. */
function valueForLabel(sel: HTMLSelectElement | null, label: string, fallback: (k: string) => string | null): string | null {
  const k = key(label);
  if (!k) return null;
  const opts = sel ? [...sel.options].filter((o) => o.value !== "") : [];
  const hit = opts.find((o) => key(o.textContent ?? "") === k) ?? opts.find((o) => key(o.textContent ?? "") && (k.startsWith(key(o.textContent ?? "")) || key(o.textContent ?? "").startsWith(k)));
  return hit ? hit.value : fallback(k);
}

const YEAR_BY_GRADE: Record<string, string> = { "9": "1", "10": "2", "11": "3", "12": "4" };
const yearFallback = (k: string) => (/\bpre/.test(k) ? "0" : /\bpost/.test(k) ? "5" : YEAR_BY_GRADE[k.match(/(\d{1,2})(st|nd|rd|th)/)?.[1] ?? ""] ?? null);
const TERM_BY_LABEL: Record<string, string> = {
  ...Object.fromEntries(Object.values(UIUC_TERM).map((t) => [key(t.label), t.value])),
  yearly: ".1.1", "full year": ".1.1", year: ".1.1",
};
const termFallback = (k: string) => TERM_BY_LABEL[k] ?? null;

/** A saved row's text: "Drama 88 Year: 9th Year Term: 1st Semester Subject: Other Type: Regular Repeated: No Copy Edit Delete". */
export function parseRow(t: string, yearSel: HTMLSelectElement | null, termSel: HTMLSelectElement | null): UiucExistingRow | null {
  const m = t.match(/^(.*?)\s*Year:\s*(.*?)\s*Term:\s*(.*?)\s*(?:Subject:|Type:|Repeated:|$)/i);
  if (!m) return null;
  const head = m[1]!.trim();
  // The name and the grade share one run of text; the grade is the last word, or "In Progress".
  const ip = head.match(/^(.*?)\s+In Progress$/i);
  const parts = head.split(" ");
  const [name, grade] = ip ? [ip[1]!, "In Progress"] : parts.length > 1 ? [parts.slice(0, -1).join(" "), parts[parts.length - 1]!] : [head, ""];
  return { name, grade, year: valueForLabel(yearSel, m[2]!, yearFallback), term: valueForLabel(termSel, m[3]!, termFallback), text: t };
}

/** The page's school blocks: the school's name, its text (without the saved rows), the editor's grading type and the rows saved so far. */
export function uiucAreas(doc: Document): UiucArea[] {
  return areaEls(doc).map((area) => {
    const yearSel = editorField<HTMLSelectElement>(area, "TermYear");
    const termSel = editorField<HTMLSelectElement>(area, "Term");
    const skip = (e: Element) => e.classList?.contains("gradeArea") || e.classList?.contains("GradeEditor") || e.tagName === "SCRIPT";
    const head = [...area.querySelectorAll("h1, h2, h3, h4, h5, h6, legend, .SchoolName, strong")].find((e) => !skip(e) && !e.closest(".gradeArea, .GradeEditor"));
    const all = text(area, skip);
    const grading = area.querySelector(".GradingScaleTypeID") as HTMLInputElement | null;
    return {
      name: head ? text(head) : all.slice(0, 120),
      text: all.slice(0, 1500),
      gradingType: grading?.value ?? null,
      rows: rowEls(area).flatMap((e) => parseRow(text(e), yearSel, termSel) ?? []),
    };
  });
}

export function uiucPageInfo(doc: Document, loc: Loc): UiucPageInfo {
  return { kind: uiucPageKind(loc), locked: uiucLocked(doc), areas: uiucAreas(doc) };
}

/** Whether a saved row is this plan row: same year, same term and the same course name (forgiving punctuation, case, one typo). */
export function sameUiucRow(have: UiucExistingRow, row: Pick<UiucRow, "name" | "year" | "term" | "grade">): boolean {
  if (have.year !== row.year || have.term !== row.term) return false;
  return sameCourseName(have.name, row.name) || (row.grade != null && key(`${have.name} ${have.grade}`) === key(`${row.name} ${row.grade}`));
}

/** Picks the option with this value and checks it stuck. false when the option isn't there. */
function choose(sel: HTMLSelectElement, value: string): boolean {
  const i = [...sel.options].findIndex((o) => o.value === value);
  if (i < 0) return false;
  sel.selectedIndex = i;
  fire(sel, "input");
  fire(sel, "change");
  return sel.value === value;
}

/** Like choose, waiting for the option (a change to Year may redraw the Term list). */
async function chooseWait(sel: HTMLSelectElement, value: string): Promise<boolean> {
  const start = Date.now();
  while (![...sel.options].some((o) => o.value === value)) {
    if (Date.now() - start > UIUC_TIMING.optionMs) return false;
    await sleep(UIUC_TIMING.stepMs);
  }
  return choose(sel, value);
}

class RowLeft extends Error {}

function need<T extends Element>(area: Element, cls: string, label: string): T {
  const el = editorField<T>(area, cls);
  if (!el) throw new UiucStop(`UIUC's ${label} box is not on the page`);
  return el;
}

/** The grade as the Grade/Mark box takes it: a select's option value (A-F scale), or the printed text (Other scale). */
function gradeValue(box: HTMLSelectElement | HTMLInputElement, grade: string, gradingType: string | null): string {
  if (box.tagName !== "SELECT") return grade;
  const opts = [...(box as HTMLSelectElement).options];
  const hit = opts.find((o) => o.value === grade || (o.textContent ?? "").trim() === grade) ?? opts.find((o) => o.value.toUpperCase() === grade.toUpperCase() && /^[a-z]{1,2}[+-]?$/i.test(grade));
  if (hit) return hit.value;
  if (gradingType === "2") throw new RowLeft(`UIUC lists this school's grades as A-F; your transcript prints ${grade}. Set the grading scale to Other (with the transcript's conversion) on the Education page, or add it yourself`);
  throw new RowLeft(`UIUC's Grade/Mark list has no "${grade}"; add it yourself`);
}

/** "All Year" may open UIUC's "how is the year split" dialog: answer Yearly (topGradeTerm 4) and close it. true when it was there. */
function answerTermDialog(doc: Document, loc: Loc): boolean {
  const dialog = doc.getElementById("termDialog");
  if (!UIUC_DOM.visible(dialog)) return false;
  const yearly = (dialog!.querySelector('input[name="topGradeTerm"][value="4"]') ?? doc.querySelector('input[name="topGradeTerm"][value="4"]')) as HTMLInputElement | null;
  const ok = doc.getElementById("termDialogSubmit") as HTMLElement | null;
  if (!yearly || !ok) throw new RowTouched("UIUC asked how the school year is split and its Yearly choice is not there; add this course yourself");
  yearly.checked = true;
  fire(yearly, "click");
  fire(yearly, "change");
  safeClick(ok, loc, doc);
  return true;
}

/** Waits until the school's saved rows grow past `before`; answers the term dialog on the way. Returns the page's messages on failure. */
async function rowAdded(doc: Document, loc: Loc, area: Element, before: number, dialogs: UiucDialogs, ms: number): Promise<{ ok: boolean; said: string[] }> {
  const said: string[] = [];
  const start = Date.now();
  while (Date.now() - start <= ms) {
    if (rowEls(area).length > before) return { ok: true, said: [...said, ...dialogs.take()] };
    said.push(...dialogs.take());
    if (said.length) return { ok: false, said }; // AddGradePost errors arrive as an alert
    answerTermDialog(doc, loc);
    await sleep(UIUC_TIMING.stepMs);
  }
  return { ok: rowEls(area).length > before, said };
}

const hasOption = (sel: HTMLSelectElement, value: string) => [...sel.options].some((o) => o.value === value);

/**
 * Checks every box of a row against the editor's own lists WITHOUT touching anything: a row left for the student must leave the editor
 * as it was (a changed editor makes the page ask "Leave site?" on the next page change). Returns the grade value to enter.
 */
function checkRow(area: Element, row: UiucRow, gradingType: string | null): string {
  if (row.type === "A Level" || row.type === "AS Level") throw new RowLeft("A Level / AS Level type: pick it on myIllini yourself");
  if (!row.subject || row.grade == null) throw new RowLeft(row.blocked ?? "the row has no subject or grade");
  if (!hasOption(need<HTMLSelectElement>(area, "TermYear", "Year"), row.year)) throw new RowLeft("UIUC's Year list on this page has no such year");
  if (!hasOption(need<HTMLSelectElement>(area, "Term", "Term"), row.term)) throw new RowLeft(`UIUC's Term list for this school has no ${row.termLabel}; add it yourself`);
  if (!hasOption(need<HTMLSelectElement>(area, "CourseTypeID", "Subject"), row.subject)) throw new RowLeft("UIUC's Subject list has no such subject");
  const name = need<HTMLInputElement>(area, "CourseName", "Course Name");
  const nameMax = Number(name.getAttribute("maxlength")) || 255;
  if (row.name.length > nameMax) throw new RowLeft(`the course name is longer than UIUC's ${nameMax}-character box; add it yourself`);
  const gradeBox = need<HTMLSelectElement | HTMLInputElement>(area, "CourseGrade", "Grade/Mark");
  const g = gradeValue(gradeBox, row.grade, gradingType);
  // "In Progress" is the Year 12 box's own default, so it may exceed the box's maxlength.
  const gradeMax = Number(gradeBox.getAttribute("maxlength")) || 0;
  if (gradeBox.tagName !== "SELECT" && gradeMax && g.length > gradeMax && g !== UIUC_IN_PROGRESS) throw new RowLeft(`"${g}" is longer than UIUC's ${gradeMax}-character Grade/Mark box; add it yourself`);
  if (!hasOption(need<HTMLSelectElement>(area, "AdvancedTypeID", "Type"), row.type)) throw new RowLeft(`UIUC's Type list has no "${row.type}"`);
  if (row.repeat && !editorField(area, "IsRepeat")) throw new RowLeft("UIUC's Repeated Course box is not on the page; add this repeat yourself");
  if (!editorField(area, "addGrade")) throw new UiucStop("UIUC's Add Course button is not on the page");
  return g;
}

/** A box that would not take a value the check said it would (the page redrew a list): the editor is touched from here on. */
class RowTouched extends Error {}

/** Sets the editor to one row (only after checkRow passed) and presses Add Course. */
async function addRow(doc: Document, loc: Loc, area: Element, row: UiucRow, g: string, dialogs: UiucDialogs): Promise<{ ok: boolean; said: string[] }> {
  if (!choose(need<HTMLSelectElement>(area, "TermYear", "Year"), row.year)) throw new RowTouched("UIUC's Year box did not take the year");
  if (!(await chooseWait(need<HTMLSelectElement>(area, "Term", "Term"), row.term))) throw new RowTouched(`UIUC's Term list changed and has no ${row.termLabel}`);
  if (!choose(need<HTMLSelectElement>(area, "CourseTypeID", "Subject"), row.subject!)) throw new RowTouched("UIUC's Subject box did not take the subject");
  const name = need<HTMLInputElement>(area, "CourseName", "Course Name");
  name.focus?.();
  name.value = row.name;
  fire(name, "input");
  fire(name, "change");
  name.blur?.();
  const gradeBox = need<HTMLSelectElement | HTMLInputElement>(area, "CourseGrade", "Grade/Mark");
  if (gradeBox.tagName === "SELECT") {
    if (!choose(gradeBox as HTMLSelectElement, g)) throw new RowTouched(`UIUC's Grade/Mark box did not take "${row.grade}"`);
  } else {
    gradeBox.value = g;
    fire(gradeBox, "input");
    fire(gradeBox, "change");
    if (gradeBox.value !== g) throw new RowTouched(`UIUC's Grade/Mark box did not take "${row.grade}"`);
  }
  if (!choose(need<HTMLSelectElement>(area, "AdvancedTypeID", "Type"), row.type)) throw new RowTouched(`UIUC's Type box did not take "${row.type}"`);
  const repeat = editorField<HTMLInputElement>(area, "IsRepeat");
  if (repeat && repeat.checked !== row.repeat) {
    repeat.checked = row.repeat;
    fire(repeat, "change");
  }

  const before = rowEls(area).length;
  // "All Year" on the 9-11 page opens the term dialog right away; its answer may add the row by itself.
  if (row.term === UIUC_TERM.FY.value) {
    const start = Date.now();
    while (Date.now() - start < UIUC_TIMING.dialogMs && !UIUC_DOM.visible(doc.getElementById("termDialog"))) await sleep(UIUC_TIMING.stepMs);
    if (answerTermDialog(doc, loc)) {
      const settled = await rowAdded(doc, loc, area, before, dialogs, UIUC_TIMING.settleMs);
      if (settled.ok || settled.said.length) return settled;
    }
  }
  safeClick(editorField<HTMLElement>(area, "addGrade")!, loc, doc);
  return rowAdded(doc, loc, area, before, dialogs, UIUC_TIMING.rowMs);
}

/**
 * Adds the rows that are not on the page yet to school block `areaIndex`, one Add Course at a time. A row already there (same name, year
 * and term) is left alone and counted; a row the tracker can't fill, or the page refuses, is reported and the rest go on. Presses nothing
 * else: saving is uiucSave's job.
 */
export async function fillUiucArea(doc: Document, loc: Loc, areaIndex: number, rows: readonly UiucRow[], dialogs: UiucDialogs): Promise<UiucFillResult> {
  const kind = assertFillable(loc, doc);
  const area = areaEls(doc)[areaIndex];
  if (!area) throw new UiucStop("The school is no longer on the myIllini page: reload it and run again");
  const info = uiucAreas(doc)[areaIndex]!;
  const have = [...info.rows];
  const result: UiucFillResult = { added: [], skippedExisting: 0, left: [], problems: [], editorDirty: false };
  const pageYears = kind === "upper" ? ["4"] : ["1", "2", "3"];
  dialogs.start();
  try {
    for (const row of rows) {
      const label = `${row.name} (${row.termLabel})`;
      const at = have.findIndex((x) => sameUiucRow(x, row));
      if (at >= 0) {
        have.splice(at, 1);
        result.skippedExisting++;
        continue;
      }
      if (row.blocked) {
        result.left.push({ course: label, why: row.blocked });
        continue;
      }
      if (!pageYears.includes(row.year)) {
        result.left.push({ course: label, why: "this grade belongs on the other courses page" });
        continue;
      }
      try {
        const g = checkRow(area, row, info.gradingType); // nothing on the page changes unless the whole row can go in
        dialogs.take(); // messages from before this row are not its own
        result.editorDirty = true;
        const r = await addRow(doc, loc, area, row, g, dialogs);
        result.editorDirty = !r.ok;
        if (r.ok) result.added.push({ name: row.name, year: row.year, term: row.term, label });
        const said = r.said.map((s) => `UIUC said "${s.trim()}"`).join("; ");
        if (!r.ok) result.problems.push(`${label}: not added. ${said || "UIUC did not add it within 10 seconds"}`);
        else if (said) result.problems.push(`${label}: added, but ${said}`);
      } catch (e) {
        if (e instanceof RowLeft) result.left.push({ course: label, why: e.message });
        else if (e instanceof RowTouched) result.problems.push(`${label}: not added. ${e.message}`);
        else throw e;
      }
      await sleep(UIUC_TIMING.gapMs); // the page AutoSaves after each add
    }
  } finally {
    dialogs.stop();
  }
  return result;
}

/** Presses Save Progress (#btn_save), after the answer has gone out (it reloads the page). Never any other button. */
export function uiucSave(doc: Document, loc: Loc): void {
  assertFillable(loc, doc);
  const save = doc.getElementById("btn_save") as HTMLElement | null;
  if (!save) throw new UiucStop("UIUC's Save Progress button is not on the page");
  if (!/save/i.test(`${(save as HTMLInputElement).value ?? ""} ${save.textContent ?? ""}`)) throw new UiucStop("The Save Progress button says something else; nothing was pressed");
  setTimeout(() => {
    try {
      safeClick(save, loc, doc);
    } catch {
      // The page changed under us: nothing is pressed.
    }
  }, 50);
}
