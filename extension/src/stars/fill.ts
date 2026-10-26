// Fills one course on STARS's international coursework page (EnterInternationalCoursework-yr-<endYear>.aspx) and presses Save Course,
// which posts the whole page. Facts: docs/superpowers/research/2026-10-27-portal-dom.md §1. Never touches Remove, Move, Continue or
// Review/Submit. Every pick is an exact option text; a missing option stops this course with a sentence for the report.

import type { StarsRow } from "../../../web/lib/stars-fill.ts";

export const STARS_TIMING = { stepMs: 100, listMs: 4000, postbackMs: 8000 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const ID = (name: string) => `ctl00_mainContent_${name}`;

export class StarsStop extends Error {}

function fire(el: Element, type: string): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = (type.startsWith("mouse") || type === "click" ? view.MouseEvent : type.startsWith("focus") || type === "blur" ? view.FocusEvent : view.Event) ?? view.Event ?? Event;
  el.dispatchEvent(new Ctor(type, { bubbles: type !== "focus" && type !== "blur", cancelable: true } as EventInit));
}

async function until<T>(probe: () => T | null | undefined | false, ms: number, what: string): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() - start >= ms) throw new StarsStop(what);
    await sleep(STARS_TIMING.stepMs);
  }
}

/** The page's school year: the `yr` URL parameter (2024 = 2023-24), or null when this is not the coursework page. */
export function starsPageYear(loc: { pathname: string; search: string }): number | null {
  if (!/\/srt\/EnterInternationalCoursework/i.test(loc.pathname)) return null;
  const yr = Number(new URLSearchParams(loc.search).get("yr"));
  return Number.isInteger(yr) && yr > 1990 ? yr : null;
}

/** Course names already saved for this year (the table's Course/Exam Name column; one row per term, so names repeat). */
export function starsExistingNames(doc: Document): string[] {
  const headers = [...doc.querySelectorAll("th")].map((th) => text(th));
  const col = headers.findIndex((h) => h === "Course/Exam Name");
  if (col < 0) return [];
  const table = doc.querySelectorAll("th")[col]!.closest("table")!;
  return [...table.querySelectorAll("tr")].flatMap((tr) => {
    const cells = tr.querySelectorAll("td");
    return cells.length > col && tr.querySelector('input[name$="delId"]') ? [text(cells[col])] : [];
  });
}

/** A Telerik RadComboBox's shown value. */
export function radValue(doc: Document, name: string): string {
  return (doc.getElementById(`${ID(name)}_Input`) as HTMLInputElement | null)?.value ?? "";
}

/** Picks `value` in RadComboBox `name`: opens the list with its arrow, then clicks the li with exactly that text. */
export async function pickRad(doc: Document, name: string, value: string, label: string): Promise<void> {
  const box = doc.getElementById(ID(name));
  if (!box) throw new StarsStop(`STARS's ${label} box is not on the page`);
  if (radValue(doc, name) === value) return;
  const arrow = box.querySelector(".rcbActionButton, .rcbArrowCell a");
  if (arrow) {
    fire(arrow, "mousedown");
    (arrow as HTMLElement).click();
  }
  const li = await until(
    () => [...doc.querySelectorAll(`#${ID(name)}_DropDown li`)].find((l) => text(l) === value),
    STARS_TIMING.listMs,
    `"${value}" is not in STARS's ${label} list`,
  ).catch((e) => {
    throw new StarsStop(e instanceof Error ? e.message : String(e));
  });
  fire(li, "mouseover");
  fire(li, "mousedown");
  (li as HTMLElement).click();
  await until(() => radValue(doc, name) === value, STARS_TIMING.postbackMs, `STARS did not take "${value}" for ${label}`);
}

/** Types into a Telerik text or number box; the blur makes Telerik store it (without it the hidden value stays empty). */
export function typeRad(doc: Document, name: string, value: string): void {
  const input = doc.getElementById(ID(name)) as HTMLInputElement | null;
  if (!input) throw new StarsStop(`STARS's ${name} box is not on the page`);
  input.focus?.();
  fire(input, "focus");
  input.value = value;
  fire(input, "input");
  fire(input, "change");
  fire(input, "blur");
  fire(input, "focusout");
}

export type StarsFillResult = { saved: boolean; blanks: string[] };

/**
 * Fills the add-course form from `row` with Grading Scale `scale` and presses Save Course. Boxes whose value is null are left as STARS
 * has them (and listed in blanks). Throws StarsStop with the reason when a required pick is impossible; nothing is saved then.
 */
export async function fillStarsCourse(doc: Document, row: StarsRow, scale: string | null): Promise<StarsFillResult> {
  const blanks: string[] = [];
  await pickRad(doc, "academic_level", row.academicLevel, "Courses/Exams Were Taken in");
  await pickRad(doc, "subject_area", row.subject, "Subject Area");
  await pickRad(doc, "course_cd", row.title, "Course/Exam Content");
  if (row.level) await pickRad(doc, "course_level", row.level, "Proficiency Level");
  else blanks.push("Proficiency Level");
  await pickRad(doc, "term", row.length, "Course Length");
  await until(() => doc.getElementById(`${ID("grade_1")}_Input`), STARS_TIMING.postbackMs, "STARS did not show the grade boxes");
  if (scale) await pickRad(doc, "grade_scale_id", scale, "Grading Scale");
  else blanks.push("Grading Scale");
  for (const [i, box] of row.boxes.entries()) {
    const n = i + 1;
    if (!doc.getElementById(`${ID(`grade_${n}`)}_Input`)) throw new StarsStop(`STARS shows fewer grade boxes than this course has terms (${row.boxes.length})`);
    if (box.grade) await pickRad(doc, `grade_${n}`, box.grade, `Grade ${n}`);
    else blanks.push(`Grade ${n}`);
  }
  // Last: every pick above can post back and reset the name box to the generic title (seen live), so typed boxes go in after them.
  for (const [i, box] of row.boxes.entries()) if (box.credit != null) typeRad(doc, `units_${i + 1}`, box.credit);
  typeRad(doc, "exact_course_title", row.name);
  const name = (doc.getElementById(ID("exact_course_title")) as HTMLInputElement | null)?.value ?? "";
  if (name !== row.name) throw new StarsStop(`STARS did not keep the course name "${row.name}"`);
  for (const [i, box] of row.boxes.entries()) {
    const shown = (doc.getElementById(ID(`units_${i + 1}`)) as HTMLInputElement | null)?.value ?? "";
    if (box.credit != null && Number(shown) !== Number(box.credit)) throw new StarsStop(`STARS did not keep the credit ${box.credit} for term ${i + 1}`);
  }
  if (blanks.some((b) => b === "Grading Scale" || b === "Proficiency Level" || b.startsWith("Grade "))) return { saved: false, blanks };
  const save = doc.getElementById(ID("btn_submit")) as HTMLElement | null;
  if (!save) throw new StarsStop("STARS's Save Course button is not on the page");
  // Let the panel get the answer before the page posts and this script goes away.
  setTimeout(() => save.click(), 50);
  return { saved: true, blanks };
}
