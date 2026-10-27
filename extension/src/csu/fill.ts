// Fills Cal State Apply's High School Coursework (React + MUI) from a CsuSchoolPlan. Facts: docs/superpowers/research/2026-10-27-portal-dom.md §2.
// The page has two inputs with the same id while a drawer is open, so every lookup is scoped to the top drawer. Each course is saved
// with the drawer's own Save; nothing else is pressed ("I'm Done Adding High School Courses", Continue and Submit stay the student's).

import { csuGradeLevelLabel, csuGradeLevelOption } from "../../../web/lib/csu-labels.ts";
import type { CsuRow } from "../../../web/lib/csu-fill.ts";
import { bestSchoolMatch, codeInText } from "../../../web/lib/school-match.ts";

export const CSU_TIMING = { stepMs: 100, listMs: 4000, drawerMs: 8000 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => a.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim() === b.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

export class CsuStop extends Error {}

function fire(el: Element, type: string, init: Record<string, unknown> = {}): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = (type.startsWith("mouse") || type === "click" ? view.MouseEvent : type.startsWith("key") ? view.KeyboardEvent : view.Event) ?? view.Event ?? Event;
  el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, ...init } as EventInit));
}

async function until<T>(probe: () => T | null | undefined | false, ms: number, what: string): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = probe();
    if (v) return v;
    if (Date.now() - start >= ms) throw new CsuStop(what);
    await sleep(CSU_TIMING.stepMs);
  }
}

/** Sets a React-controlled input: the prototype's setter (React's own value tracker then sees a change), then an input event. */
function setReactValue(input: HTMLInputElement, value: string): void {
  const view = (input.ownerDocument.defaultView ?? globalThis) as unknown as { HTMLInputElement: typeof HTMLInputElement };
  const setter = Object.getOwnPropertyDescriptor(view.HTMLInputElement.prototype, "value")?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  fire(input, "input");
}

/** The drawer on top (the course form, its grade-level sub-form or the course list); never the cookie dialog. */
export function topDrawer(doc: Document): Element | null {
  const drawers = [...doc.querySelectorAll(".MuiDrawer-root")].filter((d) => !/cky/.test(d.className));
  return drawers[drawers.length - 1] ?? null;
}

export function onCourseworkPage(doc: Document): boolean {
  return [...doc.querySelectorAll("main h1, main h2, h1, h2")].some((h) => text(h) === "High School Coursework");
}

/** The school's "Add course" / "N Courses" button on the coursework page. Matches the school's name as Cal State Apply shows it (upper case). */
export function schoolButton(doc: Document, schoolName: string, schoolCode?: string): HTMLElement {
  const buttons = [...doc.querySelectorAll("main button")].filter((b) => /^(add course|\d+ courses?)$/i.test(text(b)));
  /** The text of the button's school card: its nearest ancestor (up to 6 levels) that holds no other school's button. */
  const cardText = (b: Element): string => {
    let el: Element | null = b;
    for (let i = 0; i < 6 && el?.parentElement; i++) {
      const up: Element = el.parentElement;
      if (buttons.some((o) => o !== b && up.contains(o))) break;
      el = up;
    }
    // Each text node separately: textContent runs the name into the next line ("...LINKOU CMPPORTLAND").
    const parts: string[] = [];
    const walk = (n: Node) => (n.nodeType === 3 ? parts.push(n.textContent ?? "") : n.childNodes.forEach(walk));
    if (el) walk(el);
    return parts.join(" ").replace(/\s+/g, " ").trim();
  };
  // A card holds the school's name (in Cal State Apply's own spelling) plus its city and dates: matched by code, else word by word.
  const byCode = schoolCode ? buttons.filter((b) => codeInText(schoolCode, cardText(b))) : [];
  if (byCode.length === 1) return byCode[0] as HTMLElement;
  const named = bestSchoolMatch(buttons, { name: schoolName }, (b) => ({ name: cardText(b) }));
  if (named) return named as HTMLElement;
  if (buttons.length === 1) return buttons[0] as HTMLElement;
  throw new CsuStop(`Could not tell which school on Cal State Apply is "${schoolName}". Add courses for that school by hand, or add its school code in the tracker.`);
}

