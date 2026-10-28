// UC "Activities & awards" pages (apply.universityofcalifornia.edu), page side. Read live 2026-10-28: docs/superpowers/research/2026-10-27-portal-dom.md §7.
//   - List page (form#activitiesForm): readUcList reads each item's category, id, name and read-only section; deleteUcEntry presses that item's
//     Delete and then the popup's Yes; clickUcAdd presses "Add an activity or award".
//   - Add/edit page (form#addActivitiesForm): fillUcForm sets one UcFormPlan's boxes and presses "Save & continue" (#save) once.
// UC cuts over-long text on keyup and before submit instead of rejecting it, so fillUcForm refuses to save when any text would be cut.
//
// SAFETY: the only buttons ever pressed are an item's own Delete (then Yes, never No), #add_activity and #save. UC's #no_activities ("I have no
// activities or awards to report" / "I've finished adding activities") and every other submit are never touched.

import { ucTextLength } from "../../../web/lib/activities.ts";
import type { UcFormPlan, UcFieldSet } from "../../../web/lib/uc-activities-fill.ts";
import { labelOf } from "../assist/insert.ts";
import { fire, pick, UcStop } from "./fill.ts";

/** Whether an element is shown. Tests swap it (the fake DOM has no layout). */
export const UC_ACT_DOM = {
  visible(el: Element | null): boolean {
    if (!el) return false;
    for (let e: Element | null = el; e; e = e.parentElement) {
      const h = e as HTMLElement;
      if (h.hidden || h.style?.display === "none" || e.getAttribute("aria-hidden") === "true") return false;
    }
    return typeof (el as HTMLElement).getClientRects !== "function" || (el as HTMLElement).getClientRects().length > 0;
  },
};
export const UC_ACT_TIMING = { stepMs: 50, popupMs: 3000 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const flat = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const byId = (doc: Document, id: string) => doc.getElementById(id);

export type UcActivitiesPage = "list" | "form" | null;

/** Which Activities & awards page is open: the list, the add/edit form, or neither. */
export function ucActivitiesPage(doc: Document): UcActivitiesPage {
  if (byId(doc, "addActivitiesForm")) return "form";
  if (byId(doc, "activitiesForm")) return "list";
  return null;
}

// ── List page ──

/** `shown`: the item's read-only section, `p.subsectionheader` text -> the `p.description` texts under it. category: the id's <Cat> (ExtraCurr...). */
export type UcListed = { activityId: string; category: string; index: number; name: string; shown: Record<string, string[]> };

const BUTTON_ID = /^(edit|delete)_([^_]+)_(\d+)_(.+)$/;

/** The items on the list page, in order. */
export function readUcList(doc: Document): UcListed[] {
  let sections = [...doc.querySelectorAll("div.acordion fieldset.form-section > section")];
  if (!sections.length) sections = [...doc.querySelectorAll("div.acordion")];
  const out: UcListed[] = [];
  for (const sec of sections) {
    const edit = [...sec.querySelectorAll('button[id^="edit_"], a[id^="edit_"]')].map((b) => BUTTON_ID.exec(b.id)).find((m) => m?.[1] === "edit");
    if (!edit) continue;
    const shown: Record<string, string[]> = {};
    let header: string | null = null;
    for (const p of sec.querySelectorAll("p.subsectionheader, p.description")) {
      if (p.classList.contains("subsectionheader")) {
        header = flat(p.textContent);
        shown[header] ??= [];
      } else if (header != null) {
        shown[header]!.push(flat(p.textContent));
      }
    }
    out.push({ activityId: edit[4]!, category: edit[2]!, index: Number(edit[3]), name: flat(sec.querySelector("span.activitySubtitle")?.textContent), shown });
  }
  return out;
}

/** The Delete button of exactly this activity (the id's last part is compared whole, so 1383 never matches 13836651). */
function deleteButtonOf(doc: Document, activityId: string): HTMLElement | null {
  for (const b of doc.querySelectorAll('button[id^="delete_"], a[id^="delete_"]')) {
    const m = BUTTON_ID.exec(b.id);
    if (m?.[1] === "delete" && m[4] === activityId) return b as HTMLElement;
  }
  return null;
}

/** Presses the item's own Delete, waits for UC's "Are you sure you want to delete this activity?" popup, then presses Yes (never No). Throws when
 *  the item or the popup is not there; nothing else is pressed then. */
export async function deleteUcEntry(doc: Document, activityId: string): Promise<void> {
  const del = deleteButtonOf(doc, activityId);
  if (!del) throw new UcStop(`UC's list has no activity ${activityId} to delete`);
  del.click();
  const start = Date.now();
  for (;;) {
    const popup = byId(doc, "mdl");
    if (popup && UC_ACT_DOM.visible(popup) && /delete this activity/i.test(flat(popup.textContent))) break;
    if (Date.now() - start > UC_ACT_TIMING.popupMs) throw new UcStop("UC did not ask to confirm the delete: nothing was deleted");
    await sleep(UC_ACT_TIMING.stepMs);
  }
  const yes = byId(doc, "warningYesButton");
  if (!yes) throw new UcStop("UC's Yes button is not on the delete popup: nothing was deleted");
  yes.click();
}

/** Presses "Add an activity or award" / "Add another activity or award" (the add page opens). */
export function clickUcAdd(doc: Document): void {
  const add = byId(doc, "add_activity");
  if (!add) throw new UcStop("UC's Add an activity or award button is not on the page");
  add.click();
}

// ── Add / edit form ──

export type UcFormResult = { ok: true } | { ok: false; error: string };

const CHAR_CLASS = /(?:^|\s)char_count_(\d+)(?:\s|$)/;

const nameOf = (el: Element, fallback: string) => labelOf(el) || fallback;

function field(doc: Document, f: UcFieldSet): HTMLInputElement {
  if (f.kind === "radio") {
    const radios = [...doc.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)].filter((r) => r.name === f.id);
    const r = radios.find((x) => x.value === f.value);
    if (!r) throw new UcStop(`UC's ${f.id} question has no option "${String(f.value)}"`);
    return r;
  }
  const el = byId(doc, f.id) as HTMLInputElement | null;
  if (!el) throw new UcStop(`UC's ${f.id} box is not on the page`);
  return el;
}

