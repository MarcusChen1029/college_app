// Fills one Courses & Grades grade dialog from a CgGradePlan. Order and rules (controller rulings I-M, spec §5.3/§5.6):
// header first (School, Year, then Grading Scale and Schedule before any grade, because a scale change clears grades), then rows,
// then Continue only if nothing failed. On a locator failure the dialog is left OPEN and nothing is pressed (X would save).
// Never touches the C&G intro question, never ticks "I have reported all of my courses", never submits.

import { matchOption, matchStem, NO_GRADE, rowsToAdd, type CgGradeKey, type CgGradePlan, type CommonAppScale, type FillRow, type Skipped, type TermColumn } from "../../../web/lib/commonapp-fill.ts";
import {
  cgCreditId,
  cgDialog,
  cgFieldId,
  chooseMatOption,
  CLEAR_SELECTION,
  checkStop,
  clearMatSelect,
  click,
  isChecked,
  isReadOnly,
  isShown,
  matShownText,
  need,
  PageChanged,
  resetStop,
  sameText,
  selectMatOption,
  setText,
  StopRequested,
  TIMING,
  waitFor,
  type PageResult,
} from "./dom.ts";
import { CG_GRADE_PATH, CG_INTRO_PATH, CG_NOT_REQUIRED_PATH, CG_YES_NO_QUESTION, currentPath, GRADE_LABEL } from "./pages.ts";

export type { PageResult } from "./dom.ts";

const COLUMNS: TermColumn[] = ["1", "2", "3", "4", "final"];
const NOT_SAVED = "Nothing is saved for this grade yet: press X on the dialog to keep what was filled, or reload the page to discard it.";
const LEFT_OPEN = "Nothing was filled for this grade; the dialog was left open (reload the page to close it without saving).";

/** A grade page that cannot be reached; the message tells the student what to do. */
class Unreachable extends Error {}

/** Why /common/13* sent us elsewhere (Ruling L), or null for any other page. */
export function unreachableReason(path: string): string | null {
  if (path === CG_NOT_REQUIRED_PATH) return "Add your school in Education first";
  if (path === CG_INTRO_PATH) return "Answer Yes on the Courses & Grades intro first";
  return null;
}

const rowEl = (doc: Document, n: number) => doc.getElementById(cgFieldId("courseName", 1, n))?.closest("ca-cng-course") ?? null;

/** Transcript 1's rows: course number, name, and whether the row is empty. Empty = no name, no subject/level/grade shown, every grade and
 *  credit box empty and N/A unticked; anything else is a course the student entered, which Keep must never touch. */
export function cgRows(doc: Document): { n: number; name: string; blank: boolean }[] {
  const root = cgDialog(doc) ?? doc;
  const empty = (i: Element) => !((i as HTMLInputElement).value ?? "").trim();
  return [...root.querySelectorAll('input[id^="courseNameControl_T1C"]')].map((input) => {
    const n = Number(input.id.slice("courseNameControl_T1C".length));
    const name = ((input as HTMLInputElement).value ?? "").trim();
    const row = input.closest("ca-cng-course");
    const all = (sel: string) => [...(row?.querySelectorAll(sel) ?? [])];
    const selectsEmpty = all("mat-select").every((s) => !matShownText(s));
    const textGradesEmpty = all('input[id^="gradeControl_"]').every(empty);
    const creditsEmpty = all('input[id^="credit"][id*="Control_T1C"]').every(empty);
    const na = doc.getElementById(cgFieldId("creditNA", 1, n));
    const naOff = !na || !isChecked(na);
    return { n, name, blank: !name && selectsEmpty && textGradesEmpty && creditsEmpty && naOff };
  });
}

/** Which term column a scale-"Other" grade box is, from its aria-label ("Transcript 1, Course 1, Semester 2undefined" -> "2"). */
function termOfLabel(aria: string): TermColumn | null {
  const rest = aria.replace(/^.*Course \d+,\s*/i, "");
  if (/^final/i.test(rest)) return "final";
  const m = /^(?:semester|trimester|quarter|term)\s*([1-4])/i.exec(rest);
  return m ? (m[1] as TermColumn) : null;
}

/** Scale "Other": grade boxes are text inputs sharing the id gradeControl_T1C<n>; the one for `col` by aria-label, or null unless exactly one (Ruling J). */
export function otherGradeBox(doc: Document, n: number, col: TermColumn): HTMLInputElement | null {
  const row = rowEl(doc, n);
  if (!row) return null;
  const hits = [...row.querySelectorAll(`input[id="gradeControl_T1C${n}"]`)].filter((i) => termOfLabel(i.getAttribute("aria-label") ?? "") === col);
  return hits.length === 1 ? (hits[0] as HTMLInputElement) : null;
}