/** Course titles already on the school (read from its course list drawer, which this opens and leaves open). */
export async function existingTitles(doc: Document, schoolName: string, schoolCode?: string): Promise<string[]> {
  const btn = schoolButton(doc, schoolName, schoolCode);
  if (/^add course$/i.test(text(btn))) return [];
  btn.click();
  const drawer = await until(() => {
    const d = topDrawer(doc);
    return d && /High School Courses/.test(text(d)) ? d : null;
  }, CSU_TIMING.drawerMs, "Cal State Apply did not open the school's course list");
  return [...drawer.querySelectorAll("tr")].flatMap((tr) => {
    const cells = tr.querySelectorAll("td");
    return cells.length ? [text(cells[0])] : [];
  });
}

/** The options of `input`'s own list (MUI links it with aria-controls = "<id>-listbox"); a list that is still closing is not this one's. */
const options = (input: HTMLInputElement): Element[] => {
  const doc = input.ownerDocument;
  const box = doc.getElementById(input.getAttribute("aria-controls") || `${input.id}-listbox`);
  return box ? [...box.querySelectorAll('[role="option"]')] : [];
};

/** Opens an MUI Autocomplete's list. A mousedown right after a drawer opens can be lost (seen live), so it is retried until options show. */
async function openAuto(input: HTMLInputElement, label: string): Promise<Element[]> {
  const start = Date.now();
  for (let tries = 0; ; tries++) {
    if (tries % 6 === 0) {
      input.blur();
      input.focus();
      fire(input, "mousedown");
    }
    const o = options(input);
    if (o.length) return o;
    if (Date.now() - start >= CSU_TIMING.listMs) throw new CsuStop(`Cal State Apply's ${label} list did not open`);
    await sleep(CSU_TIMING.stepMs);
  }
}

/** Opens an MUI Autocomplete and clicks the option reading exactly `value`. `action`: the option opens something instead of filling the box. */
async function pickAuto(input: HTMLInputElement, value: string, label: string, action = false): Promise<void> {
  await openAuto(input, label);
  const option = await until(() => options(input).find((o) => same(text(o), value)), CSU_TIMING.listMs, `"${value}" is not in Cal State Apply's ${label} list`);
  (option as HTMLElement).click();
  if (action) return;
  await until(() => same(input.value, value) || input.value.length > 0, CSU_TIMING.listMs, `Cal State Apply did not take "${value}" for ${label}`);
}

function field(drawer: Element, id: string, label: string): HTMLInputElement {
  const el = drawer.querySelector(`[id="${id}"]`) as HTMLInputElement | null;
  if (!el) throw new CsuStop(`Cal State Apply's ${label} box is not in the form`);
  return el;
}

function drawerButton(drawer: Element, label: string): HTMLElement {
  const b = [...drawer.querySelectorAll("button")].find((x) => same(text(x), label));
  if (!b) throw new CsuStop(`Cal State Apply's ${label} button is not in the form`);
  return b as HTMLElement;
}

/** Adds "9th Grade • 2023-2024" through the course form's "Add Grade Level" sub-form, then returns to the course form. */
async function addGradeLevel(doc: Document, row: CsuRow): Promise<void> {
  const course = topDrawer(doc)!;
  // "Add Grade Level" opens a sub-form and leaves the box empty (seen live).
  await pickAuto(field(course, "gradeLevelId", "Grade Level"), "Add Grade Level", "Grade Level", true);
  const sub = await until(() => {
    const d = topDrawer(doc);
    return d && d.querySelector('[id="yearId"]') ? d : null;
  }, CSU_TIMING.drawerMs, "Cal State Apply did not open the Add Grade Level form");
  await pickAuto(field(sub, "gradeLevelId", "Grade Level"), csuGradeLevelLabel(row.gradeLevel), "Grade Level");
  await pickAuto(field(sub, "yearId", "Year"), row.year, "Year");
  const summer = sub.querySelector('[id="includeSummer"]') as HTMLInputElement | null;
  if (row.summer && summer && !summer.checked) summer.click();
  drawerButton(sub, "Save").click();
  await until(() => !topDrawer(doc)?.querySelector('[id="yearId"]'), CSU_TIMING.drawerMs, "Cal State Apply did not save the grade level");
}

