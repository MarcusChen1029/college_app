// DOM helpers for driving Common App's Angular pages from the content script. Facts they rely on are in
// docs/superpowers/research/2026-10-27-commonapp-dom.md: C&G uses mat-select (options only exist while open, in a
// .cdk-overlay-pane, panel id "<selectId>-panel"); Current Year uses ng-select (options in ng-dropdown-panel .ng-option).
// Every pick is an exact matchOption match: never a "closest" value.

import { matchOption, type Skipped, type TermColumn } from "../../../web/lib/commonapp-fill.ts";

/** `notes`: things the filler changed on the page besides the courses (e.g. a "courses to report?" answer), for the report. */
export type PageResult = { filled: number; blanks: Skipped[]; notes?: string[]; stoppedReason?: string };

/** A locator failed: Common App's page is not what the recorded facts describe. The message names what was missing. */
export class PageChanged extends Error {
  constructor(detail: string) {
    super(detail);
    this.name = "PageChanged";
  }
}

/** The student pressed Stop; raised between fields. */
export class StopRequested extends Error {
  constructor() {
    super("stopped");
    this.name = "StopRequested";
  }
}

/** Waits, in ms. Mutable so tests can run fast. */
export const TIMING = { stepMs: 120, panelMs: 4000, valueMs: 4000, pageMs: 20000, saveMs: 20000 };

let stopFlag = false;
export function requestStop(): void {
  stopFlag = true;
}
export function resetStop(): void {
  stopFlag = false;
}
export function checkStop(): void {
  if (stopFlag) throw new StopRequested();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls `probe` until it returns something other than null/undefined/false. Rejects Error("timeout"). */
export async function waitFor<T>(probe: () => T | null | undefined | false, opts: { timeoutMs?: number; intervalMs?: number } = {}): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? TIMING.valueMs;
  const intervalMs = opts.intervalMs ?? TIMING.stepMs;
  const start = Date.now();
  for (;;) {
    const v = probe();
    if (v !== null && v !== undefined && v !== false) return v;
    if (Date.now() - start >= timeoutMs) throw new Error("timeout");
    await sleep(intervalMs);
  }
}

/** waitFor, but a timeout means the page changed: `what` says what was missing. */
export async function need<T>(probe: () => T | null | undefined | false, what: string, timeoutMs?: number): Promise<T> {
  try {
    return await waitFor(probe, { timeoutMs });
  } catch {
    throw new PageChanged(what);
  }
}

type CgField = "subject" | "courseName" | "level" | "credit" | "creditNA" | `grade${TermColumn}`;

/** Element id of a C&G dialog field for transcript t, course c. grade "final" -> gradeFinalControl_T1C3; credit -> the Final credit box. */
export function cgFieldId(field: CgField, t: number, c: number): string {
  const tc = `T${t}C${c}`;
  if (field === "creditNA") return `creditNA_${tc}-input`;
  if (field === "credit") return `creditFinalControl_${tc}`;
  if (field === "gradefinal") return `gradeFinalControl_${tc}`;
  return `${field}Control_${tc}`;
}

/** A term credit box (credit1..4 / creditFinal). */
export function cgCreditId(col: TermColumn, t: number, c: number): string {
  return col === "final" ? `creditFinalControl_T${t}C${c}` : `credit${col}Control_T${t}C${c}`;
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? "").trim();
export const CLEAR_SELECTION = "Clear selection";
const CLEAR = CLEAR_SELECTION;

function eventOf(el: Element, kind: "Event" | "KeyboardEvent" | "MouseEvent", type: string, init: Record<string, unknown>): Event {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = view[kind] ?? view.Event ?? Event;
  return new Ctor(type, init as EventInit);
}

/** Synthetic click (verified to work on mat-select triggers, mat-options and buttons). */
export function click(el: Element): void {
  (el as HTMLElement).click();
}

/** A checkbox or radio's state (the property in a browser; the attribute in a parsed fixture). */
export function isChecked(input: Element): boolean {
  const c = (input as HTMLInputElement).checked;
  return typeof c === "boolean" ? c : input.hasAttribute("checked");
}

export function isReadOnly(input: Element): boolean {
  const r = (input as HTMLInputElement).readOnly;
  return typeof r === "boolean" ? r : input.hasAttribute("readonly");
}

/** True unless the element is laid out with no height (Common App hides "Add Other Courses" that way). Unknown layout counts as shown. */
export function isShown(el: Element): boolean {
  if (typeof (el as HTMLElement).getBoundingClientRect !== "function") return true;
  return (el as HTMLElement).getBoundingClientRect().height > 0;
}

