// Test helpers: fake UC "Activities & awards" pages (docs/superpowers/research/2026-10-27-portal-dom.md §7) so the handlers in activities.ts
// can run end to end on linkedom. Not used by the extension bundle.
//   fakeUcList: form#activitiesForm with items (div.acordion > fieldset.form-section > section), Delete -> popup #mdl (Yes / No),
//               #add_activity and #no_activities. Every press is logged.
//   fakeUcForm: form#addActivitiesForm with all categories' boxes in the page; changing #typeofactivity shows one set, ticking a grade shows
//               its after-12th selects / work boxes, the "still working" radio shows the dates. Textareas carry class char_count_<N> and are cut
//               on keyup (a line break counts 2); #save checks hours (1-168) and weeks (1-52) like jquery.validate, or "saves" the visible set.
// linkedom has no layout, no checked property and no select value setter: those are given browser behaviour here.

import { html } from "../commonapp/test-dom.ts";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/** Gives checkboxes and radios a checked property that click() toggles (with a change event), and selects a value setter. */
function behave(doc: Document): void {
  const view = doc.defaultView as unknown as { Event: typeof Event };
  for (const sel of doc.querySelectorAll("select") as unknown as HTMLSelectElement[]) {
    let idx = 0;
    Object.defineProperty(sel, "selectedIndex", { get: () => idx, set: (i: number) => (idx = i), configurable: true });
    Object.defineProperty(sel, "value", { get: () => sel.options[idx]?.value ?? "", set: (v: string) => (idx = [...sel.options].findIndex((x) => x.value === v)), configurable: true });
  }
  for (const box of doc.querySelectorAll('input[type="checkbox"], input[type="radio"]') as unknown as HTMLInputElement[]) {
    let on = false;
    Object.defineProperty(box, "checked", { get: () => on, set: (v: boolean) => (on = v), configurable: true });
    const real = box.click.bind(box);
    box.click = () => {
      real();
      if (box.type === "checkbox") on = !on;
      else {
        for (const o of doc.querySelectorAll('input[type="radio"]') as unknown as HTMLInputElement[]) if (o.name === box.name) o.checked = false;
        on = true;
      }
      box.dispatchEvent(new view.Event("change", { bubbles: true }));
    };
  }
}

// ── List page ──

export type FakeUcItem = { activityId: string; cat: string; label: string; name: string; shown?: Record<string, string[]> };
export type FakeUcList = { doc: Document; log: string[]; items: () => string[] };

export function fakeUcList(items: FakeUcItem[]): FakeUcList {
  const section = (it: FakeUcItem, n: number) => {
    const shown = Object.entries(it.shown ?? {}).map(([h, ds]) => `<p class="subsectionheader">${esc(h)}</p>${ds.map((d) => `<p class="description">${esc(d)}</p>`).join("")}`).join("");
    return `<div class="acordion" data-id="${esc(it.activityId)}"><fieldset class="form-section"><section>
      <a class="expand">${n}. ${esc(it.label)}</a><span class="activitySubtitle">${esc(it.name)}</span>
      <button type="button" id="edit_${it.cat}_${n}_${it.activityId}">Edit</button><button type="button" id="delete_${it.cat}_${n}_${it.activityId}">Delete</button>
      <div class="section-content">${shown}</div></section></fieldset></div>`;
  };
  const doc = html(`<form id="activitiesForm">${items.map((it, i) => section(it, i + 1)).join("")}
    <button type="button" id="add_activity">${items.length ? "Add another activity or award" : "Add an activity or award"}</button>
    <button type="button" id="no_activities">${items.length ? "I've finished adding activities" : "I have no activities or awards to report"}</button></form>
    <div id="mdl" style="display:none"><p>Are you sure you want to delete this activity?</p><button id="warningYesButton">Yes</button><button id="warningNoButton">No</button></div>`);
  const log: string[] = [];
  const mdl = doc.getElementById("mdl") as HTMLElement;
  let pending: string | null = null;
  doc.addEventListener("click", (e) => {
    const t = e.target as Element;
    const m = /^delete_[^_]+_\d+_(.+)$/.exec(t.id ?? "");
    if (m) {
      pending = m[1]!;
      mdl.style.display = "block";
      log.push(`delete:${pending}`);
    } else if (t.id === "warningYesButton") {
      log.push(`yes:${pending}`);
      doc.querySelector(`.acordion[data-id="${pending}"]`)?.remove();
      mdl.style.display = "none";
    } else if (t.id === "warningNoButton") {
      log.push("no");
      mdl.style.display = "none";
    } else if (t.id) {
      log.push(`click:${t.id}`);
    }
  });
  return { doc, log, items: () => [...doc.querySelectorAll(".acordion")].map((a) => a.getAttribute("data-id")!) };
}

