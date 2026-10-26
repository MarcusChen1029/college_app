// Fill assistant, page side: puts one value into the box the student last clicked on an application portal (UC, STARS, Cal State Apply,
// UIUC, UT). It knows no portal's layout, only the standard kinds of form control, so it works on all of them:
// text box / text area, native <select>, checkbox (Yes/No), radio group (by label), and ARIA comboboxes (type, then click the option
// whose text is exactly the value). A dropdown pick is always an exact match (ignoring case, spacing and dash style), never "closest".

export type InsertResult = { ok: true; how: string } | { ok: false; reason: string };

/** Waits, in ms. Mutable so tests can run fast. */
export const ASSIST_TIMING = { stepMs: 80, optionsMs: 2500 };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const sameText = (a: string, b: string): boolean => flat(a) === flat(b);
const flat = (s: string): string => s.normalize("NFKC").toLowerCase().replace(/[‐-―-]/g, "-").replace(/\s+/g, " ").trim();
const text = (el: Element | null | undefined): string => (el?.textContent ?? "").replace(/\s+/g, " ").trim();

function fire(el: Element, type: string, init: Record<string, unknown> = {}): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = (type.startsWith("key") ? view.KeyboardEvent : type === "click" || type.startsWith("mouse") ? view.MouseEvent : view.Event) ?? view.Event ?? Event;
  el.dispatchEvent(new Ctor(type, { bubbles: true, cancelable: true, ...init } as EventInit));
}

/** Sets a text box's value and fires the events React, Angular and plain pages listen to. From the content script's isolated world
 *  the value goes straight to the element, so React's value tracker sees a change and runs onChange. */
export function setText(input: HTMLInputElement | HTMLTextAreaElement, value: string, commit = false): void {
  (input as HTMLElement).focus?.();
  fireFocus(input, "focus", "focusin");
  input.value = value;
  fire(input, "input");
  fire(input, "change");
  // Some inputs only take a typed value on blur (Telerik's date boxes on STARS keep it unsaved otherwise). Never for a combobox: blur closes its list.
  if (commit) fireFocus(input, "blur", "focusout");
}

function fireFocus(el: Element, own: "focus" | "blur", bubbling: "focusin" | "focusout"): void {
  const view = (el.ownerDocument?.defaultView ?? globalThis) as unknown as Record<string, typeof Event | undefined>;
  const Ctor = view.FocusEvent ?? view.Event ?? Event;
  el.dispatchEvent(new Ctor(own, { bubbles: false } as EventInit));
  el.dispatchEvent(new Ctor(bubbling, { bubbles: true } as EventInit));
}

/** The label a control shows: <label for>, wrapping <label>, aria-label, aria-labelledby. */
export function labelOf(el: Element): string {
  const doc = el.ownerDocument;
  const id = el.getAttribute("id");
  const byFor = id ? doc.querySelector(`label[for="${id.replace(/"/g, '\\"')}"]`) : null;
  if (byFor) return text(byFor);
  const wrap = el.closest("label");
  if (wrap) return text(wrap);
  const aria = el.getAttribute("aria-label");
  if (aria) return aria.trim();
  const ids = el.getAttribute("aria-labelledby");
  if (ids) return ids.split(/\s+/).map((i) => text(doc.getElementById(i))).join(" ").trim();
  return "";
}

const TRUE = ["yes", "true", "y", "1", "checked"];
const FALSE = ["no", "false", "n", "0", "unchecked", ""];

/** Listbox options on the page. Dropdown libraries render them only while the list is open, so these are the open list's. */
function visibleOptions(doc: Document): Element[] {
  // Telerik RadComboBox (STARS) renders its list as li.rcbItem inside .rcbList, without ARIA roles.
  return [...doc.querySelectorAll('[role="option"], .ng-option, mat-option, .rcbList li.rcbItem, .rcbList li.rcbHovered')].filter(
    (o) => o.getAttribute("aria-disabled") !== "true" && !o.classList.contains("rcbDisabled"),
  );
}

async function pickOption(doc: Document, value: string): Promise<Element | null> {
  const start = Date.now();
  for (;;) {
    const hit = visibleOptions(doc).find((o) => sameText(text(o), value));
    if (hit) return hit;
    if (Date.now() - start >= ASSIST_TIMING.optionsMs) return null;
    await sleep(ASSIST_TIMING.stepMs);
  }
}

/** The combobox a focused element belongs to (the element itself, or an ancestor with role=combobox), or null. */
function comboboxOf(el: Element): Element | null {
  if (el.getAttribute("role") === "combobox" || el.hasAttribute("aria-autocomplete")) return el;
  return el.closest('[role="combobox"], mat-select, ng-select, .RadComboBox, .RadDropDownTree');
}

/** Telerik RadDropDownTree (STARS's Education System): the leaf items of its tree (regions are folders, never a value). The tree is in the
 *  page even while closed, and a click on a leaf selects it (checked on STARS, 2026-10-27). */