/** Sets a text box's value and fires input + change + blur, which Angular's forms listen to. */
export function setText(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  (input as HTMLElement).focus?.();
  input.value = value;
  input.dispatchEvent(eventOf(input, "Event", "input", { bubbles: true }));
  input.dispatchEvent(eventOf(input, "Event", "change", { bubbles: true }));
  input.dispatchEvent(eventOf(input, "Event", "blur", { bubbles: false }));
}

/** Escape keydown on an element (ng-select closes on it; mat-select only as a last resort, see closeMatPanel). */
export function pressEscape(el: Element): void {
  el.dispatchEvent(eventOf(el, "KeyboardEvent", "keydown", { bubbles: true, cancelable: true, key: "Escape", code: "Escape", keyCode: 27, which: 27 }));
}

// ---------- mat-select (Courses & Grades dialog) ----------

/** What a mat-select shows as chosen ("" when nothing is). */
export function matShownText(select: Element): string {
  return text(select.querySelector(".mat-mdc-select-value-text"));
}

const describe = (el: Element) => el.getAttribute("aria-label") || el.id || el.tagName.toLowerCase();

function matPanel(select: Element): Element | null {
  const doc = select.ownerDocument;
  const byId = select.id ? doc.getElementById(`${select.id}-panel`) : null;
  if (byId) return byId;
  const controls = select.getAttribute("aria-controls");
  return controls ? doc.getElementById(controls) : null;
}

const optionText = (o: Element) => text(o.querySelector(".mdc-list-item__primary-text") ?? o);

/** Texts of the options in the open mat-select list (the last .cdk-overlay-pane), without "Clear selection". */
export function readOverlayOptions(doc: Document): string[] {
  const panes = [...doc.querySelectorAll(".cdk-overlay-pane")].filter((p) => p.querySelector("mat-option"));
  const pane = panes[panes.length - 1];
  if (!pane) return [];
  return [...pane.querySelectorAll("mat-option")].map(optionText).filter((t) => t && t !== CLEAR);
}

async function openMatPanel(select: Element): Promise<Element> {
  const open = matPanel(select);
  if (open) return open;
  click(select.querySelector(".mat-mdc-select-trigger") ?? select);
  return need(() => matPanel(select), `the list for "${describe(select)}" did not open`, TIMING.panelMs);
}

/** Closes an open list without changing the value: re-click the chosen option, or "Clear selection" when nothing is chosen.
 *  Escape is the last resort only, because an Escape that misses the list would close (and so save) the whole dialog. */
async function closeMatPanel(select: Element, panel: Element): Promise<void> {
  const options = [...panel.querySelectorAll("mat-option")];
  const chosen = options.find((o) => o.getAttribute("aria-selected") === "true");
  const clear = options.find((o) => optionText(o) === CLEAR);
  if (chosen) click(chosen);
  else if (clear && !matShownText(select)) click(clear);
  else if (matPanel(select)) pressEscape(select);
  await need(() => !matPanel(select), `the list for "${describe(select)}" did not close`, TIMING.panelMs);
}

/** Equal as option texts (matchOption rules). */
export const sameText = (a: string, b: string): boolean => matchOption([a], b) !== null;

/** Opens the list, picks the option `choose` names, and confirms the select shows it. null = no option chosen (list closed unchanged). */
export async function chooseMatOption(select: Element, choose: (options: string[]) => string | null): Promise<string | null> {
  checkStop();
  const panel = await openMatPanel(select);
  const options = [...panel.querySelectorAll("mat-option")];
  const wanted = choose(options.map(optionText));
  const opt = wanted == null ? undefined : options.find((o) => optionText(o) === wanted);
  if (!opt) {
    await closeMatPanel(select, panel);
    return null;
  }
  click(opt);
  const expect = wanted === CLEAR ? "" : wanted!;
  await need(() => !matPanel(select) && (expect ? sameText(matShownText(select), expect) : !matShownText(select)), `"${describe(select)}" does not show "${expect}" after picking it`, TIMING.valueMs);
  return expect;
}

/** Picks the option equal to `wanted` (matchOption: trim/case/space-insensitive, never partial). Returns the shown text, or null when no option matches. */
export function selectMatOption(el: Element, wanted: string): Promise<string | null> {
  return chooseMatOption(el, (opts) => matchOption(opts.filter((o) => o !== CLEAR), wanted));
}

/** Empties a mat-select with its "Clear selection" option (no-op when it shows nothing). */
export async function clearMatSelect(el: Element): Promise<void> {
  if (!matShownText(el)) return;
  const r = await chooseMatOption(el, (opts) => (opts.includes(CLEAR) ? CLEAR : null));
  if (r === null) throw new PageChanged(`"${describe(el)}" has no "${CLEAR}" option`);
}

