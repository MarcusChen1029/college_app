// Side panel pieces of the activities fill (Common App activities / honors, UC activities & awards): the Replace question, the "which to add"
// toggle list and the report.
// No chrome.* here: panel.ts wires the run (activities-flow.ts) to these. All text goes in with textContent (names are data, not markup).
// The panel is English-only (it has no i18n layer); the tracker's display translations live in web/lib/i18n.

import { askReplaceText, noun, portalOf, type ActivitiesReport, type ActPage, type AskUi } from "./activities-flow.ts";
import { button, h, type Child } from "./ui.ts";

export const PAGE_NAME: Record<ActPage, { title: string; plural: string; openHint: string }> = {
  activities: { title: "Activities", plural: "activities", openHint: "Open the Activities page of your Common App (Activities section) in this window first." },
  honors: { title: "Honors", plural: "honors", openHint: "Open the Honors page of your Common App (Education section) in this window first." },
  uc: { title: "Activities & awards", plural: "activities and awards", openHint: "Open the Activities & awards list of your UC application in this window first." },
};

/**
 * The questions of one run, drawn into `prompt`. `cancel(error)` is the Stop button: a pending question rejects, so the run ends before
 * anything on the portal is touched.
 */
export function createAskUi(prompt: HTMLElement, page: ActPage): { ui: AskUi; cancel(error: Error): void } {
  let reject: ((e: Error) => void) | null = null;
  /** Set by cancel(): a question asked later (Stop pressed while the page was still being checked) is refused at once. */
  let cancelled: Error | null = null;
  const finish = () => {
    reject = null;
    prompt.replaceChildren();
  };
  const ui: AskUi = {
    askReplace(existing, incoming) {
      if (cancelled) return Promise.reject(cancelled);
      return new Promise<boolean>((resolve, rej) => {
        reject = rej;
        const answer = (yes: boolean) => {
          finish();
          resolve(yes);
        };
        prompt.replaceChildren(
          h(
            "div",
            { class: "ask" },
            h("p", {}, askReplaceText(page, existing.length, incoming)),
            h("p", { class: "note" }, `${existing.length === 1 ? "This one" : "These"} would be removed from ${portalOf(page)}:`),
            h("ul", {}, ...existing.map((name) => h("li", {}, name))),
            h(
              "div",
              { class: "row" },
              button("No, let me choose what to add", () => answer(false), "btn primary"),
              button(existing.length === 1 ? "Yes, replace it" : "Yes, replace all", () => answer(true), "btn danger"),
            ),
          ),
        );
      });
    },
    pick(items, max) {
      if (cancelled) return Promise.reject(cancelled);
      return new Promise<string[]>((resolve, rej) => {
        reject = rej;
        const on = new Set<string>();
        const counter = h("p", { class: "status" }, "");
        const add = button("Add the chosen", () => {
          finish();
          resolve(items.filter((i) => on.has(i.id)).map((i) => i.id));
        }, "btn primary", true);
        const boxes = items.map((item) => {
          const box = h("input", { type: "checkbox" }) as HTMLInputElement;
          box.addEventListener("change", () => {
            if (box.checked) on.add(item.id);
            else on.delete(item.id);
            sync();
          });
          return { box, label: h("label", { class: "check" }, box, h("span", {}, item.label)) };
        });
        // Once the page's room is used up, the switches that are off cannot be turned on.
        function sync(): void {
          counter.textContent = `Room left on the page: ${max - on.size} of ${max}`;
          for (const { box } of boxes) box.disabled = !box.checked && on.size >= max;
          add.disabled = on.size === 0;
        }
        sync();
        prompt.replaceChildren(
          h(
            "div",
            { class: "ask" },
            h("p", {}, `Choose what to add to the ${PAGE_NAME[page].plural} already on ${portalOf(page)}.`),
            counter,
            h("div", { class: "list" }, ...boxes.map((b) => b.label)),
            h("div", { class: "row" }, add, button("Add none", () => { finish(); resolve([]); }, "btn")),
          ),
        );
      });
    },
  };
  return {
    ui,
    cancel(error) {
      cancelled = error;
      const r = reject;
      finish();
      r?.(error);
    },
  };
}

const count = (n: number, page: ActPage) => `${n} ${noun(page, n)}`;

/** The headline of a report, and whether it needs a look. */
export function reportStatus(page: ActPage, r: ActivitiesReport): { text: string; warn: boolean } {
  if (r.stopped) return { text: "Stopped", warn: true };
  if (r.note && r.filled.length === 0) return { text: r.note, warn: false };
  const trouble = r.mismatches.length > 0 || r.blocked.length > 0 || r.blanks.length > 0 || r.notAdded.length > 0;
  return { text: trouble ? `Done: ${count(r.filled.length, page)} filled, but some things need a look (below).` : `Done: ${count(r.filled.length, page)} filled and checked.`, warn: trouble };
}

const problemList = (title: string, items: { label: string; reasons: string[] }[]): Child =>
  items.length
    ? h("section", { class: "attention", role: "note" }, h("h4", {}, title), h("ul", {}, ...items.map((p) => h("li", {}, h("strong", {}, p.label), ` — ${p.reasons.join("; ")}`))))
    : false;

/** Everything the report shows below the headline, in the order the student needs it. */
export function reportNodes(page: ActPage, r: ActivitiesReport): Child[] {
  return [
    r.stopped ? h("p", { class: "warn", role: "alert" }, r.stopped) : false,
    r.note && r.filled.length > 0 ? h("p", { class: "note" }, r.note) : false,
    r.filled.length ? h("p", { class: "done" }, `Filled ${count(r.filled.length, page)}: ${r.filled.join(", ")}`) : false,
    r.replaced ? h("p", { class: "note" }, r.replaced) : false,
    ...r.notes.map((n) => h("p", { class: "note" }, n)),
    problemList(`Not added: ${portalOf(page)} would not accept these`, r.blocked),
    problemList("Added, but these questions are blank and need an answer", r.blanks),
    r.notAdded.length ? h("p", { class: "warn" }, `Not added: ${r.notAdded.join(", ")}.`) : false,
    r.mismatches.length
      ? h("section", { class: "attention", role: "alert" }, h("h4", {}, `${portalOf(page)} shows something different from what was entered`), h("ul", {}, ...r.mismatches.map((m) => h("li", {}, m))))
      : false,
  ];
}
