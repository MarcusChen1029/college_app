// Side panel "Fill selected" section shared by the portals that fill several pages (UC grades, STARS school years): one tick per page,
// pre-ticked, one button, a Stop button, then a short report per page that names only what needs the student. Works from any page of
// the portal: the runner opens each page itself.

import { button, h, type Child } from "./ui.ts";

export type AutoItem<P> = { plan: P; label: string };
/** A course the extension did not add because it needs the student's decision (no certain subject, a grade it can't take...). */
export type NeedsYou = { course: string; why: string };
/** One page's report: `done` lines, then `problems` (shown as warnings) and `left` (courses not added; they need the student). */
export type AutoReport = { title: string; done: string[]; problems: string[]; left: NeedsYou[] };

export function autoView<P>(o: {
  title: string;
  intro: string;
  items: AutoItem<P>[];
  /** Courses that will not be added until the student decides, by page title: shown before the run so nothing is a surprise. */
  pending?: { title: string; left: NeedsYou[] }[];
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
  const before = needsYouBox(o.pending ?? [], "before");
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
    const notAdded = reports.reduce((n, r) => n + r.left.length, 0);
    const trouble = reports.filter((r) => r.problems.length || r.left.length).length;
    status.className = stopped || trouble ? "status warn" : "status";
    status.textContent = stopped
      ? `Stopped after ${reports.length} of ${plans.length}.`
      : notAdded
        ? `Done, but ${notAdded} course${notAdded === 1 ? " was" : "s were"} NOT added: see the red box below.`
        : trouble
          ? `Done. ${trouble} of ${reports.length} need a look (below); the rest are complete.`
          : `Done: all ${reports.length} filled and saved. Nothing needs checking.`;
    before?.remove(); // the run's own box below says it again, with what actually happened
    results.replaceChildren(needsYouBox(reports, "after") ?? "", ...reports.map(reportEl));
    results.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }, "btn primary", o.items.length === 0);
  return h(
    "section",
    { class: "item" },
    h("h3", {}, o.title),
    h("p", { class: "muted" }, o.intro),
    o.items.length ? h("div", { class: "list" }, ...boxes) : h("p", { class: "note" }, "Your transcript has no courses to add here."),
    before ?? false,
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
    r.left.length ? h("p", { class: "warn" }, `Not added: ${r.left.map((x) => x.course).join(", ")} (see the red box).`) : false,
  );
}

/**
 * The courses that were not (or will not be) added because they need the student, in one red box: nothing is guessed, so every one of
 * them is named with the reason. null when there are none.
 */
function needsYouBox(pages: readonly { title: string; left: readonly NeedsYou[] }[], when: "before" | "after"): HTMLElement | null {
  const withLeft = pages.filter((p) => p.left.length);
  const n = withLeft.reduce((k, p) => k + p.left.length, 0);
  if (!n) return null;
  const head = when === "after"
    ? `${n} course${n === 1 ? " was" : "s were"} NOT added. They need you.`
    : `${n} course${n === 1 ? "" : "s"} will NOT be added until you decide.`;
  return h(
    "section",
    { class: "attention", role: when === "after" ? "alert" : "note" },
    h("h3", {}, `⚠ ${head}`),
    h("p", {}, "The extension never guesses how a portal should classify a course. Choose it in the tracker (Transcript > View as > the application > Override on the course) and run again, or add these courses on the portal yourself."),
    ...withLeft.flatMap((p) => [
      h("h4", {}, p.title),
      h("ul", {}, ...p.left.map((x) => h("li", {}, h("strong", {}, x.course), ` — ${x.why}`))),
    ]),
  );
}