/** The grade box of course n for a term column: a mat-select by id, or the text box on scale "Other". null = no such column. */
export function cgGradeBox(doc: Document, scale: CommonAppScale, n: number, col: TermColumn): Element | null {
  return scale === "Other" ? otherGradeBox(doc, n, col) : doc.getElementById(cgFieldId(`grade${col}`, 1, n));
}

/** Keep mode: a header that already holds another value. Changing it would change the courses already there, so the grade is skipped. */
export function headerMismatch(doc: Document, plan: CgGradePlan): string | null {
  const checks: [string, string, string, (shown: string) => boolean][] = [
    ["schoolNameControl1", "School Name", plan.schoolName, (s) => sameText(s, plan.schoolName)],
    ["schoolYearControl1", "School Year", plan.schoolYear, (s) => sameText(s, plan.schoolYear)],
    ["gradingScaleControl1", "Grading Scale", plan.scale, (s) => sameText(s, plan.scale)],
    ["scheduleControl1", "Schedule", plan.scheduleStem, (s) => matchStem([s], plan.scheduleStem) !== null],
  ];
  for (const [id, label, want, ok] of checks) {
    const el = doc.getElementById(id);
    const shown = el ? matShownText(el) : "";
    if (shown && !ok(shown))
      return `Common App already has ${label} '${shown}' for this grade and the tracker has '${want}'. Changing it would change the courses already there, so nothing was added: choose Replace, or change it on Common App yourself.`;
  }
  return null;
}

async function reachGradePage(doc: Document, grade: CgGradeKey): Promise<void> {
  const want = CG_GRADE_PATH[grade];
  let path = "";
  try {
    await waitFor(() => {
      path = currentPath();
      if (unreachableReason(path)) return true;
      return path === want && (cgDialog(doc) || doc.getElementById("addCG")) ? true : null;
    }, { timeoutMs: TIMING.pageMs });
  } catch {
    if (path === want) throw new PageChanged(`no "Add/Edit ${GRADE_LABEL[grade]}" button`);
    throw new Unreachable(`Not on the ${GRADE_LABEL[grade]} page (Common App shows ${path || "another page"})`);
  }
  const why = unreachableReason(path);
  if (why) throw new Unreachable(why);
}

const labelOf = (doc: Document, input: Element) => (doc.querySelector(`label[for="${input.id}"]`)?.textContent ?? "").trim().toLowerCase();

/** The report line for a "courses to report?" answer the filler changed from No to Yes. */
export const changedToYesNote = (grade: CgGradeKey) => `Changed your answer to 'courses to report' to Yes for ${GRADE_LABEL[grade]}.`;

/** 12th grade and Other Courses ask "courses to report?" before the Add button shows; answer Yes (only called when the plan has rows).
 *  When the student had answered No, a note for the report goes into `notes` as soon as the answer is changed (an unanswered question needs none). */
async function answerYesIfAsked(doc: Document, grade: CgGradeKey, notes: string[]): Promise<void> {
  const q = CG_YES_NO_QUESTION[grade];
  if (q == null || cgDialog(doc)) return;
  const addShown = () => {
    const b = doc.getElementById("addCG");
    return b && isShown(b) ? b : null;
  };
  // Any element of question q (its radios, title, group or "Clear answer" button) means the question is on the page.
  const asked = doc.querySelector(`[id^="option_ques_${q}_"], #title_ques_${q}, #clear_ques_${q}, #radioGroup${q}`);
  if (!asked) {
    if (addShown()) return; // no such question on this page at all: nothing to answer
    throw new PageChanged(`no Yes/No question before the "Add ${GRADE_LABEL[grade]}" button`);
  }
  const radios = [...doc.querySelectorAll(`input[type="radio"][id^="option_ques_${q}_"]`)];
  const yes = radios.filter((r) => labelOf(doc, r) === "yes");
  if (yes.length !== 1) throw new PageChanged(`the 'courses to report?' question has ${yes.length ? "more than one" : "no"} Yes answer`);
  if (!isChecked(yes[0]!)) {
    const wasNo = radios.some((r) => labelOf(doc, r) === "no" && isChecked(r));
    click(yes[0]!);
    if (wasNo) notes.push(changedToYesNote(grade));
  }
  await need(() => isChecked(yes[0]!) && addShown(), `the "Add ${GRADE_LABEL[grade]}" button did not appear after answering Yes`);
}