// ── Add / edit form ──

type Box = { id: string; kind: "text" | "area" | "check" | "select" | "radio"; label: string; needs?: string; max?: number; options?: string[]; name?: string; value?: string };
type Cat = { type: string; boxes: Box[] };

const text = (id: string, label: string, needs?: string): Box => ({ id, kind: "text", label, max: 60, needs });
const area = (id: string, label: string, max: number): Box => ({ id, kind: "area", label, max });
const check = (id: string, label: string, needs?: string): Box => ({ id, kind: "check", label, needs });
const hours = (id: string, label: string, needs?: string): Box => ({ id, kind: "text", label, needs });
const zero = (n: number) => String(n).padStart(2, "0");

function grades(prefix: string, after: { years: string; months: string } | null): Box[] {
  return [
    ...["9th", "10th", "11th", "12th", "After12th"].map((g) => check(`is${prefix}${g}`, `${g} grade`)),
    ...(after
      ? [
          { id: after.years, kind: "select" as const, label: "Years after 12th grade", needs: `is${prefix}After12th`, options: range(0, 11).map(String) },
          { id: after.months, kind: "select" as const, label: "Months after 12th grade", needs: `is${prefix}After12th`, options: range(0, 11).map(String) },
        ]
      : []),
  ];
}
function timed(prefix: string, lower: string, name: Box, description: Box, extra?: Box): Box[] {
  return [name, ...(extra ? [extra] : []), description, ...grades(prefix, { years: `${lower}YearsAfter12`, months: `${lower}MonthsAfter12` }), hours(`${lower}HoursPerWeek`, "Hours per week"), hours(`${lower}WeeksPerYear`, "Weeks per year")];
}
function workGrid(): Box[] {
  const out: Box[] = [];
  for (const g of ["9th", "10th", "11th", "12th", "After12th"]) {
    const stem = g === "After12th" ? "workExpAfter12th" : `workExp${g}`;
    out.push(
      check(`isWorkExpSchool${g}`, `${g} school year`, `isWorkExp${g}`),
      hours(`${stem}SchoolHoursPerWeek`, `${g} school hours`, `isWorkExpSchool${g}`),
      check(`isWorkExpSummer${g}`, `${g} summer`, `isWorkExp${g}`),
      hours(`${stem}SummerHoursPerWeek`, `${g} summer hours`, `isWorkExpSummer${g}`),
    );
  }
  return out;
}
const MONTHS = range(1, 12).map(zero);

