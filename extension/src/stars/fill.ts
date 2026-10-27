// Fills one course on STARS's international coursework page (EnterInternationalCoursework-yr-<endYear>.aspx) and presses Save Course,
// which posts the whole page. Facts: docs/superpowers/research/2026-10-27-portal-dom.md §1. Never touches Remove, Move, Continue or
// Review/Submit. Every pick is an exact option text; a missing option stops this course with a sentence for the report.

import type { StarsRow } from "../../../web/lib/stars-fill.ts";

export const STARS_TIMING = { stepMs: 100, listMs: 4000, postbackMs: 8000, settleMs: 1500, quietMs: 700 };

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

/** The coursework page's kind: a school outside the US ("EnterInternationalCoursework") or in the US ("EnterCoursework"), else null. */
export function starsPageKind(loc: { pathname: string }): "intl" | "us" | null {
  if (/\/srt\/EnterInternationalCoursework/i.test(loc.pathname)) return "intl";
  if (/\/srt\/EnterCoursework/i.test(loc.pathname)) return "us";
  return null;
}

/** The page's school year: the `yr` URL parameter (2024 = 2023-24; the file name's year differs on the US page), or null off the coursework page. */
export function starsPageYear(loc: { pathname: string; search: string }): number | null {
  if (!starsPageKind(loc)) return null;
  const yr = Number(new URLSearchParams(loc.search).get("yr"));
  return Number.isInteger(yr) && yr > 1990 ? yr : null;
}

/** Course names already saved for this year (the table's Course/Exam Name column; one row per term, so names repeat). */
export function starsExistingNames(doc: Document): string[] {
  const headers = [...doc.querySelectorAll("th")].map((th) => text(th));
  // "Course/Exam Name" on the international page, "Course Name" on the US page (both seen live).
  const col = headers.findIndex((h) => h === "Course/Exam Name" || h === "Course Name");
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

/**
 * Waits until STARS's form has had no DOM changes for `quietMs` (at most `postbackMs`). Picks start partial page updates that re-render
 * the boxes after them; a pick made before the update lands is thrown away (seen live: the Grading Scale update cleared both grades,
 * the credits and the name).
 */
export async function quiet(doc: Document): Promise<void> {
  const root = doc.getElementById("aspnetForm") ?? doc.body;
  const View = (doc.defaultView ?? globalThis) as unknown as { MutationObserver?: typeof MutationObserver };
  if (!View.MutationObserver || !root) return sleep(STARS_TIMING.quietMs);
  let last = Date.now();
  const obs = new View.MutationObserver(() => (last = Date.now()));
  obs.observe(root, { childList: true, subtree: true, attributes: true });
  const start = Date.now();
  try {
    while (Date.now() - last < STARS_TIMING.quietMs && Date.now() - start < STARS_TIMING.postbackMs) await sleep(STARS_TIMING.stepMs);
  } finally {
    obs.disconnect();
  }
}

/** Picks `value` in RadComboBox `name`: opens the list with its arrow, then clicks the li with exactly that text, and waits for STARS's update. */
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
    // A list that depends on an earlier pick (titles after the subject) can take a whole page update to arrive.
    STARS_TIMING.postbackMs,
    `"${value}" is not in STARS's ${label} list`,
  ).catch((e) => {
    throw new StarsStop(e instanceof Error ? e.message : String(e));
  });
  fire(li, "mouseover");
  fire(li, "mousedown");
  (li as HTMLElement).click();
  await until(() => radValue(doc, name) === value, STARS_TIMING.postbackMs, `STARS did not take "${value}" for ${label}`);
  await quiet(doc);
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
export async function fillStarsCourse(doc: Document, row: StarsRow, scale: string | null, language: string | null = null): Promise<StarsFillResult> {
  const blanks: string[] = [];
  // The US page requires the year's GPA, or the tick "I have not received an annual GPA", before any course saves (seen live). The tracker
  // has no per-year GPA, and the tick is a statement only the student can make.
  const yearGpa = doc.getElementById(ID("year_gpa")) as HTMLInputElement | null;
  const noGpa = doc.getElementById("no_annual_gpa") as HTMLInputElement | null;
  if (yearGpa && !yearGpa.value.trim() && !noGpa?.checked) {
    throw new StarsStop("STARS needs this year's GPA first: type it at the top of the page (or tick \"I have not received an annual GPA\" if that is true), then run again");
  }
  // Every pick, in page order. A pick can start a page update that resets boxes before AND after it (seen live: Proficiency Level and the
  // grades were cleared by later updates), so after filling, all of them are checked and re-applied.
  const picks: { name: string; value: string; label: string }[] = [];
  if (row.academicLevel) picks.push({ name: "academic_level", value: row.academicLevel, label: "Courses/Exams Were Taken in" });
  picks.push({ name: "subject_area", value: row.subject, label: "Subject Area" }, { name: "course_cd", value: row.title, label: "Course/Exam Content" });
  if (row.level) picks.push({ name: "course_level", value: row.level, label: "Proficiency Level" });
  else blanks.push("Proficiency Level");
  // International page: "Language of Instruction" is required and empty on a fresh page; STARS keeps the last one after a save.
  if (doc.getElementById(ID("course_language"))) {
    const shown = radValue(doc, "course_language");
    if (!shown || /^--/.test(shown)) {
      if (language) picks.push({ name: "course_language", value: language, label: "Language of Instruction" });
      else blanks.push("Language of Instruction");
    } else picks.push({ name: "course_language", value: shown, label: "Language of Instruction" });
  }
  picks.push({ name: "term", value: row.length, label: "Course Length" });
  for (const p of picks) await pickRad(doc, p.name, p.value, p.label);
  await until(() => doc.getElementById(`${ID("grade_1")}_Input`), STARS_TIMING.postbackMs, "STARS did not show the grade boxes");
  // Only the international page has a per-course scale; the US page uses the school's Grade Scale.
  if (doc.getElementById(ID("grade_scale_id"))) {
    if (scale) {
      picks.push({ name: "grade_scale_id", value: scale, label: "Grading Scale" });
      await pickRad(doc, "grade_scale_id", scale, "Grading Scale");
    } else blanks.push("Grading Scale");
  }
  for (const [i, box] of row.boxes.entries()) {
    if (!doc.getElementById(`${ID(`grade_${i + 1}`)}_Input`)) throw new StarsStop(`STARS shows fewer grade boxes than this course has terms (${row.boxes.length})`);
    if (!box.grade) blanks.push(`Grade ${i + 1}`);
  }
  await fillTail(doc, row);
  if (blanks.some((b) => b === "Grading Scale" || b === "Proficiency Level" || b === "Language of Instruction" || b.startsWith("Grade "))) return { saved: false, blanks };
  // Check everything once STARS settles; put back what an update reset, at most twice.
  for (let round = 0; ; round++) {
    await sleep(STARS_TIMING.settleMs);
    await quiet(doc);
    const wrongPicks = picks.filter((p) => radValue(doc, p.name) !== p.value);
    const wrong = [...wrongPicks.map((p) => p.label), ...wrongTail(doc, row)];
    if (!wrong.length) break;
    if (round === 2) throw new StarsStop(`STARS kept resetting ${wrong.join(", ")}; nothing was saved for this course`);
    for (const p of wrongPicks) await pickRad(doc, p.name, p.value, p.label);
    await fillTail(doc, row);
  }
  const save = doc.getElementById(ID("btn_submit")) as HTMLElement | null;
  if (!save) throw new StarsStop("STARS's Save Course button is not on the page");
  // Let the panel get the answer before the page posts and this script goes away.
  setTimeout(() => save.click(), 50);
  return { saved: true, blanks };
}

