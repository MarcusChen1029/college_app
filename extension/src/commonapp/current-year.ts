// Fills Education > Current or Most Recent Year Courses (/common/4/24) from a CurrentYearPlan. Facts (research note §2):
// ng-select fields located by their labels ("Course 3 subject"), never by id arithmetic; count (1-15) first, then the
// scheduling-system radio (changing it clears every schedule), then each course. Options are clicked on exact text, never
// type-ahead + Enter. The page saves only on Continue, which is pressed only when nothing failed.

import { matchStem, rowsToAdd, type CurrentYearPlan, type CurrentYearRow, type Skipped } from "../../../web/lib/commonapp-fill.ts";
import {
  checkStop,
  clearNg,
  click,
  isChecked,
  need,
  ngValues,
  PageChanged,
  resetStop,
  sameText,
  selectNgOption,
  setText,
  StopRequested,
  TIMING,
  waitFor,
  type PageResult,
} from "./dom.ts";
import { currentPath, CURRENT_YEAR_PATH } from "./pages.ts";

export type { PageResult } from "./dom.ts";

const MAX_COURSES = 15;
const norm = (s: string | null | undefined) => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

export type CyKind = "subject" | "name" | "level" | "schedule";

/** "Course n <kind>" field (ng-select combobox input, or the name textarea), found by its label; null when not on the page. */
export function cyField(doc: Document, n: number, kind: CyKind): HTMLElement | null {
  const want = `course ${n} ${kind}`;
  const label = [...doc.querySelectorAll("label[for]")].find((l) => norm(l.textContent) === want);
  return label ? doc.getElementById(label.getAttribute("for")!) : null;
}

/** The "How many courses would you like to report?" select's input. */
export function cyCountInput(doc: Document): HTMLElement | null {
  const label = [...doc.querySelectorAll("label[for]")].find((l) => norm(l.textContent).includes("how many courses"));
  return label ? doc.getElementById(label.getAttribute("for")!) : null;
}

/** The course scheduling system radios (Semester, Trimester, Quarter, Yearly). */
export function cyRadios(doc: Document): { input: HTMLInputElement; label: string; checked: boolean }[] {
  const group = [...doc.querySelectorAll("mat-radio-group")].find((g) => {
    const by = g.getAttribute("aria-labelledby");
    return by != null && norm(doc.getElementById(by)?.textContent).includes("scheduling system");
  });
  if (!group) return [];
  return [...group.querySelectorAll('input[type="radio"]')].map((input) => ({
    input: input as HTMLInputElement,
    label: (doc.querySelector(`label[for="${input.id}"]`)?.textContent ?? "").trim(),
    checked: isChecked(input),
  }));
}

/** The course count and, for courses 1..count, the name and whether the course is empty. */
export function readCurrentYear(doc: Document): { count: number; courses: { n: number; name: string; blank: boolean }[] } {
  const countInput = cyCountInput(doc);
  const count = countInput ? Number.parseInt(ngValues(countInput)[0] ?? "", 10) || 0 : 0;
  const courses = [];
  for (let n = 1; n <= count; n++) {
    const name = ((cyField(doc, n, "name") as HTMLTextAreaElement | null)?.value ?? "").trim();
    const has = (k: CyKind) => {
      const el = cyField(doc, n, k);
      return el ? ngValues(el).length > 0 : false;
    };
    courses.push({ n, name, blank: !name && !has("subject") && !has("level") && !has("schedule") });
  }
  return { count, courses };
}

class Unreachable extends Error {}

async function reachPage(doc: Document): Promise<void> {
  let path = "";
  try {
    await waitFor(() => {
      path = currentPath();
      return path === CURRENT_YEAR_PATH && cyCountInput(doc) ? true : null;
    }, { timeoutMs: TIMING.pageMs });
  } catch {
    if (path === CURRENT_YEAR_PATH) throw new PageChanged('no "How many courses would you like to report?" question');
    throw new Unreachable(`Not on the Current or Most Recent Year Courses page (Common App shows ${path || "another page"})`);
  }
}

async function fillCourse(doc: Document, row: CurrentYearRow, n: number, overwrite: boolean, blank: (course: string, field: string, reason: string) => void): Promise<void> {
  const field = (k: CyKind) => need(() => cyField(doc, n, k), `no "Course ${n} ${k}" field`);
  const pickSingle = async (el: HTMLElement, value: string | null, k: CyKind) => {
    if (value == null) {
      if (overwrite) await clearNg(el);
      return;
    }
    if (ngValues(el).some((v) => sameText(v, value))) return;
    if ((await selectNgOption(el, value)) === null) {
      blank(row.name, k, `'${value}' is not in Common App's list`);
      if (overwrite) await clearNg(el);
    }
  };

  await pickSingle(await field("subject"), row.subject, "subject");
  checkStop();
  const name = (await field("name")) as HTMLTextAreaElement;
  const max = Number(name.getAttribute("maxlength")) || Infinity;
  if (row.name.length > max) {
    blank(row.name, "name", `the name is longer than the ${max} characters Common App allows`);
    if (overwrite) setText(name, "");
  } else setText(name, row.name);
  await pickSingle(await field("level"), row.level, "level");

  // Schedule is a multi-select: exactly the one planned option (Ruling N); null -> left blank (the plan already reports why).
  const schedule = await field("schedule");
  if (overwrite) await clearNg(schedule, row.schedule);
  if (row.schedule != null && !ngValues(schedule).some((v) => sameText(v, row.schedule!)) && (await selectNgOption(schedule, row.schedule)) === null)
    blank(row.name, "schedule", `'${row.schedule}' is not in Common App's list`);
}

