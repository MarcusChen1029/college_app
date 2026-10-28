// Fills Common App "Activities and experiences" (/common/7/232) and Education > "Honors" (/common/4/25) from a CaPagePlan
// (web/lib/activities-fill.ts). Facts: docs/superpowers/research/2026-10-27-portal-dom.md §6 and §8. Slots are found by their legend
// ("Activity 3"), questions by their label inside that slot (titles and dates repeat in every slot), never by id arithmetic. Remove only
// lowers the counter and a re-added slot shows its old answers again, so every question of every slot the filler touches is written, a
// blank as a clear. "Add another" (and any in-app navigation) saves the page; Continue is pressed only when every answer went in and no
// written control is marked ng-invalid (Common App silently leaves those out of the save). Never navigates.

import { CA_PAGE_LIMIT, caQuestions, keepRoom, type CaAnswer, type CaPage, type CaPagePlan, type CaSlotPlan } from "../../../web/lib/activities-fill.ts";
import type { FillMode } from "../runner.ts";
import {
  checkStop,
  clearNg,
  click,
  isChecked,
  isShown,
  need,
  ngValues,
  PageChanged,
  pressEscape,
  resetStop,
  sameText,
  selectNgOption,
  setText,
  StopRequested,
  TIMING,
  waitFor,
  type PageResult,
} from "./dom.ts";
import { CA_GATE_YES, CA_PAGE_FACTS, currentPath } from "./pages.ts";

const PAGE_TITLE: Record<CaPage, string> = { activities: "Activities and experiences", honors: "Honors" };

const squash = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const norm = (s: string | null | undefined) => squash(s).toLowerCase();
/** Shown on the page: not inside [hidden] and laid out with a height (a hidden slot or question still holds its old answers). */
const visible = (el: Element) => !el.closest("[hidden]") && isShown(el);

// ---------- slots ----------

type Slot = { n: number; el: Element };

/** Every slot of the page (shown or not), by number, from its legend "<noun> N". */
function allSlots(doc: Document, page: CaPage): Slot[] {
  const f = CA_PAGE_FACTS[page];
  const re = new RegExp(`^${f.noun} (\\d+)$`, "i");
  return [...doc.querySelectorAll(`ca-add-another-sub-group[id^="subGroup${f.counter}_"]`)]
    .flatMap((el) => {
      const m = re.exec(squash(el.querySelector("legend")?.textContent));
      return m ? [{ n: Number(m[1]), el }] : [];
    })
    .sort((a, b) => a.n - b.n);
}

const shownSlots = (doc: Document, page: CaPage) => allSlots(doc, page).filter((s) => visible(s.el));
const lastShown = (doc: Document, page: CaPage) => Math.max(0, ...shownSlots(doc, page).map((s) => s.n));

// ---------- questions ----------

const CONTROL: Record<CaAnswer["kind"], string> = {
  select: "ng-select input",
  text: "textarea, input[type='text'], input:not([type])",
  date: "textarea, input[type='text'], input:not([type])",
  radio: "input[type='radio']",
  checks: "input[type='checkbox']",
};
const FORM_CONTROL = "textarea, input, select";
const LABELISH = "label, legend, mat-label, span, p, div, strong, h2, h3, h4, h5, h6";

/** label = the question's own text; controls = its input(s); block = the smallest element holding both. */
type Question = { label: Element; controls: Element[]; block: Element };

/** The element in the slot with the shortest text containing `question` that is not an option label, a button or a control. */
function findLabel(slot: Element, question: string): Element | null {
  const doc = slot.ownerDocument;
  const want = norm(question);
  const legend = slot.querySelector("legend");
  let best: Element | null = null;
  let bestLen = Infinity;
  for (const el of slot.querySelectorAll(LABELISH)) {
    if (legend && legend.contains(el)) continue;
    if (el.closest("ng-dropdown-panel, mat-radio-button, mat-checkbox, button") || el.querySelector(FORM_CONTROL)) continue;
    const target = el.matches("label[for]") ? doc.getElementById(el.getAttribute("for")!) : null;
    if (target?.matches("input[type='radio'], input[type='checkbox']")) continue;
    const t = norm(el.textContent);
    if (!t.includes(want) || t.length >= bestLen) continue;
    best = el;
    bestLen = t.length;
  }
  return best;
}

function commonAncestor(a: Element, b: Element): Element {
  let e: Element | null = a;
  while (e && !e.contains(b)) e = e.parentElement;
  return e ?? a;
}