/** Grades, then credits, then the course name (every pick before them can reset them). */
async function fillTail(doc: Document, row: StarsRow): Promise<void> {
  for (const [i, box] of row.boxes.entries()) if (box.grade) await pickRad(doc, `grade_${i + 1}`, box.grade, `Grade ${i + 1}`);
  for (const [i, box] of row.boxes.entries()) if (box.credit != null) typeRad(doc, `units_${i + 1}`, box.credit);
  typeRad(doc, "exact_course_title", row.name);
  await quiet(doc);
}

/** Which of the course's grades, credits and name the page does not show (after an update reset them). */
function wrongTail(doc: Document, row: StarsRow): string[] {
  const out: string[] = [];
  for (const [i, box] of row.boxes.entries()) {
    if (box.grade && radValue(doc, `grade_${i + 1}`) !== box.grade) out.push(`grade ${i + 1}`);
    const shown = (doc.getElementById(ID(`units_${i + 1}`)) as HTMLInputElement | null)?.value ?? "";
    if (box.credit != null && Number(shown) !== Number(box.credit)) out.push(`credit ${i + 1}`);
  }
  if ((doc.getElementById(ID("exact_course_title")) as HTMLInputElement | null)?.value !== row.name) out.push("course name");
  return out;
}

/** STARS's own messages on the page: visible validators ("Required") and open alert dialogs. */
export function starsErrors(doc: Document): string[] {
  const out: string[] = [];
  for (const el of doc.querySelectorAll('[id^="ctl00_mainContent_v_"], .rwDialog')) {
    const t = text(el);
    const r = (el as HTMLElement).getBoundingClientRect?.();
    if (t && (!r || r.height > 0)) out.push(el.id.startsWith("ctl00_mainContent_v_") ? `${el.id.slice("ctl00_mainContent_v_".length)}: ${t}` : t.slice(0, 200));
  }
  return out;
}