/** Names of the courses already on the page (non-empty courses within the count). */
export async function inspectCurrentYear(doc: Document = document): Promise<{ existing: string[] }> {
  try {
    await reachPage(doc);
  } catch (e) {
    throw new Error(e instanceof Unreachable ? e.message : `Common App's page changed (${(e as Error).message}).`);
  }
  return { existing: readCurrentYear(doc).courses.filter((c) => !c.blank).map((c) => c.name) };
}

/** Fills the page. Replace: courses 1..N become the plan's rows (count set to N). Keep: only rows whose name is not there yet, into empty
 *  courses first, then after the last one. Presses Continue (which saves and moves on) only when nothing failed. */
export async function fillCurrentYear(plan: CurrentYearPlan, mode: "replace" | "keep", doc: Document = document): Promise<PageResult> {
  resetStop();
  const blanks: Skipped[] = [...plan.skipped];
  const blank = (course: string, field: string, reason: string) => blanks.push({ where: "current", course, field, reason });
  let filled = 0;
  let changed = false;
  if (!plan.rows.length) return { filled, blanks };
  try {
    await reachPage(doc);
    const state = readCurrentYear(doc);
    const existing = state.courses.filter((c) => !c.blank);
    const toFill = mode === "keep" ? rowsToAdd(plan.rows, existing.map((c) => c.name)) : plan.rows;
    const slots = mode === "keep" ? state.courses.filter((c) => c.blank).map((c) => c.n) : [];
    let next = mode === "keep" ? state.count + 1 : 1;
    const assigned: { row: CurrentYearRow; n: number }[] = [];
    for (const row of toFill) {
      const n = slots.shift() ?? next++;
      if (n > MAX_COURSES) blank(row.name, "course", `Common App takes at most ${MAX_COURSES} courses here`);
      else assigned.push({ row, n });
    }
    if (!assigned.length) return { filled, blanks };
    const count = mode === "keep" ? Math.max(state.count, ...assigned.map((a) => a.n)) : assigned.length;

    // 1. Course count (creates the course fields).
    const countInput = cyCountInput(doc)!;
    if (state.count !== count) {
      changed = true;
      if ((await selectNgOption(countInput, String(count))) === null) throw new PageChanged(`the course count has no "${count}"`);
    }
    await need(() => cyField(doc, count, "subject"), `course ${count}'s fields did not appear`);

    // 2. Scheduling system (before any schedule: changing it clears them all).
    const radios = cyRadios(doc);
    const target = radios.find((r) => matchStem([r.label], plan.scheduleStem) !== null);
    if (!target) throw new PageChanged(`no "${plan.scheduleStem}" course scheduling system`);
    const current = radios.find((r) => r.checked);
    if (current?.input !== target.input) {
      if (mode === "keep" && existing.length && current)
        blank("", "scheduling system", `Common App already has '${current.label}' and the tracker has '${target.label}'. Kept, because changing it clears every course's schedule; schedules that do not fit are left blank.`);
      else {
        changed = true;
        click(target.input);
        await need(() => isChecked(target.input), "the course scheduling system did not change");
      }
    }

    // 3. Courses.
    for (const { row, n } of assigned) {
      checkStop();
      changed = true;
      await fillCourse(doc, row, n, mode === "replace", blank);
      filled++;
    }

    // 4. Continue saves and moves to the next page.
    checkStop();
    const cont = doc.getElementById("sectionContinue24") ?? ([...doc.querySelectorAll("main button")] as HTMLElement[]).find((b) => /^continue\b/i.test((b.textContent ?? "").trim())) ?? null;
    if (!cont) throw new PageChanged("no Continue button");
    click(cont);
    try {
      await waitFor(() => currentPath() !== CURRENT_YEAR_PATH, { timeoutMs: TIMING.saveMs });
    } catch {
      return { filled, blanks, stoppedReason: "Common App did not move on after Continue (a required box may be empty). Nothing on this page is saved yet: fill the blanks listed here and press Continue yourself." };
    }
    return { filled, blanks };
  } catch (e) {
    const tail = changed ? " Nothing on this page is saved yet: press Continue yourself to keep what was filled, or reload the page to discard it." : "";
    if (e instanceof Unreachable) return { filled, blanks, stoppedReason: e.message };
    if (e instanceof StopRequested) return { filled, blanks, stoppedReason: `Stopped.${tail}` };
    return { filled, blanks, stoppedReason: `Common App's page changed (${e instanceof Error ? e.message : String(e)}).${tail}` };
  }
}