/** The text UC would keep of a box's value; null when it would keep it all. Textareas: class char_count_<N>, a line break counts 2. Text boxes: maxlength. */
function cutReason(el: HTMLInputElement | HTMLTextAreaElement, value: string): string | null {
  const m = CHAR_CLASS.exec(el.getAttribute("class") ?? "");
  if (m && ucTextLength(value) > Number(m[1])) return `${ucTextLength(value)} characters counting each line break as 2, UC allows ${m[1]}`;
  const max = el.getAttribute("maxlength");
  if (max && /^\d+$/.test(max) && value.length > Number(max)) return `${value.length} characters, UC allows ${max}`;
  return null;
}

function typeText(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  el.focus?.();
  el.value = value;
  fire(el, "input");
  fire(el, "keyup"); // UC's updateCharacterCountApp counts (and cuts) on keyup
  fire(el, "change");
  el.blur?.();
}

function setCheck(el: HTMLInputElement): void {
  if (!el.checked) el.click();
  if (!el.checked) {
    el.checked = true;
    fire(el, "change");
  }
}

function applyField(doc: Document, f: UcFieldSet): void {
  const el = field(doc, f);
  if (!UC_ACT_DOM.visible(el)) throw new UcStop(`UC is not showing the ${nameOf(el, f.id)} question`);
  if (f.kind === "select") return pick(doc, f.id, { value: String(f.value), text: String(f.value) }, nameOf(el, f.id));
  if (f.kind === "text") return typeText(el, String(f.value));
  if (f.kind === "check") return setCheck(el);
  setCheck(el); // radio
}

/** What a box holds now, as `applyField` was meant to leave it; null when it does. */
function mismatch(doc: Document, f: UcFieldSet): string | null {
  const el = field(doc, f);
  const name = nameOf(el, f.id);
  if (!UC_ACT_DOM.visible(el)) return `UC hid the ${name} question again`;
  switch (f.kind) {
    case "text": {
      const got = el.value.replace(/\r\n?/g, "\n");
      return got === f.value ? null : `UC changed the ${name} text (it kept ${ucTextLength(got)} of ${ucTextLength(String(f.value))} characters)`;
    }
    case "select":
      return (el as unknown as HTMLSelectElement).value === f.value ? null : `UC did not keep the ${name} choice`;
    default:
      return el.checked ? null : `UC did not keep the ${name} choice`;
  }
}

/** The errors UC shows after a refused Save: the visible `#<id>-error` labels and the `#alertDiv` banner. */
export function ucFormErrors(doc: Document): string[] {
  const out: string[] = [];
  for (const el of doc.querySelectorAll('[id$="-error"]')) {
    const t = flat(el.textContent);
    if (t && UC_ACT_DOM.visible(el)) out.push(t);
  }
  const banner = byId(doc, "alertDiv");
  if (banner && flat(banner.textContent) && UC_ACT_DOM.visible(banner)) out.push(flat(banner.textContent));
  return [...new Set(out)];
}

/**
 * Fills the add/edit form from one plan and presses "Save & continue" once. Order: the category is picked and its `change` fired before any
 * other box; the rest follow the plan's order (grades before the after-12th selects and before a work grid's school/summer boxes). Nothing is
 * saved when a box is missing or hidden, when any text would be cut by UC (checked before typing, and again on what the boxes hold), or when
 * a box does not keep its value. After the press, UC's own errors (hours, weeks) come back as `ok: false`.
 */
export function fillUcForm(doc: Document, plan: UcFormPlan): UcFormResult {
  try {
    if (ucActivitiesPage(doc) !== "form") throw new UcStop("Open UC's add-activity page first (Add an activity or award)");
    const [first, ...rest] = plan.fields;
    if (!first || first.id !== "typeofactivity" || first.value !== plan.category || rest.some((f) => f.id === "typeofactivity")) {
      throw new UcStop(`${plan.label}: the plan does not start with its category`);
    }
    const save = byId(doc, "save");
    if (!save) throw new UcStop("UC's Save & continue button is not on the page");

    applyField(doc, first); // the category, with its change, reveals the right set of boxes

    // Nothing typed yet: every text that UC would cut stops the whole entry.
    const cuts = rest.flatMap((f) => {
      if (f.kind !== "text") return [];
      const el = field(doc, f) as HTMLInputElement | HTMLTextAreaElement;
      const why = cutReason(el, String(f.value));
      return why ? [`${plan.label}: UC would cut the ${nameOf(el, f.id)} text (${why})`] : [];
    });
    if (cuts.length) throw new UcStop(cuts.join("; "));

    for (const f of rest) applyField(doc, f);

    const bad = plan.fields.map((f) => mismatch(doc, f)).filter((m): m is string => m != null);
    if (bad.length) throw new UcStop(`${plan.label}: ${bad.join("; ")}`);

    save.click();
    const errors = ucFormErrors(doc);
    if (errors.length) return { ok: false, error: `${plan.label}: UC did not save it: ${errors.join("; ")}` };
    return { ok: true };
  } catch (e) {
    if (e instanceof UcStop) return { ok: false, error: e.message };
    throw e;
  }
}
