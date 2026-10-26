// Test helper: plays Common App's (Angular's) part on a linkedom fixture so fillCgGrade can run end to end, and records every click.
// Behaviour follows the recorded facts (docs/superpowers/research/2026-10-27-commonapp-dom.md §1): mat-select lists open in a
// .cdk-overlay-pane with id "<selectId>-panel"; picking a scale clears every grade; "Add another course" appends row n+1; a row's
// Remove opens a confirm with #alert_rc_r; Continue (and X) close the dialog. Not used by the extension bundle.

const SCALES = ["A-F", "1-100", "0.0-4.0", "0.0-5.0", "1-7", "1-10", "1-11", "1-20", "Other"];
const AF = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "E", "F"];
const WORDS = ["Incomplete", "No Grade", "Fail - (Pass/Fail)", "Pass - (Pass/Fail)", "S - Satisfactory", "U - Unsatisfactory", "Withdrawn", "Withdrawn - Failed", "Medical Excuse"];

const shownEl = (sel: Element) => sel.querySelector(".mat-mdc-select-value-text .mat-mdc-select-min-line");
const shown = (sel: Element) => (shownEl(sel)?.textContent ?? "").trim();
/** Sets what a mat-select shows (an empty select has a placeholder instead of the value span, so create it). */
function setShown(sel: Element, value: string): void {
  let el = shownEl(sel);
  if (!el) {
    const box = sel.querySelector(".mat-mdc-select-value") ?? sel;
    box.innerHTML = `<span class="mat-mdc-select-value-text"><span class="mat-mdc-select-min-line"></span></span>`;
    el = shownEl(sel)!;
  }
  el.textContent = value;
}

function optionsFor(doc: Document, id: string): string[] {
  if (id === "schoolNameControl1") return ["West Lafayette Junior-Senior High School"];
  if (id === "schoolYearControl1") return ["2024-25", "2023-24", "2022-23"];
  if (id === "gradingScaleControl1") return SCALES;
  if (id === "scheduleControl1") return ["Semesters", "Trimesters", "Quarters", "Yearly", "Other"];
  if (id.startsWith("subjectControl_")) return ["Algebra", "Geometry", "Biology", "English", "Other/Elective"];
  if (id.startsWith("levelControl_")) return ["Regular/Standard", "Honors", "High Honors", "Advanced Placement (AP)"];
  if (id.startsWith("grade")) {
    const scale = shown(doc.getElementById("gradingScaleControl1")!);
    const values = scale === "1-100" ? Array.from({ length: 106 }, (_, i) => String(105 - i)) : AF;
    return [...values, ...WORDS];
  }
  return [];
}

/** log: every click and pick; closed: the dialog element Continue/X removed (still readable after the fill). */
export type FakeCommonApp = { log: string[]; closed: Element | null };