/** A question of one slot, found by its label: the label's `for`, then aria-labelledby, then the nearest element around it with a control. */
function findQuestion(slot: Element, question: string, kind: CaAnswer["kind"]): Question | null {
  const label = findLabel(slot, question);
  if (!label) return null;
  const sel = CONTROL[kind];
  const pick = (root: Element | null): Element[] =>
    root ? [root, ...root.querySelectorAll(sel)].filter((c) => c.matches(sel) && slot.contains(c) && (kind === "select" || !c.closest("ng-select"))) : [];
  let controls: Element[] = [];
  const forId = label.getAttribute("for");
  if (forId) controls = pick(slot.ownerDocument.getElementById(forId));
  if (!controls.length && label.id) controls = pick(slot.querySelector(`[aria-labelledby~="${label.id}"]`));
  for (let a = label.parentElement; !controls.length && a && a !== slot && slot.contains(a); a = a.parentElement) controls = pick(a);
  if (!controls.length) return null;
  if (kind === "select" || kind === "text" || kind === "date") controls = controls.slice(0, 1);
  return { label, controls, block: commonAncestor(label, controls[0]!) };
}

const labelText = (q: Question) => squash(q.label.textContent);

/** A radio's or checkbox's own label ("Yes", "10th grade"). */
function optionLabel(input: Element): string {
  const byFor = input.id ? input.ownerDocument.querySelector(`label[for="${input.id}"]`) : null;
  return squash((byFor ?? input.closest("mat-radio-button, mat-checkbox, label"))?.textContent);
}

/** What the question shows ("" / [] when it is hidden or not on the page). */
function shownValue(q: Question | null, kind: CaAnswer["kind"]): string | string[] {
  const on = q !== null && visible(q.label);
  if (kind === "checks") return on ? q.controls.filter(isChecked).map(optionLabel) : [];
  if (!on) return "";
  if (kind === "select") return ngValues(q.controls[0]!)[0] ?? "";
  if (kind === "radio") {
    const c = q.controls.find(isChecked);
    return c ? optionLabel(c) : "";
  }
  return squash((q.controls[0] as HTMLInputElement).value);
}

/** True when the control, or an element between it and the question's block, carries Angular's ng-invalid. The block itself counts only
 *  when it holds no other question's control (a slot-wide form group is invalid whenever any required box is blank). */
function invalid(q: Question): boolean {
  const own = [...q.block.querySelectorAll(FORM_CONTROL)].every((c) => q.controls.some((k) => k === c || k.contains(c) || c.contains(k)));
  for (const c of q.controls) {
    for (let e: Element | null = c; e; e = e.parentElement) {
      if (e === q.block) {
        if (own && e.classList.contains("ng-invalid")) return true;
        break;
      }
      if (e.classList.contains("ng-invalid")) return true;
    }
  }
  return false;
}

// ---------- reading ----------

type Row = Record<string, string | string[]>;

function readSlot(slot: Element, page: CaPage): Row {
  const row: Row = {};
  for (const { question, kind } of caQuestions(page)) row[question] = shownValue(findQuestion(slot, question, kind), kind);
  return row;
}

const answered = (row: Row) => Object.values(row).some((v) => (Array.isArray(v) ? v.length > 0 : v !== ""));

/** How an entry already on the page is named: activity = organization, else the start of the description, else the type; honor = title. */
function entryLabel(page: CaPage, row: Row, n: number): string {
  const s = (q: string) => squash(row[q] as string | undefined);
  if (page === "honors") return s("title") || `Honors ${n}`;
  const d = s("Describe this activity");
  const start = d.length > 40 ? `${d.slice(0, 40).replace(/\s+\S*$/, "")}…` : d;
  return s("Organization or group") || start || s("Activity or experience type") || `Activity ${n}`;
}

/** One name per shown slot that has any answer. */
export function inspectCaPage(doc: Document, page: CaPage): { existing: string[] } {
  return {
    existing: shownSlots(doc, page).flatMap(({ n, el }) => {
      const row = readSlot(el, page);
      return answered(row) ? [entryLabel(page, row, n)] : [];
    }),
  };
}

/** Per shown slot (in order): question (the plan's `question`) -> what the page shows; a hidden or absent question reads "" ([] for checks). */
export function readCaPage(doc: Document, page: CaPage): Row[] {
  return shownSlots(doc, page).map(({ el }) => readSlot(el, page));
}

