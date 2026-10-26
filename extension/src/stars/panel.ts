// Side panel section for STARS: "Add courses" for the school year whose coursework page is open. Each course is saved with STARS's own
// Save Course button; the student's existing courses are never changed or removed (names already on the page are skipped).

import type { StarsPagePlan } from "../../../web/lib/stars-fill.ts";
import { afterReload, sendTo as send } from "../tab-wait.ts";
import { button, h } from "../ui.ts";
import { planForPage, runStarsYear, type StarsTab } from "./run.ts";

const PICKS_KEY = "starsScalePicks";

async function loadPicks(): Promise<string[]> {
  try {
    const v = (await chrome.storage.local.get(PICKS_KEY))[PICKS_KEY];
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}
async function savePicks(picks: string[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [PICKS_KEY]: picks });
  } catch {
    // only a convenience: the question is asked again next time
  }
}

const yearText = (endYear: number) => `${endYear - 1}-${String(endYear % 100).padStart(2, "0")}`;

/** The section, or a note when this STARS page is not a coursework page. */
export async function starsAutoView(plans: StarsPagePlan[], tabId: number): Promise<HTMLElement> {
  const page = await send(tabId, { type: "starsPage" });
  const year = page?.type === "starsPage" ? page.year : null;
  if (page?.type !== "starsPage" || year == null) {
    return h("p", { class: "note" }, "To add courses automatically, open a year's coursework page on STARS (Enter Coursework, then a grade).");
  }
  const plan = planForPage(plans, page);
  if (!plan || !plan.rows.length) {
    const many = plans.filter((p) => p.kind === page.kind && p.endYear === year).length > 1;
    return h("p", { class: "note" }, many
      ? `Several schools in your transcript have ${yearText(year)} courses and this page's school name matches none of them exactly: give the school the same name in the tracker as on STARS.`
      : `Your transcript has no courses to add for ${yearText(year)} at a ${page.kind === "us" ? "US" : "non-US"} school.`);
  }
  const existing = page?.type === "starsPage" ? page.existing : [];

  const picks = await loadPicks();
  const questions = plan.scaleQuestions.map((options) => {
    const select = h("select", { "aria-label": "Grading Scale" }) as HTMLSelectElement;
    select.append(h("option", { value: "" }, "Choose your school's scale..."));
    for (const o of options) {
      const opt = h("option", { value: o }, o) as HTMLOptionElement;
      opt.selected = picks.includes(o);
      select.append(opt);
    }
    return select;
  });
  const chosen = () => questions.map((q) => q.value).filter(Boolean);

  const status = h("p", { class: "status" }, `${plan.rows.length} courses for ${yearText(year)}; names already on this page are skipped.`);
  let stop = false;
  const stopBtn = button("Stop", () => {
    stop = true;
    stopBtn.disabled = true;
  }, "btn danger", true);
  const go = button("Add courses to STARS", async () => {
    if (questions.some((q) => !q.value)) {
      status.textContent = "Choose the Grading Scale first (your school's passing mark decides which).";
      status.className = "status warn";
      return;
    }
    await savePicks([...new Set([...picks.filter((p) => !plan.scaleQuestions.flat().includes(p)), ...chosen()])]);
    stop = false;
    go.disabled = true;
    stopBtn.disabled = false;
    const tab: StarsTab = { send: (m) => send(tabId, m), afterSave: () => afterReload(tabId, "STARS") };
    const r = await runStarsYear(plan, chosen(), tab, () => stop, (t) => (status.textContent = t));
    go.disabled = false;
    stopBtn.disabled = true;
    status.className = r.stopped ? "status warn" : "status";
    status.textContent = [
      `Added ${r.added.length} course${r.added.length === 1 ? "" : "s"}${r.added.length ? `: ${r.added.join(", ")}` : ""}.`,
      r.skippedExisting ? `${r.skippedExisting} already on STARS were left alone.` : "",
      r.stopped ?? "Check each course on STARS.",
    ].filter(Boolean).join(" ");
  }, "btn primary");

  return h(
    "section",
    { class: "item" },
    h("h3", {}, `Add ${yearText(year)} courses automatically`),
    h("p", { class: "muted" }, `${existing.length ? `STARS already lists ${new Set(existing).size} course name(s) for this year. ` : ""}Each course is saved with STARS's Save Course button; nothing is removed or submitted.`),
    ...questions.map((q) => h("label", { class: "picker" }, "Grading Scale ", q)),
    status,
    h("div", { class: "row" }, go, stopBtn),
    plan.warnings.length ? h("ul", { class: "warnings" }, ...plan.warnings.map((w) => h("li", {}, w))) : false,
    plan.skipped.length ? h("details", {}, h("summary", {}, `Left for you (${plan.skipped.length})`), h("ul", {}, ...plan.skipped.map((s) => h("li", {}, `${s.course}: ${s.field}: ${s.reason}`)))) : false,
  );
}
