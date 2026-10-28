// The guard in front of the one button STARS and UC fills press (like UIUC's safeClick in uiuc/fill.ts): the page path says where we are, but
// an id alone can be reused (STARS's "Save Course" is #btn_submit; on myIllini that same id is the FINAL submit). So the button must also READ
// like a save button, and must not read like something that finishes the application.

/** Wording of a control that submits, certifies or finishes something for good. Refused whatever the button's id. */
export const FINAL_WORDING = /\bsubmit|i'?m done|\bdone\b|\bcertif|\bfinali[sz]e|\bsign\b|\battest|\bagree|\bpay\b/i;

/** What a person sees on a control: an input's value, its text, and the accessible names a page may give it. */
export function controlLabel(el: Element): string {
  const attr = (n: string) => el.getAttribute?.(n) ?? "";
  return [(el as HTMLInputElement).value, el.textContent, attr("aria-label"), attr("title"), attr("alt")].filter((s) => typeof s === "string" && s.trim()).join(" ").replace(/\s+/g, " ").trim();
}

/** Why `el` must not be pressed as a Save button (its wording, quoted), or null when it reads like Save and nothing else. */
export function saveButtonRefusal(el: Element): string | null {
  const label = controlLabel(el);
  if (!label) return "a button with no label";
  if (FINAL_WORDING.test(label)) return `"${label.slice(0, 60)}"`;
  if (!/save/i.test(label)) return `"${label.slice(0, 60)}", which is not a Save button`;
  return null;
}

/**
 * Presses `el` shortly after the caller has answered the panel (the click posts the page and this script goes away). The label is checked
 * again at press time: a page script may have changed the button in between.
 */
export function pressSaveLater(el: HTMLElement, delayMs = 50): void {
  setTimeout(() => {
    if (!saveButtonRefusal(el)) el.click();
  }, delayMs);
}