// ---------- writing ----------

/** A long ng-select list may render only part of its options: type the text to filter it, then click the exact option (never Enter). */
async function filterAndPick(input: Element, wanted: string): Promise<string | null> {
  checkStop();
  const ng = input.closest("ng-select")!;
  const box = input as HTMLInputElement;
  const before = box.value;
  const view = (input.ownerDocument.defaultView ?? globalThis) as unknown as { Event: typeof Event };
  box.focus?.();
  box.value = wanted;
  box.dispatchEvent(new view.Event("input", { bubbles: true }));
  const optText = (o: Element) => squash((o.querySelector(".ng-option-label") ?? o).textContent);
  let opt: Element | undefined;
  try {
    opt = await waitFor(() => [...(ng.querySelector("ng-dropdown-panel")?.querySelectorAll(".ng-option") ?? [])].find((o) => sameText(optText(o), wanted)), { timeoutMs: TIMING.panelMs });
  } catch {
    pressEscape(input);
    if (box.value === wanted) box.value = before;
    return null;
  }
  const pick = optText(opt);
  click(opt);
  await need(() => !ng.querySelector("ng-dropdown-panel") && ngValues(input).some((v) => sameText(v, pick)), `"${input.id}" does not show "${pick}" after picking it`, TIMING.valueMs);
  return pick;
}

/** Empties a shown question: text "", ng-select Clear, the radio group's "Clear answer", every box unticked. */
async function clearAnswer(q: Question, kind: CaAnswer["kind"], where: string): Promise<void> {
  const c = q.controls[0]!;
  if (kind === "select") return clearNg(c);
  if (kind === "text" || kind === "date") {
    if ((c as HTMLInputElement).value !== "") setText(c as HTMLInputElement, "");
    return;
  }
  if (kind === "radio") {
    if (!q.controls.some(isChecked)) return;
    const qid = /^option_ques_(\d+)_/.exec(c.id)?.[1];
    const clear = (qid ? c.ownerDocument.getElementById(`clear_ques_${qid}`) : null) ??
      [...q.block.querySelectorAll("button")].find((b) => norm(b.textContent) === "clear answer");
    if (!clear) throw new PageChanged(`${where} has no "Clear answer" button`);
    click(clear);
    await need(() => !q.controls.some(isChecked), `${where} did not clear`);
    return;
  }
  for (const box of q.controls.filter(isChecked)) {
    click(box);
    await need(() => !isChecked(box), `${where} kept "${optionLabel(box)}" ticked`);
  }
}

/** Writes one answer; a value the page does not offer goes to `problems` (the run then stops before Continue). */
async function setAnswer(q: Question, ans: CaAnswer, where: string, problems: string[]): Promise<void> {
  const c = q.controls[0]!;
  if (ans.kind === "text" || ans.kind === "date") {
    if ((c as HTMLInputElement).value !== ans.value) setText(c as HTMLInputElement, ans.value as string);
    return;
  }
  if (ans.kind === "select") {
    const v = ans.value as string;
    if (ngValues(c).some((x) => sameText(x, v))) return;
    if ((await selectNgOption(c, v)) === null && (await filterAndPick(c, v)) === null) problems.push(`${where}: "${v}" is not in Common App's list`);
    return;
  }
  if (ans.kind === "radio") {
    const v = ans.value as string;
    const target = q.controls.find((r) => sameText(optionLabel(r), v));
    if (!target) {
      problems.push(`${where}: Common App has no "${v}" choice`);
      return;
    }
    if (!isChecked(target)) click(target);
    await need(() => isChecked(target), `${where} did not take "${v}"`);
    return;
  }
  const wanted = ans.value as string[];
  for (const w of wanted) if (!q.controls.some((b) => sameText(optionLabel(b), w))) problems.push(`${where}: Common App has no "${w}" box`);
  for (const box of q.controls) {
    const on = wanted.some((w) => sameText(optionLabel(box), w));
    if (isChecked(box) === on) continue;
    click(box);
    await need(() => isChecked(box) === on, `${where} did not ${on ? "tick" : "untick"} "${optionLabel(box)}"`);
  }
}

type Touched = { q: Question; where: string };

const isBlank = (ans: CaAnswer) => ans.value === null || (Array.isArray(ans.value) && !ans.value.length);