async function openDialog(doc: Document, grade: CgGradeKey): Promise<void> {
  if (cgDialog(doc)) return;
  const btn = await need(() => {
    const b = doc.getElementById("addCG");
    return b && isShown(b) ? b : null;
  }, `no "Add/Edit ${GRADE_LABEL[grade]}" button`);
  click(btn);
  await need(() => cgDialog(doc) && doc.getElementById(cgFieldId("courseName", 1, 1)), "the Courses & Grades dialog did not open", TIMING.pageMs);
}

function dialogButton(doc: Document, test: RegExp): HTMLElement | null {
  const dialog = cgDialog(doc);
  if (!dialog) return null;
  return ([...dialog.querySelectorAll("button")] as HTMLElement[]).find((b) => test.test((b.textContent ?? "").trim())) ?? null;
}

async function addRow(doc: Document): Promise<number> {
  checkStop();
  const n = cgRows(doc).length + 1;
  const btn = dialogButton(doc, /^add another course$/i);
  if (!btn) throw new PageChanged('no "Add another course" button');
  click(btn);
  await need(() => doc.getElementById(cgFieldId("courseName", 1, n)), `"Add another course" did not add course ${n}`);
  return n;
}

/** Removes course n (rows 2 and up have a Remove button; the confirm dialog's Remove is #alert_rc_r). Client-side until the dialog closes. */
async function removeRow(doc: Document, n: number): Promise<void> {
  checkStop();
  const before = cgRows(doc).length;
  const btn = rowEl(doc, n)?.querySelector(`button[aria-label^="Remove transcript 1, course ${n} of "]`);
  if (!btn) throw new PageChanged(`no Remove button on course ${n}`);
  click(btn);
  const confirm = await need(() => doc.getElementById("alert_rc_r"), "the Remove confirmation did not open");
  click(confirm);
  await need(() => !doc.getElementById("alert_rc_r") && cgRows(doc).length === before - 1, `course ${n} was not removed`);
}

const header = (doc: Document, id: string, label: string) => need(() => doc.getElementById(id), `no ${label} select`);

/** Why a grade was skipped when the tracker's school name matches none of Common App's School Name options (the first few are named). */
export function schoolMissingText(name: string, options: readonly string[]): string {
  const shown = options.slice(0, 5).map((o) => `'${o}'`);
  if (options.length > 5) shown.push(`and ${options.length - 5} more`);
  const list = shown.length ? shown.join(", ") : "no schools";
  return `Your tracker school '${name}' doesn't match any school in Common App's list (${list}). Rename it in the tracker to match exactly, or add it in Common App's Education section.`;
}

/** School Name and School Year. false = not in Common App's list: the grade is skipped (a blank says why). */
async function setSchoolAndYear(doc: Document, plan: CgGradePlan, blank: (course: string, field: string, reason: string) => void): Promise<boolean> {
  const school = await header(doc, "schoolNameControl1", "School Name");
  if (!sameText(matShownText(school), plan.schoolName)) {
    let options: string[] = [];
    const picked = await chooseMatOption(school, (opts) => {
      options = opts.filter((o) => o !== CLEAR_SELECTION);
      return matchOption(options, plan.schoolName);
    });
    if (picked === null) {
      blank("", "school", `${schoolMissingText(plan.schoolName, options)} ${LEFT_OPEN}`);
      return false;
    }
  }
  const year = await header(doc, "schoolYearControl1", "School Year");
  if (!sameText(matShownText(year), plan.schoolYear) && (await selectMatOption(year, plan.schoolYear)) === null) {
    blank("", "school year", `School year '${plan.schoolYear}' is not in Common App's School Year list. ${LEFT_OPEN}`);
    return false;
  }
  return true;
}

/** Grading Scale, then Schedule (Ruling M: both before any grade). */
async function setScaleAndSchedule(doc: Document, plan: CgGradePlan): Promise<void> {
  const scale = await header(doc, "gradingScaleControl1", "Grading Scale");
  if (!sameText(matShownText(scale), plan.scale) && (await selectMatOption(scale, plan.scale)) === null) throw new PageChanged(`Grading Scale has no "${plan.scale}"`);
  const schedule = await header(doc, "scheduleControl1", "Schedule");
  if (matchStem([matShownText(schedule)], plan.scheduleStem) === null) {
    const got = await chooseMatOption(schedule, (opts) => matchStem(opts.filter((o) => o !== CLEAR_SELECTION), plan.scheduleStem));
    if (got === null) throw new PageChanged(`Schedule has no option for "${plan.scheduleStem}"`);
  }
  await need(() => cgGradeBox(doc, plan.scale, 1, "final"), "the Final grade column of course 1");
}