const CATS: Cat[] = [
  {
    type: "Award",
    boxes: [
      text("awardName", "Award name"),
      ...["School", "City", "State", "Region", "National", "Intl"].map((l) => check(`isAwardLevel${l}`, l)),
      { id: "awardType-A", kind: "radio", label: "Academic", name: "awardType", value: "A" },
      { id: "awardType-O", kind: "radio", label: "Non-academic", name: "awardType", value: "O" },
      ...grades("Award", null).map((b) => b),
      area("awardRequirements", "Eligibility requirements", 250),
      area("awardAchievement", "What did you do to achieve this award", 350),
    ],
  },
  { type: "ExtraCurr", boxes: timed("ExtraCurr", "extraCurr", text("extraCurName", "Name of the activity"), area("extraCurrDescription", "What did you do?", 350)) },
  {
    type: "WorkExp",
    boxes: [
      text("workExpName", "Where did you work?"),
      area("workExpDesc", "Describe the organization", 250),
      text("workExpPosTitle", "Job title"),
      area("workExpPosDesc", "Job responsibilities", 350),
      ...grades("WorkExp", { years: "workExpAfter12thYears", months: "workExpAfter12thMonths" }),
      ...workGrid(),
      { id: "isWorkExpCurrWorking-N", kind: "radio", label: "No longer working", name: "isWorkExpCurrWorking", value: "N" },
      { id: "isWorkExpCurrWorking-Y", kind: "radio", label: "Still working", name: "isWorkExpCurrWorking", value: "Y" },
      { id: "workExpStartMonth", kind: "select", label: "Start month", options: MONTHS, needs: "isWorkExpCurrWorking=*" },
      { id: "workExpStartYear", kind: "select", label: "Start year", options: range(2005, 2026).map(String), needs: "isWorkExpCurrWorking=*" },
      { id: "workExpEndMonth", kind: "select", label: "End month", options: MONTHS, needs: "isWorkExpCurrWorking=N" },
      { id: "workExpEndYear", kind: "select", label: "End year", options: range(2005, 2027).map(String), needs: "isWorkExpCurrWorking=N" },
    ],
  },
];

function boxHtml(b: Box): string {
  const cls = b.kind === "area" ? ` class="char_count_${b.max}"` : b.id.endsWith("HoursPerWeek") ? ` class="hoursPerWeek"` : "";
  const label = `<label for="${b.id}">${esc(b.label)}</label>`;
  let control: string;
  switch (b.kind) {
    case "text": control = `<input type="text" id="${b.id}" name="${b.id}"${cls}${b.max ? ` maxlength="${b.max}"` : ""}>`; break;
    case "area": control = `<textarea id="${b.id}" name="${b.id}"${cls}></textarea>`; break;
    case "check": control = `<input type="checkbox" id="${b.id}" name="${b.id}" value="Y">`; break;
    case "radio": control = `<input type="radio" id="${b.id}" name="${b.name}" value="${b.value}">`; break;
    default: control = `<select id="${b.id}" name="${b.id}">${(b.options ?? []).map((o) => `<option value="${o}">${o}</option>`).join("")}</select>`;
  }
  return `<div class="box"${b.needs ? ` data-needs="${b.needs}"` : ""}>${label}${control}</div>`;
}

export type FakeUcFormOptions = {
  /** Cut every textarea to this many characters on keyup whatever its class says (a page that cuts differently than announced). */
  cutAll?: number;
  /** Add a bare "ghost" box that never shows: the plan's box is missing. */
  hide?: string[];
};
/** log: "category:<type>", "type:<id>", "check:<id>", "radio:<name>=<value>", "select:<id>=<value>", "save", "cancel". saved: the visible boxes at the Save press. */
export type FakeUcForm = { doc: Document; log: string[]; saved: () => Record<string, string | boolean> | null; errors: () => string[] };

