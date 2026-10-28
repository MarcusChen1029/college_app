// Test helper: a fake Common App Activities (/common/7/232) or Honors (/common/4/25) page that plays Angular's part, so fillCaPage can run
// end to end on linkedom. Shapes follow docs/superpowers/research/2026-10-27-portal-dom.md §6 and §8: the gate radios, all slots pre-rendered
// in ca-add-another-sub-group (hidden past the counter, still holding old answers), legend "Activity N", ng-select type/sport whose chosen
// text is the input's value, Clear answer buttons, checkbox lists, Add another, Remove + confirm (#alert_rc_r; it only lowers the counter),
// Continue, show/hide rules and ng-invalid on controls that fail a check. Every change is logged. Not used by the extension bundle.

import { CA_ACTIVITY_TYPES, CA_ATHLETIC_TYPES, CA_SPORTS } from "../../../web/lib/activities.ts";
import type { CaPage } from "../../../web/lib/activities-fill.ts";
import { CA_GATE_YES, CA_PAGE_FACTS } from "./pages.ts";
import { html } from "./test-dom.ts";

type Kind = "select" | "text" | "date" | "radio" | "checks";
/** `key` is the question fragment a plan uses; `label` the portal's full label ("{n}" = slot number). */
type Q = { key: string; label: string; kind: Kind; options?: readonly string[]; max?: number; range?: [number, number]; required?: boolean };

const GRADES = ["9th grade", "10th grade", "11th grade", "12th grade", "After graduating high school"];
const ACTIVITY_QS: Q[] = [
  { key: "Activity or experience type", label: "Activity or experience type", kind: "select", options: CA_ACTIVITY_TYPES, required: true },
  { key: "Sport/team", label: "Sport/team", kind: "select", options: CA_SPORTS },
  { key: "Describe this activity", label: "Describe this activity, including what you accomplished and any recognition you received, etc.", kind: "text", max: 150, required: true },
  { key: "Organization or group", label: "Organization or group (if applicable)", kind: "text", max: 100 },
  { key: "specific position or leadership role", label: "Did you have a specific position or leadership role?", kind: "radio", options: ["Yes", "No"] },
  { key: "What was your role?", label: "What was your role?", kind: "text", max: 50 },
  { key: "When did you participate?", label: "When did you participate?", kind: "checks", options: GRADES },
  { key: "Time of year", label: "During high school: Time of year", kind: "radio", options: ["During the school year", "During school break", "All year"] },
  { key: "Start date", label: "After graduating high school: Start date", kind: "date" },
  { key: "still participating", label: "Are you still participating?", kind: "radio", options: ["Yes", "No"] },
  { key: "End date", label: "After graduating high school: End date", kind: "date" },
  { key: "Hours spent per week", label: "Hours spent per week", kind: "text", max: 5, range: [1, 168] },
  { key: "Weeks spent per year", label: "Weeks spent per year", kind: "text", max: 5, range: [1, 52] },
  { key: "participating in this activity in college", label: "Do you plan on participating in this activity in college?", kind: "radio", options: ["Yes", "No", "Not sure"], required: true },
];
const HONOR_QS: Q[] = [
  { key: "title", label: "Honors {n} title", kind: "text", max: 100, required: true },
  { key: "Grade level", label: "Grade level", kind: "checks", options: ["9", "10", "11", "12", "Post-graduate"] },
  { key: "Level(s) of recognition", label: "Level(s) of recognition", kind: "checks", options: ["School", "State/Regional", "National", "International"] },
];
const SLOTS: Record<CaPage, { first: number; qs: Q[]; gateText: string }> = {
  activities: { first: 14, qs: ACTIVITY_QS, gateText: "Would you like to report any activities?" },
  honors: { first: 24, qs: HONOR_QS, gateText: "Do you wish to report any honors related to your academic achievements beginning with the ninth grade or international equivalent?" },
};

export type FakeValue = string | string[];
export type FakeActivitiesConfig = {
  page?: CaPage;
  /** The gate's saved answer (default: "yes" when count > 0, else unanswered). */
  gate?: "yes" | "no" | null;
  /** The counter: slots 1..count are shown. */
  count?: number;
  /** Answers already in slot n (shown or hidden), keyed by question fragment. */
  slots?: Record<number, Record<string, FakeValue>>;
  /** Render only the first N options of an unfiltered list (a long list that shows part of itself until the student types). */
  rendered?: number;
};
/** log: "gate:Yes", "add:<n>", "remove:<n>", "confirm:remove|cancel", "continue", "set:<n>:<key>=<value>" (text typed, option picked,
 *  radio or checkbox clicked), "clear:<n>:<key>", "filter:<n>:<key>=<typed>"; raw(n): slot n's values, hidden or not. */
