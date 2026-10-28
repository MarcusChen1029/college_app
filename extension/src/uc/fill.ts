// Fills the UC application's "Enter courses & grades" page for one grade level (/my-application/acadHistFrHighSchoolClasses/editClasses/<NN>/<id>)
// from a UcGradePlan, then presses "Save & continue" (which saves and goes to the grade's summary). Plain <select>s with stable ids
// (academics_hs_classes_add_<i>_subject / _class_title / _honors / _grade<n> / _subject_language_code), read live 2026-10-27.
// Courses already on the page are never changed; new ones go into empty rows, adding rows with "Add another course".

import { sameCourseName } from "../../../web/lib/course-names.ts";
import type { UcGradePlan, UcRow } from "../../../web/lib/uc-fill.ts";
import { pressSaveLater, saveButtonRefusal } from "../save-guard.ts";

export const UC_TIMING = { stepMs: 100, rowMs: 5000 };
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
const P = (i: number, f: string) => `academics_hs_classes_add_${i}_${f}`;

export class UcStop extends Error {}

function fire(el: Element, type: string): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = view.Event ?? Event;
  el.dispatchEvent(new Ctor(type, { bubbles: true }));
}

/** The grade level of the open "Enter courses & grades" page, or null on any other page. */
export function ucPageGrade(loc: { pathname: string }): number | null {
  const m = loc.pathname.match(/\/acadHistFrHighSchoolClasses\/editClasses\/(\d{2})\//);
  return m ? Number(m[1]) : null;
}

/** Row numbers on the page, in order. */
export function ucRowIndexes(doc: Document): number[] {
  return [...doc.querySelectorAll('select[id^="academics_hs_classes_add_"][id$="_subject"]')]
    .map((s) => Number(s.id.slice("academics_hs_classes_add_".length).split("_")[0]))
    .filter((n) => Number.isInteger(n));
}

const titleOf = (doc: Document, i: number) => ((doc.getElementById(P(i, "class_title")) as HTMLInputElement | null)?.value ?? "").trim();
const subjectOf = (doc: Document, i: number) => (doc.getElementById(P(i, "subject")) as HTMLSelectElement | null)?.value ?? "";

/** Course names already on the page (rows with a name). */
export function ucExistingNames(doc: Document): string[] {
  return ucRowIndexes(doc).map((i) => titleOf(doc, i)).filter(Boolean);
}

/** Picks the option whose value (when given) or text is exactly `want`; throws UcStop when it isn't there. */
function pick(doc: Document, id: string, want: { value?: string; text: string }, label: string): void {
  const sel = doc.getElementById(id) as HTMLSelectElement | null;
  if (!sel) throw new UcStop(`UC's ${label} box is not on the page`);
  const opts = [...sel.options];
  const i = want.value != null ? opts.findIndex((o) => o.value === want.value) : opts.findIndex((o) => key(o.text) === key(want.text));
  if (i < 0) throw new UcStop(`"${want.text}" is not in UC's ${label} list`);
  sel.selectedIndex = i;
  fire(sel, "input");
  fire(sel, "change");
}

async function emptyRow(doc: Document): Promise<number> {
  const free = ucRowIndexes(doc).find((i) => !titleOf(doc, i) && !subjectOf(doc, i));
  if (free != null) return free;
  const before = ucRowIndexes(doc).length;
  const add = doc.getElementById("addManualHSClass") as HTMLElement | null;
  if (!add) throw new UcStop("UC's Add another course link is not on the page");
  add.click();
  const start = Date.now();
  while (ucRowIndexes(doc).length <= before) {
    if (Date.now() - start > UC_TIMING.rowMs) throw new UcStop("UC did not add a course row");
    await sleep(UC_TIMING.stepMs);
  }
  return ucRowIndexes(doc).find((i) => !titleOf(doc, i) && !subjectOf(doc, i))!;
}

function fillRow(doc: Document, i: number, row: UcRow): void {
  pick(doc, P(i, "subject"), row.discipline!, "Subject Area/Course Category");
  const title = doc.getElementById(P(i, "class_title")) as HTMLInputElement | null;
  if (!title) throw new UcStop("UC's Course Name box is not on the page");
  title.focus?.();
  title.value = row.name;
  fire(title, "input");
  fire(title, "change");
  title.blur?.();
  pick(doc, P(i, "honors"), { text: row.honors }, "Honor Type");
  for (const [n, g] of row.grades.entries()) pick(doc, P(i, `grade${n + 1}`), { text: g! }, `Grade ${n + 1}`);
  // UC keeps hidden boxes for terms 3 and 4 on a Semester school (seen live): only a shown extra box means the term systems differ.
  const extra = doc.getElementById(P(i, `grade${row.grades.length + 1}`)) as HTMLElement | null;
  if (extra && extra.offsetParent !== null && extra.getClientRects().length > 0) throw new UcStop(`UC shows more grade boxes than the tracker has terms for ${row.name}: check the school's term system on UC`);
  if (row.language) pick(doc, P(i, "subject_language_code"), { text: row.language }, "Language");
}

export type UcFillResult = { added: string[]; skippedExisting: number; left: string[]; saving: boolean };

/** Adds the plan's new courses. A course with a box the tracker can't fill (subject, a grade) is left out and listed in `left`. Presses
 *  "Save & continue" only when at least one course was added. */
export async function fillUcPage(doc: Document, plan: UcGradePlan): Promise<UcFillResult> {
  // Courses already on the page, each matched at most once (a student may have typed a name a little differently: sameCourseName).
  const have = ucExistingNames(doc);
  const added: string[] = [];
  const left: string[] = [];
  let skippedExisting = 0;
  for (const row of plan.rows) {
    const at = have.findIndex((n) => sameCourseName(n, row.name));
    if (at >= 0) {
      have.splice(at, 1);
      skippedExisting++;
      continue;
    }
    if (!row.discipline || row.grades.some((g) => g == null) || (row.language === null && row.discipline.area === "Language Other Than English")) {
      left.push(row.name);
      continue;
    }
    const i = await emptyRow(doc);
    fillRow(doc, i, row);
    added.push(row.name);
  }
  if (!added.length) return { added, skippedExisting, left, saving: false };
  pressUcSave(doc);
  return { added, skippedExisting, left, saving: true };
}

/**
 * Presses "Save & continue", and only a button that reads like Save (save-guard.ts): UC's id for it is the short `save`, which proves
 * nothing about what the button does. Throws UcStop, pressing nothing, when it is missing or reads like a submit.
 */
export function pressUcSave(doc: Document): void {
  const save = doc.getElementById("save") as HTMLElement | null;
  if (!save) throw new UcStop("UC's Save & continue button is not on the page");
  const why = saveButtonRefusal(save);
  if (why) throw new UcStop(`Refused to press ${why}: the extension only presses Save & continue on UC and never submits anything`);
  pressSaveLater(save);
}

/** Course names on the grade's summary page after saving (its table's "Course name" column). */
export function ucSummaryNames(doc: Document): string[] {
  const table = [...doc.querySelectorAll("table")].find((t) => [...t.querySelectorAll("th")].some((th) => key(th.textContent ?? "") === "course name"));
  if (!table) return [];
  const col = [...table.querySelectorAll("th")].findIndex((th) => key(th.textContent ?? "") === "course name");
  return [...table.querySelectorAll("tr")].flatMap((tr) => {
    const td = tr.querySelectorAll("td");
    return td.length > col ? [(td[col]!.textContent ?? "").trim()] : [];
  });
}