export type CsuCourseResult = { blanks: string[] };

/** With the course form open, fills `row` and presses Save. Returns the boxes left blank (then nothing is saved and the form stays open). */
export async function fillCsuCourse(doc: Document, row: CsuRow): Promise<CsuCourseResult> {
  const drawer = await until(() => {
    const d = topDrawer(doc);
    return d && d.querySelector('[id="gradeLevelId"]') && !d.querySelector('[id="yearId"]') ? d : null;
  }, CSU_TIMING.drawerMs, "Cal State Apply did not open the course form");
  if (row.summer) throw new CsuStop(`${row.name} is a summer course: Cal State Apply's summer grade levels were not seen yet, so add it by hand`);
  const levelOption = csuGradeLevelOption(row);
  const gl = field(drawer, "gradeLevelId", "Grade Level");
  const has = (await openAuto(gl, "Grade Level")).some((o) => same(text(o), levelOption));
  fire(gl, "keydown", { key: "Escape" });
  await sleep(200);
  if (!has) await addGradeLevel(doc, row);
  const form = topDrawer(doc)!;
  await pickAuto(field(form, "gradeLevelId", "Grade Level"), levelOption, "Grade Level");

  // Course Title is free text: typing offers the text itself as an option, which must be clicked to take.
  const title = field(form, "courseName", "Course Title");
  title.focus();
  setReactValue(title, row.name);
  const echo = await until(() => options(title).find((o) => same(text(o), row.name)), CSU_TIMING.listMs, `Cal State Apply did not offer the title "${row.name}"`);
  (echo as HTMLElement).click();

  const boxes = [...form.querySelectorAll('input[id^="highSchoolCourseGrades."]')] as HTMLInputElement[];
  if (boxes.length !== row.grades.length) throw new CsuStop(`Cal State Apply shows ${boxes.length} grade boxes; the tracker has ${row.grades.length} terms for ${row.name}. Check the school's Term Type`);
  const blanks: string[] = [];
  for (const [i, g] of row.grades.entries()) {
    const label = text(form.querySelector(`label[for="${boxes[i]!.id}"]`)) || `term ${i + 1}`;
    if (g == null) blanks.push(`${label} grade`);
    else await pickAuto(boxes[i]!, g, `${label} grade`);
  }
  if (blanks.length) return { blanks };
  // Course Type last: picking the title re-renders the form and cleared a radio chosen before it (seen live).
  const radio = [...form.querySelectorAll('input[name="courseTypeLkupId"]')].find((r) => same(text(r.closest("label")), row.courseType)) as HTMLInputElement | undefined;
  if (!radio) throw new CsuStop(`Cal State Apply has no Course Type "${row.courseType}"`);
  radio.click();
  if (!radio.checked) (radio.closest("label") as HTMLElement | null)?.click();
  await until(() => radio.checked, CSU_TIMING.listMs, `Cal State Apply did not take Course Type "${row.courseType}"`);
  drawerButton(form, "Save").click();
  await until(() => topDrawer(doc) !== form || !form.isConnected || !form.querySelector('[id="courseName"]'), CSU_TIMING.drawerMs, `Cal State Apply did not save ${row.name} (a required box may be empty)`);
  return { blanks };
}

/** Opens the course form for the school: from its course list drawer ("+ Add course") or straight from the page ("Add course"). */
export async function openCourseForm(doc: Document, schoolName: string, schoolCode?: string): Promise<void> {
  const top = topDrawer(doc);
  if (top && /High School Courses/.test(text(top))) {
    drawerButton(top, "Add Course").click();
  } else {
    schoolButton(doc, schoolName, schoolCode).click();
    await sleep(500);
    const d = topDrawer(doc);
    if (d && /High School Courses/.test(text(d))) drawerButton(d, "Add Course").click();
  }
  await until(() => topDrawer(doc)?.querySelector('[id="courseName"], [id="gradeLevelId"]'), CSU_TIMING.drawerMs, "Cal State Apply did not open the course form");
}