/** The open C&G dialog (the one titled "Courses & Grades"), or null. */
export function cgDialog(doc: Document): Element | null {
  return doc.getElementById("changePreferencesTitle")?.closest("mat-dialog-container") ?? null;
}

/** Transcript 1's rows in the open C&G dialog; null when the dialog is not open. */
export function readCgDialog(doc: Document): { courseCount: number; names: string[] } | null {
  const dialog = cgDialog(doc);
  if (!dialog) return null;
  const names = [...dialog.querySelectorAll('input[id^="courseNameControl_T1C"]')].map((i) => (i as HTMLInputElement).value.trim());
  return { courseCount: names.length, names };
}

// ---------- ng-select (Current Year page) ----------

function ngOf(input: Element): Element {
  const ng = input.closest("ng-select");
  if (!ng) throw new PageChanged(`"${input.id}" is not an ng-select`);
  return ng;
}

function ngPanel(input: Element): Element | null {
  return ngOf(input).querySelector("ng-dropdown-panel");
}

const ngOptionEls = (panel: Element) => [...panel.querySelectorAll(".ng-option")].filter((o) => !o.classList.contains("ng-option-disabled"));
const ngOptionText = (o: Element) => text(o.querySelector(".ng-option-label") ?? o);

/** Options of the ng-select whose combobox input this is, while its list is open ([] when closed). */
export function readNgOptions(input: Element): string[] {
  const panel = ngPanel(input);
  return panel ? ngOptionEls(panel).map(ngOptionText) : [];
}

/** What an ng-select holds: chips for a multi-select; for a single one Common App keeps it only in the input's value property. */
export function ngValues(input: Element): string[] {
  const ng = ngOf(input);
  if (ng.classList.contains("ng-select-multiple")) return [...ng.querySelectorAll(".ng-value .ng-value-label")].map(text).filter(Boolean);
  const chip = text(ng.querySelector(".ng-value .ng-value-label"));
  const v = chip || ((input as HTMLInputElement).value ?? "").trim();
  return v ? [v] : [];
}

async function openNg(input: Element): Promise<Element> {
  const open = ngPanel(input);
  if (open) return open;
  const container = ngOf(input).querySelector(".ng-select-container") ?? input;
  container.dispatchEvent(eventOf(container, "MouseEvent", "mousedown", { bubbles: true, cancelable: true, button: 0 }));
  return need(() => ngPanel(input), `the list for "${input.id}" did not open`, TIMING.panelMs);
}

async function closeNg(input: Element): Promise<void> {
  if (!ngPanel(input)) return;
  pressEscape(input);
  try {
    await waitFor(() => !ngPanel(input), { timeoutMs: TIMING.panelMs });
  } catch {
    (input as HTMLElement).blur?.(); // a list left open is harmless: the next field's mousedown closes it
  }
}

/** Opens the ng-select and clicks the option whose text equals `wanted` (never type-ahead + Enter: that picks "contains" matches).
 *  Returns the picked text, or null when no option matches (list closed, nothing changed). */
export async function selectNgOption(input: Element, wanted: string): Promise<string | null> {
  checkStop();
  const panel = await openNg(input);
  const els = ngOptionEls(panel);
  const pick = matchOption(els.map(ngOptionText), wanted);
  const el = pick == null ? undefined : els.find((o) => ngOptionText(o) === pick);
  if (!el) {
    await closeNg(input);
    return null;
  }
  if (!ngValues(input).some((v) => sameText(v, pick!))) click(el);
  await need(() => ngValues(input).some((v) => sameText(v, pick!)), `"${input.id}" does not show "${pick}" after picking it`, TIMING.valueMs);
  await closeNg(input);
  return pick;
}

/** Removes every chip of a multi-select except `keep` (click its x), or empties a single select with its clear button. */
export async function clearNg(input: Element, keep: string | null = null): Promise<void> {
  checkStop();
  const ng = ngOf(input);
  if (ng.classList.contains("ng-select-multiple")) {
    for (const chip of [...ng.querySelectorAll(".ng-value")]) {
      const label = text(chip.querySelector(".ng-value-label"));
      if (keep != null && sameText(label, keep)) continue;
      const x = chip.querySelector(".ng-value-icon");
      if (!x) throw new PageChanged(`"${input.id}" has no remove button on "${label}"`);
      click(x);
    }
    await need(() => ngValues(input).every((v) => keep != null && sameText(v, keep)), `"${input.id}" kept old schedule values`, TIMING.valueMs);
    return;
  }
  if (!ngValues(input).length) return;
  const clear = ng.querySelector(".ng-clear, .ng-clear-wrapper");
  if (!clear) throw new PageChanged(`"${input.id}" has no clear button`);
  click(clear);
  await need(() => !ngValues(input).length, `"${input.id}" did not clear`, TIMING.valueMs);
}