/** Wires the fake onto `doc` (a C&G page). `log` gets "click:<id or text>" for every click, plus "pick:<selectId>=<text>" for each option chosen. */
export function fakeCommonApp(doc: Document): FakeCommonApp {
  const log: string[] = [];
  const fake: FakeCommonApp = { log, closed: null };
  let removing = 0;
  const addCG = doc.getElementById("addCG");
  if (addCG) (addCG as unknown as { getBoundingClientRect: () => { height: number; width: number } }).getBoundingClientRect = () => ({ height: 40, width: 120 });

  const rows = () => [...doc.querySelectorAll("ca-cng-course")];
  const blankRow = (row: Element) => {
    for (const i of row.querySelectorAll("input")) {
      (i as HTMLInputElement).value = "";
      i.removeAttribute("value");
      i.removeAttribute("readonly");
      i.removeAttribute("checked");
    }
    for (const s of row.querySelectorAll("mat-select")) setShown(s, "");
  };
  const renumber = (row: Element, from: number, to: number) => {
    const tmp = doc.createElement("div");
    tmp.innerHTML = row.outerHTML.replaceAll(`T1C${from}"`, `T1C${to}"`).replaceAll(`T1C${from}-input`, `T1C${to}-input`)
      .replaceAll(`Course ${from},`, `Course ${to},`).replaceAll(`course ${from} of`, `course ${to} of`);
    row.replaceWith(tmp.firstElementChild!);
  };

  doc.addEventListener("click", (e) => {
    const t = e.target as Element;
    const button = t.closest("button");
    const option = t.closest("mat-option");
    const select = t.closest("mat-select");
    log.push(`click:${(button ?? t).id || ((button ?? t).textContent ?? "").trim() || t.tagName.toLowerCase()}`);

    if (option) {
      const panel = option.closest('[role="listbox"]')!;
      const sel = doc.getElementById(panel.id.replace(/-panel$/, ""))!;
      const text = (option.textContent ?? "").trim();
      const value = text === "Clear selection" ? "" : text;
      const changed = value !== shown(sel);
      setShown(sel, value);
      log.push(`pick:${sel.id}=${value}`);
      if (sel.id === "gradingScaleControl1" && changed) for (const g of doc.querySelectorAll('mat-select[id^="grade"]')) setShown(g, "");
      panel.closest(".cdk-overlay-pane")!.remove();
      return;
    }
    if (select) {
      if (doc.getElementById(`${select.id}-panel`)) return;
      const cur = shown(select);
      const opts = ["Clear selection", ...optionsFor(doc, select.id)]
        .map((o) => `<mat-option role="option" aria-selected="${o === cur}"><span class="mdc-list-item__primary-text"> ${o} </span></mat-option>`).join("");
      const pane = doc.createElement("div");
      pane.className = "cdk-overlay-pane";
      pane.innerHTML = `<div role="listbox" id="${select.id}-panel">${opts}</div>`;
      doc.body.appendChild(pane);
      return;
    }
    if (t.matches('input[type="checkbox"]')) {
      const on = !t.hasAttribute("checked");
      if (on) t.setAttribute("checked", "");
      else t.removeAttribute("checked");
      for (const c of t.closest("ca-cng-course")?.querySelectorAll('input[id^="credit"][id*="Control_"]') ?? []) {
        if (on) c.setAttribute("readonly", "");
        else c.removeAttribute("readonly");
      }
      return;
    }
    if (t.matches('input[type="radio"]')) {
      for (const r of doc.querySelectorAll(`input[name="${t.getAttribute("name")}"]`)) r.removeAttribute("checked");
      t.setAttribute("checked", "");
      return;
    }
    if (!button) return;
    const label = (button.textContent ?? "").trim();
    const aria = button.getAttribute("aria-label") ?? "";
    if (label === "Add another course") {
      const last = rows()[rows().length - 1]!;
      const n = rows().length + 1;
      const tmp = doc.createElement("div");
      tmp.innerHTML = last.outerHTML.replaceAll(`T1C${n - 1}"`, `T1C${n}"`).replaceAll(`T1C${n - 1}-input`, `T1C${n}-input`)
        .replaceAll(`Course ${n - 1},`, `Course ${n},`).replaceAll(`course ${n - 1} of`, `course ${n} of`);
      const row = tmp.firstElementChild!;
      blankRow(row);
      last.after(row);
    } else if (aria.startsWith("Remove transcript 1, course ")) {
      removing = Number(/course (\d+) of/.exec(aria)![1]);
      const confirm = doc.createElement("mat-dialog-container");
      confirm.id = "confirm";
      confirm.innerHTML = `<button id="alert_rc_c">Cancel</button><button id="alert_rc_r">Remove</button>`;
      doc.body.appendChild(confirm);
    } else if (button.id === "alert_rc_r" || button.id === "alert_rc_c") {
      doc.getElementById("confirm")!.remove();
      if (button.id === "alert_rc_r") {
        const all = rows();
        all[removing - 1]!.remove();
        all.slice(removing).forEach((row, i) => renumber(row, removing + i + 1, removing + i));
      }
    } else if (button.id === "changePreferencesClose" || /^Continue/.test(label)) {
      fake.closed = doc.getElementById("changePreferencesTitle")?.closest("mat-dialog-container") ?? null;
      fake.closed?.remove();
    }
  });
  return fake;
}