export type FakeActivities = { doc: Document; log: string[]; count: () => number; raw: (n: number) => Record<string, FakeValue> };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
let layoutPatched = false;

/** linkedom lays nothing out (every height is 0); give elements a height unless they sit inside [hidden], like a browser would. */
function patchLayout(doc: Document): void {
  if (layoutPatched) return;
  let proto: object | null = Object.getPrototypeOf(doc.createElement("div"));
  while (proto && !Object.prototype.hasOwnProperty.call(proto, "getBoundingClientRect")) proto = Object.getPrototypeOf(proto);
  if (!proto) return;
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: Element) {
      const height = this.closest("[hidden]") ? 0 : 20;
      return { x: 0, y: 0, top: 0, left: 0, bottom: height, right: 100, width: 100, height };
    },
  });
  layoutPatched = true;
}

function questionHtml(q: Q, id: number, n: number): string {
  const label = esc(q.label.replace("{n}", String(n)));
  const wrap = (inner: string) => `<div class="question" data-key="${esc(q.key)}">${inner}</div>`;
  if (q.kind === "select")
    return wrap(`<label for="text_ques_${id}">${label}</label><ng-select class="ng-select ng-select-single"><div class="ng-select-container"><div class="ng-value-container"><div class="ng-input"><input id="text_ques_${id}" role="combobox" type="text"></div></div><span class="ng-clear-wrapper" title="Clear all"><span class="ng-clear" aria-hidden="true">×</span></span></div></ng-select>`);
  if (q.kind === "text")
    return wrap(`<label for="text_ques_${id}">${label}</label>${q.range ? `<input id="text_ques_${id}" type="text" maxlength="${q.max}">` : `<textarea id="text_ques_${id}" maxlength="${q.max}"></textarea>`}`);
  if (q.kind === "date")
    return wrap(`<label for="text_ques_${id}">${label}</label><input id="text_ques_${id}" type="text" class="mat-datepicker-input"><button type="button" aria-label="Open calendar"></button>`);
  if (q.kind === "radio") {
    const opts = q.options!.map((o, i) => `<mat-radio-button><input type="radio" id="option_ques_${id}_${i}-input" name="ques_${id}"><label for="option_ques_${id}_${i}-input">${esc(o)}</label></mat-radio-button>`).join("");
    return wrap(`<span id="label_ques_${id}">${label}</span><mat-radio-group id="radioGroup${id}" aria-labelledby="label_ques_${id}">${opts}</mat-radio-group><button type="button" id="clear_ques_${id}">Clear answer</button>`);
  }
  const boxes = q.options!.map((o, i) => `<mat-checkbox><input type="checkbox" id="ca-checkboxList-${id}-${i}-input"><label for="ca-checkboxList-${id}-${i}-input">${esc(o)}</label></mat-checkbox>`).join("");
  return `<fieldset class="question" data-key="${esc(q.key)}"><legend>${label}</legend><div id="ca-checkboxList-${id}">${boxes}</div></fieldset>`;
}

