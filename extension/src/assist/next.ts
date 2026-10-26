// Focus order for the fill assistant: after a value goes in, the next box in page order gets focus, so a student can press a course's
// values one after another (or "Fill from here" can run them in order).

const FOCUSABLE = 'input:not([type="hidden"]):not([type="button"]):not([type="submit"]):not([type="reset"]):not([type="image"]), select, textarea, [role="combobox"], [contenteditable="true"]';

function usable(el: Element): boolean {
  const e = el as HTMLInputElement;
  if (e.disabled || e.readOnly || el.getAttribute("aria-hidden") === "true" || el.closest('[hidden], [aria-hidden="true"]')) return false;
  const r = (el as HTMLElement).getBoundingClientRect?.();
  // A parsed fixture has no layout (all zeros); in a browser a zero box means hidden.
  return !r || r.width > 0 || r.height > 0 || !(el.ownerDocument.defaultView as unknown as { innerWidth?: number })?.innerWidth;
}

/** The boxes a student can fill, in page order. A radio group counts once (its first radio); a combobox's own input is not counted twice. */
export function fillableBoxes(doc: Document): Element[] {
  const seenRadio = new Set<string>();
  const out: Element[] = [];
  for (const el of doc.querySelectorAll(FOCUSABLE)) {
    if (!usable(el)) continue;
    if (el.matches("input") && el.parentElement?.closest('[role="combobox"]') && !el.matches('[role="combobox"]')) continue;
    if ((el.getAttribute("type") ?? "").toLowerCase() === "radio") {
      const name = el.getAttribute("name") ?? "";
      if (seenRadio.has(name)) continue;
      seenRadio.add(name);
    }
    out.push(el);
  }
  return out;
}

/** The box after `el` in page order, or null at the end. */
export function nextBox(el: Element): Element | null {
  const boxes = fillableBoxes(el.ownerDocument);
  const host = el.matches("input") ? (el.closest('[role="combobox"]') ?? el) : el;
  const radioName = (host.getAttribute("type") ?? "").toLowerCase() === "radio" ? host.getAttribute("name") : null;
  const i = boxes.findIndex((b) => b === host || (radioName != null && b.getAttribute("name") === radioName));
  if (i >= 0) return boxes[i + 1] ?? null;
  // Not in the list (e.g. the student clicked a label): the first box after it in document order.
  return boxes.find((b) => host.compareDocumentPosition(b) & 4 /* DOCUMENT_POSITION_FOLLOWING */) ?? null;
}
