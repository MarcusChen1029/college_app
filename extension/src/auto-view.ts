// Side panel "Fill selected" section shared by the portals that fill several pages (UC grades, STARS school years): one tick per page,
// pre-ticked, one button, a Stop button, then a short report per page that names only what needs the student. Works from any page of
// the portal: the runner opens each page itself.

import { button, h, type Child } from "./ui.ts";

export type AutoItem<P> = { plan: P; label: string };
/** One page's report: `done` lines, then `problems` (shown as warnings) and `left` (courses the student enters by hand). */
export type AutoReport = { title: string; done: string[]; problems: string[]; left: string[] };

export function autoView<P>(o: {
  title: string;
  intro: string;
  items: AutoItem<P>[];
  /** Questions asked once before the run (STARS's grading scale, language). */
  options?: Child[];
  /** Checks and remembers the options; a sentence stops the run before it starts. */
  before?: () => Promise<string | null>;
  run(plans: P[], shouldStop: () => boolean, progress: (text: string) => void): Promise<{ reports: AutoReport[]; stopped: boolean }>;
  footer?: Child[];
}): HTMLElement {
  const ticked = new Set(o.items.map((_, i) => i));
  const boxes = o.items.map((item, i) => {
    const box = h("input", { type: "checkbox" }) as HTMLInputElement;
    box.checked = true;
    box.addEventListener("change", () => {
      if (box.checked) ticked.add(i);
      else ticked.delete(i);
      go.disabled = ticked.size === 0;
    });
    return h("label", { class: "check" }, box, h("span", {}, item.label));
  });
  const status = h("p", { class: "status" }, "");
  const results = h("div", {});
  let stop = false;
  const stopBtn = button("Stop", () => {
    stop = true;
    stopBtn.disabled = true;
    status.textContent = "Stopping after the current course...";
  }, "btn danger", true);
  const go = button("Fill selected", async () => {
    const plans = o.items.filter((_, i) => ticked.has(i)).map((x) => x.plan);
    const blocked = (await o.before?.()) ?? null;
    if (blocked) {
      status.textContent = blocked;
      status.className = "status warn";
      return;
    }
    stop = false;
    go.disabled = true;
    stopBtn.disabled = false;
    boxes.forEach((b) => ((b.querySelector("input") as HTMLInputElement).disabled = true));
    results.replaceChildren();
    status.className = "status";
    const { reports, stopped } = await o.run(plans, () => stop, (t) => (status.textContent = t));
    go.disabled = false;
    stopBtn.disabled = true;
    boxes.forEach((b) => ((b.querySelector("input") as HTMLInputElement).disabled = false));
    const trouble = reports.filter((r) => r.problems.length || r.left.length).length;
    status.className = stopped || trouble ? "status warn" : "status";
    status.textContent = stopped
      ? `Stopped after ${reports.length} of ${plans.length}.`
      : trouble
        ? `Done. ${trouble} of ${reports.length} need a look (below); the rest are complete.`
        : `Done: all ${reports.length} filled and saved. Nothing needs checking.`;
    results.replaceChildren(...reports.map(reportEl));
  }, "btn primary", o.items.length === 0);
  return h(
    "section",
    { class: "item" },
    h("h3", {}, o.title),
    h("p", { class: "muted" }, o.intro),
    o.items.length ? h("div", { class: "list" }, ...boxes) : h("p", { class: "note" }, "Your transcript has no courses to add here."),
    ...(o.options ?? []),
    status,
    h("div", { class: "row" }, go, stopBtn),
    results,
    ...(o.footer ?? []),
  );
}

function reportEl(r: AutoReport): HTMLElement {
  return h(
    "section",
    { class: "item" },
    h("h4", {}, r.title),
    ...r.done.map((d) => h("p", { class: "done" }, d)),
    ...r.problems.map((p) => h("p", { class: "warn" }, p)),
    r.left.length ? h("p", { class: "note" }, `Enter by hand (the tracker can't fill a box for them): ${r.left.join(", ")}.`) : false,
  );
}