/**
 * Every answer of one slot. First a reverse pass clears every SHOWN question the plan leaves blank, children before their parents (end
 * date, still participating, start date, role, sport, ...): writing a parent first would hide the child with its stale value, and Common
 * App keeps a hidden question's value on the server. A child ALREADY hidden by its own stale parent (e.g. stale leadership "No" over a
 * stale role) is left alone: Common App ignores hidden questions, and the run never toggles a parent just to reach it (controller ruling,
 * Task 10 fix round 1). Then a forward pass in reveal order writes the values; a question with a value must be shown.
 */
async function writeSlot(slot: Element, page: CaPage, n: number, plan: CaSlotPlan, problems: string[], touched: Touched[]): Promise<void> {
  const noun = CA_PAGE_FACTS[page].noun;
  for (const ans of [...plan.answers].reverse()) {
    checkStop();
    if (!isBlank(ans)) continue;
    const q = findQuestion(slot, ans.question, ans.kind);
    if (q && visible(q.label)) await clearAnswer(q, ans.kind, `${noun} ${n} "${labelText(q)}"`);
  }
  for (const ans of plan.answers) {
    checkStop();
    if (isBlank(ans)) {
      const q = findQuestion(slot, ans.question, ans.kind);
      if (q && visible(q.label)) await clearAnswer(q, ans.kind, `${noun} ${n} "${labelText(q)}"`);
      continue;
    }
    const q = await need(() => {
      const found = findQuestion(slot, ans.question, ans.kind);
      return found && visible(found.label) ? found : null;
    }, `${noun} ${n} shows no "${ans.question}" question`);
    const where = `${noun} ${n} "${labelText(q)}"`;
    await setAnswer(q, ans, where, problems);
    touched.push({ q, where });
  }
}

/** Slot n, shown: presses "Add another" until it is. */
async function openSlot(doc: Document, page: CaPage, n: number): Promise<Element> {
  const f = CA_PAGE_FACTS[page];
  for (;;) {
    const slot = allSlots(doc, page).find((s) => s.n === n)?.el;
    if (slot && visible(slot)) return slot;
    const last = lastShown(doc, page);
    if (last >= n) throw new PageChanged(`${f.noun} ${n} is not shown although ${f.noun} ${last} is`);
    checkStop();
    const add = doc.getElementById(f.add);
    if (!add || !visible(add)) throw new PageChanged(`no "Add another" button for ${f.noun} ${last + 1}`);
    click(add);
    await need(() => lastShown(doc, page) > last, `"Add another" did not add ${f.noun} ${last + 1}`);
  }
}

/** Remove + confirm on slot n (never slot 1, which has no Remove). It only lowers the counter: the answers stay on Common App. */
async function removeSlot(doc: Document, page: CaPage, n: number): Promise<void> {
  checkStop();
  const noun = CA_PAGE_FACTS[page].noun;
  const remove = doc.querySelector(`button[aria-label="Remove ${noun} ${n} question(s)"]`);
  if (!remove) throw new PageChanged(`no Remove button on ${noun} ${n}`);
  click(remove);
  click(await need(() => doc.getElementById("alert_rc_r"), `the Remove confirmation for ${noun} ${n} did not open`));
  await need(() => {
    const slot = allSlots(doc, page).find((s) => s.n === n)?.el;
    return !slot || !visible(slot);
  }, `${noun} ${n} was not removed`);
}

class Unreachable extends Error {}

async function reachPage(doc: Document, page: CaPage): Promise<HTMLElement> {
  const f = CA_PAGE_FACTS[page];
  let path = "";
  try {
    return await waitFor(() => {
      path = currentPath();
      return path === f.path ? doc.getElementById(`option_ques_${f.gate}_${CA_GATE_YES}-input`) : null;
    }, { timeoutMs: TIMING.pageMs });
  } catch {
    if (path === f.path) throw new PageChanged(`no "report any ${f.what}?" question`);
    throw new Unreachable(`Not on the ${PAGE_TITLE[page]} page (Common App shows ${path || "another page"}).`);
  }
}

/** `firstSlot`: the portal slot the plan's first item went to (read-back compares readCaPage(...).slice(firstSlot - 1) with the plan). */
export type CaPageResult = PageResult & { firstSlot?: number };

/**
 * Fills the page. Replace: slots 1..M become the plan's items (slots added as needed), then surplus slots are removed from the end.
 * Keep: the items go after the `existing` entries, at most keepRoom of them. `filled` = slots written. Messages name the portal's slot.
 * After the first problem (e.g. an option the page lacks) no new slot is started and nothing is removed.
 */