export function fakeActivities(config: FakeActivitiesConfig = {}): FakeActivities {
  const page = config.page ?? "activities";
  const facts = CA_PAGE_FACTS[page];
  const { first, qs, gateText } = SLOTS[page];
  const max = page === "activities" ? 10 : 5;
  let count = config.count ?? 0;
  const gate = config.gate !== undefined ? config.gate : count > 0 ? "yes" : null;
  const log: string[] = [];

  const slotHtml = (n: number) => {
    const moves = n > 1 ? `<button type="button" aria-label="Move ${facts.noun} ${n} question(s) up">Move up</button><button type="button" aria-label="Remove ${facts.noun} ${n} question(s)">Remove</button>` : "";
    const body = qs.map((q, k) => questionHtml(q, 5000 + n * 20 + k, n)).join("");
    return `<ca-add-another-sub-group id="subGroup${facts.counter}_${first + n - 1}" data-n="${n}"${n > count ? " hidden" : ""}><fieldset><legend><strong>${facts.noun} ${n}</strong></legend>${moves}${body}</fieldset></ca-add-another-sub-group>`;
  };
  const gateRadio = (choice: number, text: string, on: boolean) =>
    `<mat-radio-button><input type="radio" id="option_ques_${facts.gate}_${choice}-input" name="ques_${facts.gate}"${on ? " checked" : ""}><label for="option_ques_${facts.gate}_${choice}-input">${text}</label></mat-radio-button>`;
  const doc = html(
    `<main><div class="question"><span id="label_ques_${facts.gate}">${esc(gateText)}</span><mat-radio-group id="radioGroup${facts.gate}" aria-labelledby="label_ques_${facts.gate}">` +
      gateRadio(CA_GATE_YES, "Yes", gate === "yes") + gateRadio(CA_GATE_YES + 1, "No", gate === "no") +
      `</mat-radio-group></div><ca-add-another-question id="text_ques_${facts.counter}"${gate === "yes" ? "" : " hidden"}>` +
      Array.from({ length: max }, (_, i) => slotHtml(i + 1)).join("") +
      `<button type="button" id="${facts.add}">Add another</button></ca-add-another-question><button type="button" id="${facts.cont}">Continue</button></main>`,
  );
  patchLayout(doc);
  (globalThis as { location?: unknown }).location = { pathname: facts.path };

  const slot = (n: number) => doc.querySelector(`[data-n="${n}"]`)!;
  const block = (n: number, key: string) => [...slot(n).querySelectorAll("[data-key]")].find((b) => b.getAttribute("data-key") === key)!;
  const labelOf = (input: Element) => (doc.querySelector(`label[for="${input.id}"]`)?.textContent ?? "").trim();
  const checked = (b: Element) => [...b.querySelectorAll("input")].filter((i) => i.hasAttribute("checked"));
  const control = (b: Element) => b.querySelector("textarea, input")! as HTMLInputElement;
  const where = (el: Element) => `${el.closest("[data-n]")?.getAttribute("data-n")}:${el.closest("[data-key]")?.getAttribute("data-key")}`;

  function value(n: number, q: Q): FakeValue {
    const b = block(n, q.key);
    if (q.kind === "radio") return checked(b).map(labelOf)[0] ?? "";
    if (q.kind === "checks") return checked(b).map(labelOf);
    return control(b).value ?? "";
  }

  /** Show/hide rules (§6) and Angular's validity classes; hidden questions keep their values. */
  function refresh(): void {
    const add = doc.getElementById(facts.add)!;
    if (count >= max) add.setAttribute("hidden", "");
    else add.removeAttribute("hidden");
    for (let n = 1; n <= max; n++) {
      if (page === "activities") {
        const v = (key: string) => value(n, ACTIVITY_QS.find((q) => q.key === key)!);
        const grades = v("When did you participate?") as string[];
        const pg = grades.includes(GRADES[4]!);
        const show: Record<string, boolean> = {
          "Sport/team": CA_ATHLETIC_TYPES.includes(v("Activity or experience type") as string),
          "What was your role?": v("specific position or leadership role") === "Yes",
          "Time of year": grades.some((g) => g !== GRADES[4]),
          "Start date": pg,
          "still participating": pg,
          "End date": pg && v("still participating") === "No",
        };
        for (const [key, on] of Object.entries(show)) {
          if (on) block(n, key).removeAttribute("hidden");
          else block(n, key).setAttribute("hidden", "");
        }
      }
      let slotInvalid = false;
      for (const q of qs) {
        const b = block(n, q.key);
        const v = value(n, q);
        const s = Array.isArray(v) ? v.join(",") : v;
        const num = Number(s);
        const bad = !b.hasAttribute("hidden") &&
          ((q.required === true && !s) || (q.max !== undefined && s.length > q.max) || (q.range !== undefined && s !== "" && (!/^[0-9.]+$/.test(s) || !(num >= q.range[0] && num <= q.range[1]))));
        const host = q.kind === "select" ? b.querySelector("ng-select")! : q.kind === "radio" ? b.querySelector("mat-radio-group")! : q.kind === "checks" ? b.querySelector("[id^='ca-checkboxList-']")! : control(b);
        host.classList.toggle("ng-invalid", bad);
        host.classList.toggle("ng-valid", !bad);
        slotInvalid ||= bad;
      }
      // The slot's form group is invalid when any of its questions is: the driver must only look at the controls it wrote.
      slot(n).querySelector("fieldset")!.classList.toggle("ng-invalid", slotInvalid);
    }
  }

  // Answers already on the page (shown or hidden).
  for (const [ns, values] of Object.entries(config.slots ?? {})) {
    for (const [key, v] of Object.entries(values)) {
      const q = qs.find((x) => x.key === key);
      if (!q) throw new Error(`fake: no question "${key}"`);
      const b = block(Number(ns), key);
      if (q.kind === "radio" || q.kind === "checks") {
        for (const i of b.querySelectorAll("input")) if ((Array.isArray(v) ? v : [v]).includes(labelOf(i))) i.setAttribute("checked", "");
      } else control(b).value = v as string;
    }
  }
  refresh();

  const panelOf = (ng: Element) => ng.querySelector("ng-dropdown-panel");
  function openPanel(ng: Element, filter: string | null): void {
    panelOf(ng)?.remove();
    const q = qs.find((x) => x.key === ng.closest("[data-key]")!.getAttribute("data-key"))!;
    const opts = filter === null ? q.options!.slice(0, config.rendered ?? q.options!.length) : q.options!.filter((o) => o.toLowerCase().includes(filter.toLowerCase()));
    const panel = doc.createElement("ng-dropdown-panel");
    panel.innerHTML = `<div class="ng-dropdown-panel-items">${opts.map((o) => `<div class="ng-option"><span class="ng-option-label">${esc(o)}</span></div>`).join("")}</div>`;
    ng.appendChild(panel);
  }

  doc.addEventListener("mousedown", (e) => {
    const t = e.target as Element;
    const ng = t.closest("ng-select");
    if (ng && !t.closest(".ng-clear-wrapper") && !panelOf(ng)) openPanel(ng, null);
  });
  doc.addEventListener("keydown", (e) => {
    const ng = (e.target as Element).closest("ng-select");
    if (ng && (e as KeyboardEvent).key === "Escape") panelOf(ng)?.remove();
  });
  doc.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    const ng = t.closest("ng-select");
    if (ng) {
      log.push(`filter:${where(t)}=${t.value}`);
      openPanel(ng, t.value);
      return;
    }
    if (t.closest("[data-n]")) log.push(`set:${where(t)}=${t.value}`);
    refresh();
  });
  doc.addEventListener("click", (e) => {
    const t = e.target as Element;
    const option = t.closest(".ng-option");
    if (option) {
      const ng = option.closest("ng-select")!;
      const input = ng.querySelector("input")! as HTMLInputElement;
      input.value = (option.textContent ?? "").trim();
      log.push(`set:${where(ng)}=${input.value}`);
      panelOf(ng)!.remove();
      refresh();
      return;
    }
    if (t.closest(".ng-clear-wrapper")) {
      const ng = t.closest("ng-select")!;
      (ng.querySelector("input") as HTMLInputElement).value = "";
      log.push(`clear:${where(ng)}`);
      refresh();
      return;
    }
    if (t.matches('input[type="radio"]')) {
      for (const r of doc.querySelectorAll(`input[name="${t.getAttribute("name")}"]`)) r.removeAttribute("checked");
      t.setAttribute("checked", "");
      if (t.id.startsWith(`option_ques_${facts.gate}_`)) {
        const yes = t.id === `option_ques_${facts.gate}_${CA_GATE_YES}-input`;
        log.push(`gate:${yes ? "Yes" : "No"}`);
        const list = doc.getElementById(`text_ques_${facts.counter}`)!;
        if (yes) {
          list.removeAttribute("hidden");
          if (count === 0) {
            count = 1;
            slot(1).removeAttribute("hidden");
          }
        } else list.setAttribute("hidden", "");
      } else log.push(`set:${where(t)}=${labelOf(t)}`);
      refresh();
      return;
    }
    if (t.matches('input[type="checkbox"]')) {
      if (t.hasAttribute("checked")) t.removeAttribute("checked");
      else t.setAttribute("checked", "");
      log.push(`set:${where(t)}=${labelOf(t)}${t.hasAttribute("checked") ? "" : " off"}`);
      refresh();
      return;
    }
    const button = t.closest("button");
    if (!button) return;
    const aria = button.getAttribute("aria-label") ?? "";
    if (button.id.startsWith("clear_ques_")) {
      for (const r of button.closest("[data-key]")!.querySelectorAll("input")) r.removeAttribute("checked");
      log.push(`clear:${where(button)}`);
      refresh();
    } else if (button.id === facts.add) {
      if (count >= max) return;
      count++;
      slot(count).removeAttribute("hidden");
      log.push(`add:${count}`);
      refresh();
    } else if (aria.startsWith(`Remove ${facts.noun} `)) {
      const n = Number(/ (\d+) question/.exec(aria)![1]);
      log.push(`remove:${n}`);
      const confirm = doc.createElement("mat-dialog-container");
      confirm.id = "confirm";
      confirm.setAttribute("data-removing", String(n));
      confirm.innerHTML = `<button type="button" id="alert_rc_c">Cancel</button><button type="button" id="alert_rc_r">Remove</button>`;
      doc.body.appendChild(confirm);
    } else if (button.id === "alert_rc_r" || button.id === "alert_rc_c") {
      const dialog = doc.getElementById("confirm")!;
      const n = Number(dialog.getAttribute("data-removing"));
      dialog.remove();
      log.push(`confirm:${button.id === "alert_rc_r" ? "remove" : "cancel"}`);
      if (button.id === "alert_rc_r") {
        // Only the end slot was ever recorded; removing it just lowers the counter and keeps the answers.
        if (n !== count) log.push(`remove-middle:${n}`);
        slot(count).setAttribute("hidden", "");
        count--;
        refresh();
      }
    } else if (button.id === facts.cont) {
      log.push("continue");
      (globalThis as { location?: unknown }).location = { pathname: page === "activities" ? "/common/7/250" : "/common/4/22" };
    }
  });

  return {
    doc,
    log,
    count: () => count,
    raw: (n) => Object.fromEntries(qs.map((q) => [q.key, value(n, q)])),
  };
}
