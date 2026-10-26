// Side panel view of the fill assistant for UC, STARS, Cal State Apply, UIUC and UT: the system's entry plan (web/lib/system-fill.ts),
// course by course, with one button per value. Pressing a value types it into the box last clicked on the portal tab and moves to the
// next box; "Fill from here" runs a course's values in order. When a value can't go in, it is copied to the clipboard instead.

import { rowValues, type EntryRow, type FillSystem, type SystemPlan } from "../../web/lib/system-fill.ts";
import type { AssistMessage, AssistResponse } from "./messages.ts";
import { button, h } from "./ui.ts";

const STATUS_NOTE = { unverified: " (unconfirmed wording: check it matches the page)" } as const;

async function send(tabId: number | null, msg: AssistMessage): Promise<AssistResponse | null> {
  if (tabId == null) return null;
  try {
    return ((await chrome.tabs.sendMessage(tabId, msg)) as AssistResponse | undefined) ?? null;
  } catch {
    return null;
  }
}

async function copy(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

const doneKey = (system: FillSystem) => `assistDone:${system}`;

async function loadDone(system: FillSystem): Promise<Set<string>> {
  try {
    const got = await chrome.storage.local.get(doneKey(system));
    const ids = got[doneKey(system)];
    return new Set(Array.isArray(ids) ? (ids as string[]) : []);
  } catch {
    return new Set();
  }
}
async function saveDone(system: FillSystem, ids: Set<string>): Promise<void> {
  try {
    await chrome.storage.local.set({ [doneKey(system)]: [...ids] });
  } catch {
    // the ticks are a convenience; nothing else depends on them
  }
}

/** Builds the assistant for `plan`. `tabId` is the portal tab (null when the active tab is not on this system: buttons then copy). */
/** `auto`: the system's automatic filler section, shown above the course list when the open page supports one. */
export async function assistView(plan: SystemPlan, tabId: number | null, auto: HTMLElement | null = null): Promise<HTMLElement> {
  const done = await loadDone(plan.system);
  const status = h("p", { class: "status" }, tabId == null ? "Open the portal in this window to type values in. Until then, pressing a value copies it." : "Click a box on the page, then press the value here.");

  const report = (text: string, warn = false) => {
    status.textContent = text;
    status.className = warn ? "status warn" : "status";
  };

  /** Puts one value in (or copies it). Returns false when it did not go into the page. */
  const put = async (label: string, value: string, advance = true): Promise<boolean> => {
    const r = await send(tabId, { type: "assistInsert", value, advance });
    if (r?.type === "assistInsert" && r.result.ok) {
      report(`${label}: "${value}" ${r.result.how}${r.label ? ` into "${r.label}"` : ""}.`);
      return true;
    }
    const why = r?.type === "assistInsert" && !r.result.ok ? r.result.reason : tabId == null ? "" : "The page did not answer; reload it.";
    const copied = await copy(value);
    report(`${why}${why ? " " : ""}${copied ? `Copied "${value}": paste it with Ctrl+V.` : `Could not copy "${value}".`}`, !!why);
    return false;
  };

  const fillFrom = async (row: EntryRow) => {
    const values = rowValues(row);
    for (let i = 0; i < values.length; i++) {
      const v = values[i]!;
      if (!(await put(v.label, v.value))) {
        report(`Stopped at ${v.label} (${i} of ${values.length} filled). ${status.textContent}`, true);
        return;
      }
    }
    report(`${row.name}: ${values.length} values filled in page order. Check each box before you save.`);
  };

  const rowEl = (row: EntryRow) => {
    const tick = h("input", { type: "checkbox" }) as HTMLInputElement;
    tick.checked = done.has(row.trackerId);
    tick.addEventListener("change", () => {
      if (tick.checked) done.add(row.trackerId);
      else done.delete(row.trackerId);
      void saveDone(plan.system, done);
    });
    const values = rowValues(row).map((v, i) => {
      const f = row.fields[i];
      const unconfirmed = f?.status === "unverified" ? STATUS_NOTE.unverified : "";
      const b = button(`${v.label}: ${v.value}${unconfirmed ? " ?" : ""}`, () => void put(v.label, v.value), "chip");
      return withTitle(b, f?.note ? `${f.note}${unconfirmed}` : unconfirmed.trim());
    });
    return h(
      "section",
      { class: "item" },
      h("label", { class: "check" }, tick, h("strong", {}, row.name)),
      h("div", { class: "chips" }, ...values),
      ...row.warnings.map((w) => h("p", { class: "note" }, w)),
      button("Fill from here", () => void fillFrom(row), "link", tabId == null),
    );
  };

  return h(
    "div",
    {},
    h("h2", {}, `${plan.label}: fill assistant`),
    auto,
    status,
    h("p", { class: "muted" }, "Click the first box of a course on the page, then press \"Fill from here\" to type its values in page order, or press values one at a time. Nothing is saved or submitted for you."),
    plan.notes.length ? h("ul", { class: "warnings" }, ...plan.notes.map((n) => h("li", {}, n))) : false,
    ...plan.groups.flatMap((g) => [h("h3", {}, g.title), ...g.rows.map(rowEl)]),
    plan.groups.length ? false : h("p", { class: "note" }, "No courses from your transcript go into this system."),
    plan.skipped.length ? h("details", {}, h("summary", {}, `Not entered here (${plan.skipped.length})`), h("ul", {}, ...plan.skipped.map((s) => h("li", {}, `${s.course}: ${s.reason}`)))) : false,
  );
}

function withTitle<T extends HTMLElement>(el: T, title: string): T {
  if (title) el.title = title;
  return el;
}