export async function fillCaPage(doc: Document, plan: CaPagePlan, mode: FillMode, existing: number): Promise<CaPageResult> {
  resetStop();
  const page = plan.page;
  const f = CA_PAGE_FACTS[page];
  const limit = CA_PAGE_LIMIT[page];
  const notes: string[] = [];
  const problems: string[] = [];
  const touched: Touched[] = [];
  let filled = 0;
  let changed = false;
  let firstSlot: number | undefined;
  const result = (stoppedReason?: string): CaPageResult => ({
    filled,
    blanks: [],
    ...(firstSlot !== undefined ? { firstSlot } : {}),
    ...(notes.length ? { notes } : {}),
    ...(stoppedReason ? { stoppedReason } : {}),
  });
  if (!plan.slots.length) return result();
  try {
    // 1. The gate: Yes shows the slots.
    const yes = await reachPage(doc, page);
    if (!isChecked(yes)) {
      changed = true;
      click(yes);
      await need(() => isChecked(yes), `the "report any ${f.what}?" Yes did not take`);
      const gateLabel = squash(doc.getElementById(`label_ques_${f.gate}`)?.textContent) || `Would you like to report any ${f.what}?`;
      notes.push(`Answered "${gateLabel}" Yes.`);
    }
    await need(() => shownSlots(doc, page).length > 0, `no ${f.noun} 1 after answering Yes`);

    // 2. Which slots: replace = 1..M; keep = after the last entry, never past the page limit.
    let first = 1;
    let room = limit;
    if (mode === "keep") {
      const lastAnswered = Math.max(0, ...shownSlots(doc, page).filter((s) => answered(readSlot(s.el, page))).map((s) => s.n));
      first = Math.max(existing, lastAnswered) + 1;
      // A stale `existing` (more entries than slots shown) would re-show removed slots with old answers: stop instead.
      const shown = lastShown(doc, page);
      if (first > shown + 1) throw new PageChanged(`Common App shows ${shown} ${f.what} slots, fewer than the ${existing} entries counted before`);
      room = Math.min(keepRoom(page, existing), limit - first + 1);
    }
    const todo = plan.slots.slice(0, Math.max(0, room));
    const left = plan.slots.slice(todo.length);
    if (left.length) notes.push(`Not added, because Common App holds at most ${limit} ${f.what}: ${left.map((s) => s.label).join(", ")}.`);
    if (todo.length) firstSlot = first;

    // 3. Every answer of every slot written; after a problem no new slot is started.
    for (const [i, slotPlan] of todo.entries()) {
      if (problems.length) break;
      const n = first + i;
      changed = true;
      const slot = await openSlot(doc, page, n);
      await writeSlot(slot, page, n, slotPlan, problems, touched);
      filled++;
    }

    // 4. Replace: surplus slots removed from the end (not after a problem: the student looks at the page first).
    const removed: string[] = [];
    if (mode === "replace" && todo.length && !problems.length)
      for (let n = lastShown(doc, page); n > todo.length; n = lastShown(doc, page)) {
        await removeSlot(doc, page, n);
        removed.push(`${f.noun} ${n}`);
      }
    if (removed.length) notes.push(`Removed ${removed.reverse().join(", ")} from the end of the page.`);

    // 5. Nothing goes to Continue that Common App would silently drop.
    for (const t of touched) if (invalid(t.q)) problems.push(`${t.where} is marked not valid on the page, so Common App would not save it`);
    if (problems.length) return result(`${problems.join("; ")}. Continue was not pressed: fix this on the page, then press Continue yourself.`);

    checkStop();
    const cont = doc.getElementById(f.cont);
    if (!cont) throw new PageChanged("no Continue button");
    click(cont);
    try {
      await waitFor(() => currentPath() !== f.path, { timeoutMs: TIMING.saveMs });
    } catch {
      return result("Common App did not move on after Continue. Check the page for a message, then press Continue yourself.");
    }
    return result();
  } catch (e) {
    const tail = changed ? ' Continue was not pressed. Common App may already have saved part of this ("Add another" saves the page): check the page, then press Continue yourself.' : "";
    if (e instanceof Unreachable) return result(e.message);
    if (e instanceof StopRequested) return result(`Stopped.${tail}`);
    return result(`Common App's page changed (${e instanceof Error ? e.message : String(e)}).${tail}`);
  }
}