export function fakeUcForm(o: FakeUcFormOptions = {}): FakeUcForm {
  const sets = CATS.map((c) => `<div class="set" data-set="${c.type}">${c.boxes.map(boxHtml).join("")}</div>`).join("");
  const doc = html(`<form id="addActivitiesForm"><select id="typeofactivity" name="activityType"><option value="">Select</option>${CATS.map((c) => `<option value="${c.type}">${c.type}</option>`).join("")}</select>
    ${sets}<div id="alertDiv" style="display:none">There are some errors below...</div>
    <button type="button" id="save">Save &amp; continue</button><button type="button" id="cancel-btn">Cancel</button></form>`);
  behave(doc);
  const log: string[] = [];
  let saved: Record<string, string | boolean> | null = null;
  const $ = <T extends HTMLElement>(sel: string) => doc.querySelector(sel) as unknown as T;
  const all = (sel: string) => [...doc.querySelectorAll(sel)] as unknown as HTMLInputElement[];
  const category = () => $<HTMLSelectElement>("#typeofactivity");

  const on = (needs: string): boolean => {
    if (needs.includes("=")) {
      const [name, v] = needs.split("=") as [string, string];
      return all(`input[type="radio"]`).some((r) => r.name === name && r.checked && (v === "*" || r.value === v));
    }
    return (doc.getElementById(needs) as HTMLInputElement).checked;
  };
  const refresh = () => {
    for (const s of all(".set")) (s as HTMLElement).style.display = s.getAttribute("data-set") === category().value ? "block" : "none";
    // Dependent boxes show only while their controlling box is on (a hidden one also hides what depends on it).
    for (const b of all("[data-needs]")) (b as HTMLElement).style.display = on(b.getAttribute("data-needs")!) && !o.hide?.includes(b.querySelector("[id]")!.id) ? "block" : "none";
    for (const id of o.hide ?? []) {
      const el = doc.getElementById(id)?.closest(".box") as HTMLElement | null;
      if (el) el.style.display = "none";
    }
  };
  doc.addEventListener("change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "typeofactivity") log.push(`category:${t.value}`);
    else if (t.type === "checkbox") log.push(`check:${t.id}`);
    else if (t.type === "radio") log.push(`radio:${t.name}=${t.value}`);
    else if (t.tagName === "SELECT") log.push(`select:${t.id}=${t.value}`);
    refresh();
  });
  doc.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.tagName !== "SELECT" && t.type !== "checkbox" && t.type !== "radio") log.push(`type:${t.id}`);
  });
  // updateCharacterCountApp: cut to the class's limit counting a line break as 2, on keyup.
  doc.addEventListener("keyup", (e) => {
    const t = e.target as HTMLTextAreaElement;
    const m = /char_count_(\d+)/.exec(t.getAttribute?.("class") ?? "");
    if (!m) return;
    const limit = o.cutAll ?? Number(m[1]);
    let v = t.value;
    while (v.length + (v.match(/\n/g)?.length ?? 0) > limit) v = v.slice(0, -1);
    t.value = v;
  });
  const shownEl = (el: Element): boolean => {
    for (let e: Element | null = el; e; e = e.parentElement) if ((e as HTMLElement).style?.display === "none") return false;
    return true;
  };
  const errorsOf = () => all('[id$="-error"]').filter((l) => shownEl(l)).map((l) => l.textContent ?? "");
  const check_ = (id: string, lo: number, hi: number) => {
    const el = doc.getElementById(id) as HTMLInputElement | null;
    const box = el?.closest(".box") as HTMLElement | null;
    if (!el || !box || !shownEl(el)) return;
    const n = Number(el.value);
    const old = doc.getElementById(`${id}-error`);
    old?.remove();
    if (el.value === "" || !Number.isFinite(n) || n < lo || n > hi) {
      box.insertAdjacentHTML("beforeend", `<label id="${id}-error" class="error" style="display:block">Please enter a number between ${lo} and ${hi}.</label>`);
    }
  };
  doc.getElementById("save")!.addEventListener("click", () => {
    log.push("save");
    for (const el of all("input.hoursPerWeek")) check_(el.id, 1, 168);
    for (const el of all('input[id$="WeeksPerYear"]')) check_(el.id, 1, 52);
    const bad = errorsOf().length > 0;
    ($("#alertDiv")).style.display = bad ? "block" : "none";
    if (bad) return;
    const out: Record<string, string | boolean> = { activityType: category().value };
    for (const el of all(".set .box input, .set .box textarea, .set .box select")) {
      if (!shownEl(el)) continue;
      if (el.type === "checkbox" || el.type === "radio") {
        if (el.checked) out[el.type === "radio" ? el.name : el.id] = el.type === "radio" ? el.value : true;
      } else out[el.id] = el.value;
    }
    saved = out;
  });
  doc.getElementById("cancel-btn")!.addEventListener("click", () => log.push("cancel"));
  refresh();
  return { doc, log, saved: () => saved, errors: errorsOf };
}