const maxLen = (el: Element) => {
  const m = Number(el.getAttribute("maxlength"));
  return Number.isFinite(m) && m > 0 ? m : Infinity;
};
const colName = (col: TermColumn) => (col === "final" ? "Final" : `term ${col}`);

async function clearBox(box: Element): Promise<void> {
  if (box.tagName === "INPUT") {
    if (((box as HTMLInputElement).value ?? "") && !isReadOnly(box)) setText(box as HTMLInputElement, "");
  } else await clearMatSelect(box);
}

/** Fills course n from one plan row. `overwrite` (Replace mode's reused row 1) also clears what the plan leaves empty. */
async function fillRow(doc: Document, plan: CgGradePlan, row: FillRow, n: number, overwrite: boolean, blank: (course: string, field: string, reason: string) => void): Promise<void> {
  const get = (id: string, what: string) => need(() => doc.getElementById(id), `no ${what} box on course ${n}`);
  const typeExact = (el: Element, value: string, field: string): void => {
    if (value.length > maxLen(el)) blank(row.name, field, `'${value}' is longer than the ${maxLen(el)} characters Common App allows`);
    else setText(el as HTMLInputElement, value);
  };
  const pick = async (el: Element, value: string | null, field: string) => {
    if (value == null) {
      if (overwrite) await clearMatSelect(el);
      return;
    }
    if (sameText(matShownText(el), value)) return;
    if ((await selectMatOption(el, value)) === null) {
      blank(row.name, field, `'${value}' is not in Common App's list`);
      if (overwrite) await clearMatSelect(el);
    }
  };

  await pick(await get(cgFieldId("subject", 1, n), "Subject"), row.subject, "subject");
  checkStop();
  const name = await get(cgFieldId("courseName", 1, n), "Course Name");
  if (row.name.length > maxLen(name)) {
    blank(row.name, "name", `the name is longer than the ${maxLen(name)} characters Common App allows`);
    if (overwrite) setText(name as HTMLInputElement, "");
  } else setText(name as HTMLInputElement, row.name);
  await pick(await get(cgFieldId("level", 1, n), "Course Level"), row.level, "level");

  // Columns whose grade could not be set: their credit is left blank too (a "No Grade" 0 credit without its "No Grade" says nothing).
  const failed = new Set<TermColumn>();
  for (const col of COLUMNS) {
    checkStop();
    const want = row.grades[col];
    const box = cgGradeBox(doc, plan.scale, n, col);
    const field = `${colName(col)} grade`;
    if (want == null) {
      if (overwrite && box) await clearBox(box);
      continue;
    }
    failed.add(col);
    if (!box) {
      blank(row.name, field, plan.scale === "Other" ? `no single ${colName(col)} grade box on Common App for this course` : `Common App's ${plan.scheduleStem} schedule has no ${colName(col)} column`);
      continue;
    }
    if (box.tagName === "INPUT") {
      // Scale "Other" has typed grades and no "No Grade" option; never type the words in as if they were a grade.
      if (want === NO_GRADE) {
        blank(row.name, field, `scale Other has no '${NO_GRADE}' option: enter what your transcript shows for this term`);
        continue;
      }
      if (want.length > maxLen(box)) {
        typeExact(box, want, field); // reports it as too long, types nothing
        continue;
      }
      setText(box as HTMLInputElement, want);
    } else if ((await selectMatOption(box, want)) === null) {
      blank(row.name, field, `'${want}' is not in Common App's list`);
      if (overwrite) await clearMatSelect(box);
      continue;
    }
    failed.delete(col);
  }

  checkStop();
  const na = await get(cgFieldId("creditNA", 1, n), "Credits N/A");
  const setNA = async (on: boolean) => {
    if (isChecked(na) === on) return;
    click(na);
    await need(() => isChecked(na) === on, `Credits N/A did not ${on ? "tick" : "untick"} on course ${n}`);
  };
  if (overwrite) {
    await setNA(false);
    for (const col of COLUMNS) {
      const c = doc.getElementById(cgCreditId(col, 1, n));
      if (c) await clearBox(c);
    }
  }
  if (row.creditNA) await setNA(true);
  else {
    await setNA(false);
    // Term credits, then Final credit, exact text (owner, 2026-10-26: per-term credits; Final is their sum, worked out in the plan).
    for (const col of COLUMNS) {
      checkStop();
      const want = row.credits[col];
      if (want == null || (col !== "final" && failed.has(col))) continue;
      const field = col === "final" ? "credit" : `${colName(col)} credit`;
      const box = doc.getElementById(cgCreditId(col, 1, n));
      if (!box) blank(row.name, field, `Common App's ${plan.scheduleStem} schedule has no ${colName(col)} credit box`);
      else typeExact(box, want, field);
    }
  }
}