function treeLeaves(root: Element): Element[] {
  return [...root.querySelectorAll(".RadTreeView .rtText")].filter((e) => !e.closest("li")?.querySelector("ul"));
}

/** Opens a closed dropdown: Telerik's arrow, else a click on the box itself. */
function openList(combo: Element): void {
  const arrow = combo.matches(".RadComboBox") ? combo.querySelector(".rcbArrowCell a, .rcbActionButton, button") : null;
  fire(arrow ?? combo, "mousedown");
  fire(arrow ?? combo, "click");
}

/** Puts `value` into `target` (the element the student last clicked). Never submits, never presses Enter. */
export async function insertValue(target: Element | null, value: string): Promise<InsertResult> {
  if (!target || target === target.ownerDocument.body || target === target.ownerDocument.documentElement) {
    return { ok: false, reason: "Click the box on the page first, then press the value here." };
  }
  const doc = target.ownerDocument;
  const tag = target.tagName.toLowerCase();

  if (tag === "select") {
    const sel = target as HTMLSelectElement;
    const opts = [...sel.querySelectorAll("option")];
    const i = opts.findIndex((o) => sameText(text(o), value) || sameText(o.getAttribute("value") ?? "", value));
    if (i < 0) return { ok: false, reason: `"${value}" is not one of this list's options (${opts.slice(0, 6).map((o) => text(o)).filter(Boolean).join(", ")}${opts.length > 6 ? ", …" : ""}).` };
    opts.forEach((o, j) => ((o as HTMLOptionElement).selected = j === i));
    sel.selectedIndex = i;
    fire(sel, "input");
    fire(sel, "change");
    return { ok: true, how: "picked" };
  }

  if (tag === "input" && ["checkbox", "radio"].includes((target.getAttribute("type") ?? "").toLowerCase())) {
    const input = target as HTMLInputElement;
    const type = input.getAttribute("type")!.toLowerCase();
    if (type === "checkbox") {
      const want = TRUE.includes(flat(value)) ? true : FALSE.includes(flat(value)) ? false : null;
      if (want == null) return { ok: false, reason: `This is a tick box; "${value}" is not Yes or No.` };
      if (input.checked !== want) input.click();
      return { ok: true, how: want ? "ticked" : "unticked" };
    }
    const name = input.getAttribute("name");
    const group = name ? [...doc.querySelectorAll(`input[type="radio"][name="${name.replace(/"/g, '\\"')}"]`)] : [input];
    const hit = group.find((r) => sameText(labelOf(r), value) || sameText(r.getAttribute("value") ?? "", value));
    if (!hit) return { ok: false, reason: `No choice here reads "${value}" (${group.map(labelOf).filter(Boolean).join(", ")}).` };
    (hit as HTMLInputElement).click();
    return { ok: true, how: "chose" };
  }

  const combo = comboboxOf(target);
  if (combo?.matches(".RadDropDownTree")) {
    const scope = combo.ownerDocument.querySelector(`#${combo.id}_EmbeddedTree`) ?? combo;
    // The tree's popup lives outside the widget, under the widget's id + "_EmbeddedTree" (one per school row).
    const leaf = treeLeaves(scope).find((e) => sameText(text(e), value));
    if (!leaf) return { ok: false, reason: `No choice in this list reads "${value}".` };
    fire(leaf, "mousedown");
    (leaf as HTMLElement).click();
    return { ok: true, how: "picked" };
  }
  if (combo) {
    const input = (combo.matches("input") ? combo : combo.querySelector("input:not([type=hidden])")) as HTMLInputElement | null;
    // A list that is already open may hold the option; else type to filter (editable) or open it (read-only).
    let option = visibleOptions(doc).find((o) => sameText(text(o), value)) ?? null;
    const telerik = combo.closest(".RadComboBox");
    if (!option) {
      if (input && !input.readOnly) setText(input, value);
      else openList(telerik ?? combo);
      option = await pickOption(doc, value);
    }
    // A Telerik list without filtering does not open on typing: open it and look again.
    if (!option && telerik && input && !input.readOnly) {
      openList(telerik);
      option = await pickOption(doc, value);
    }
    if (option) {
      fire(option, "mousedown");
      (option as HTMLElement).click();
      return { ok: true, how: "picked" };
    }
    if (input && !input.readOnly) return { ok: true, how: "typed (no matching option appeared; check the box)" };
    return { ok: false, reason: `No option reads "${value}" in this list.` };
  }

  if (tag === "input" || tag === "textarea") {
    const input = target as HTMLInputElement;
    if (input.readOnly || input.disabled) return { ok: false, reason: "That box is read-only." };
    setText(input, value, true);
    return { ok: true, how: "typed" };
  }

  if ((target as HTMLElement).isContentEditable || target.getAttribute("contenteditable") === "true") {
    target.textContent = value;
    fire(target, "input");
    return { ok: true, how: "typed" };
  }

  return { ok: false, reason: "That is not a box the assistant can type into. Click the box itself." };
}