function stopText(e: unknown, dialogOpen: boolean): string {
  const tail = dialogOpen ? ` ${NOT_SAVED}` : "";
  if (e instanceof Unreachable) return e.message;
  if (e instanceof StopRequested) return `Stopped.${tail}`;
  const detail = e instanceof Error ? e.message : String(e);
  return `Common App's page changed (${detail}).${tail}`;
}

/** What is already on this grade: the names of its non-empty rows. Opens the dialog when the button says "Edit" and leaves it open for fillCgGrade. */
export async function inspectCgGrade(grade: CgGradeKey, doc: Document = document): Promise<{ existing: string[] }> {
  try {
    await reachGradePage(doc, grade);
    if (!cgDialog(doc)) {
      const btn = doc.getElementById("addCG");
      if (!btn || !isShown(btn) || !/^\s*edit\b/i.test(btn.textContent ?? "")) return { existing: [] };
      await openDialog(doc, grade);
    }
    return { existing: cgRows(doc).filter((r) => !r.blank).map((r) => r.name) };
  } catch (e) {
    throw new Error(stopText(e, false));
  }
}

/** Fills one grade: Replace removes rows 2.. and overwrites row 1; Keep adds only courses whose name is not there yet, into empty rows first.
 *  Presses the dialog's Continue only when nothing failed. */
export async function fillCgGrade(plan: CgGradePlan, mode: "replace" | "keep", doc: Document = document): Promise<PageResult> {
  resetStop();
  const blanks: Skipped[] = [...plan.skipped];
  const blank = (course: string, field: string, reason: string) => blanks.push({ where: plan.grade, course, field, reason });
  const notes: string[] = [];
  let filled = 0;
  /** The page result; `notes` only when there are any. */
  const result = (stoppedReason?: string): PageResult => ({ filled, blanks, ...(notes.length ? { notes } : {}), ...(stoppedReason ? { stoppedReason } : {}) });
  if (!plan.rows.length) return result();
  try {
    await reachGradePage(doc, plan.grade);
    await answerYesIfAsked(doc, plan.grade, notes); // Ruling K: only reached with rows to fill
    await openDialog(doc, plan.grade);

    const existing = cgRows(doc).filter((r) => !r.blank);
    if (mode === "keep" && existing.length) {
      const why = headerMismatch(doc, plan);
      if (why) {
        blank("", "grade", `${why} ${LEFT_OPEN}`);
        return result();
      }
    }
    if (!(await setSchoolAndYear(doc, plan, blank))) return result();
    if (mode === "replace") for (const r of cgRows(doc).filter((x) => x.n > 1).sort((a, b) => b.n - a.n)) await removeRow(doc, r.n);
    await setScaleAndSchedule(doc, plan);

    const toFill = mode === "keep" ? rowsToAdd(plan.rows, existing.map((r) => r.name)) : plan.rows;
    const slots = mode === "keep" ? cgRows(doc).filter((r) => r.blank).map((r) => r.n) : [1];
    for (const row of toFill) {
      checkStop();
      const n = slots.shift() ?? (await addRow(doc));
      await fillRow(doc, plan, row, n, mode === "replace" && n === 1, blank);
      filled++;
    }
    // Empty rows left over (a new dialog starts with 2): remove from the bottom so numbers above stay put. Row 1 cannot be removed.
    for (const n of slots.filter((x) => x > 1).sort((a, b) => b - a)) await removeRow(doc, n);

    checkStop();
    const cont = dialogButton(doc, /^continue\b/i);
    if (!cont) throw new PageChanged("no Continue button in the dialog");
    click(cont);
    try {
      await waitFor(() => !cgDialog(doc), { timeoutMs: TIMING.saveMs });
    } catch {
      return result("Common App did not close the dialog after Continue: read its messages, then press Continue yourself.");
    }
    return result();
  } catch (e) {
    return result(stopText(e, !!cgDialog(doc)));
  }
}
