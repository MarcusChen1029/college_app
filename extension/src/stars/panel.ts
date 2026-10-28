// Side panel section for STARS, like Common App's: tick the school years, answer the grading scale (and language) once, press "Fill
// selected", and the extension opens each year's coursework page itself and adds the courses not there yet, one Save Course at a time.
// The student's existing courses are never changed or removed. Works from any STARS page.

import type { StarsPagePlan } from "../../../web/lib/stars-fill.ts";
import { autoView, type AutoReport } from "../auto-view.ts";
import { SITE_ORIGINS } from "../sites.ts";
import { afterReload, navigate, sendTo as send } from "../tab-wait.ts";
import { h } from "../ui.ts";
import { runStarsPlans, starsRowNeeds, type StarsTab, type StarsYearReport } from "./run.ts";

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

const LANGUAGE_KEY = "starsLanguage";

async function loadLanguage(): Promise<string> {
  try {
    const v = (await chrome.storage.local.get(LANGUAGE_KEY))[LANGUAGE_KEY];
    return typeof v === "string" && v.trim() ? v : "English";
  } catch {
    return "English";
  }
}

const yearText = (endYear: number) => `${endYear - 1}-${String(endYear % 100).padStart(2, "0")}`;
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

export function starsReport(r: StarsYearReport, schools: number): AutoReport {
  const { added, skippedExisting, stopped } = r.result;
  const done: string[] = [];
  if (added.length) done.push(`Added and saved ${plural(added.length, "course")}.`);
  if (skippedExisting) done.push(`${plural(skippedExisting, "course")} already on STARS left alone.`);
  if (!done.length && !stopped) done.push("Nothing new to add.");
  return {
    title: `${yearText(r.plan.endYear)}${schools > 1 ? `, ${r.plan.schoolName}` : ""}`,
    done,
    problems: stopped && stopped !== "Stopped." ? [stopped] : [],
    left: r.result.left,
  };
}

/** The STARS section for the student's whole transcript. */
export async function starsAutoView(plans: StarsPagePlan[], tabId: number): Promise<HTMLElement> {
  const items = plans.filter((p) => p.rows.length).sort((a, b) => a.endYear - b.endYear);
  const schools = new Set(items.map((p) => p.schoolName)).size;
  const picks = await loadPicks();
  // One question per distinct set of scale choices, across all years.
  const sets = [...new Map(items.flatMap((p) => p.scaleQuestions).map((q) => [q.join("|"), q])).values()];
  const questions = sets.map((options) => {
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
  // STARS's international page wants each course's language of instruction; the transcript doesn't say it, so the student says it once.
  const intl = items.some((p) => p.kind === "intl");
  const language = h("input", { type: "text", value: await loadLanguage(), "aria-label": "Language of instruction" }) as HTMLInputElement;
  const tab: StarsTab = {
    send: (m) => send(tabId, m),
    afterSave: () => afterReload(tabId, "STARS"),
    go: (path) => navigate(tabId, `${SITE_ORIGINS.stars[0]}${path}`, "STARS", "stars"),
  };
  return autoView({
    title: "Add your courses to STARS",
    intro: "Tick the school years, then Fill selected. The extension opens each year's coursework page in this tab and saves each new course with STARS's Save Course button. Courses already on STARS are left alone; nothing is removed or submitted.",
    pending: items.map((p) => ({
      title: `${yearText(p.endYear)}${schools > 1 ? `, ${p.schoolName}` : ""}`,
      left: p.rows.flatMap((row) => {
        const why = starsRowNeeds(p, row);
        return why ? [{ course: row.name, why }] : [];
      }),
    })),
    items: items.map((p) => ({ plan: p, label: `${yearText(p.endYear)}${schools > 1 ? ` at ${p.schoolName}` : ""}: ${plural(p.rows.length, "course")}` })),
    options: [
      ...questions.map((q) => h("label", { class: "picker" }, "Grading Scale (your school's pass mark) ", q)),
      intl ? h("label", { class: "picker" }, "Language of instruction ", language) : false,
    ],
    before: async () => {
      if (questions.some((q) => !q.value)) return "Choose the Grading Scale first (your school's passing mark decides which).";
      await savePicks([...new Set([...picks.filter((p) => !sets.flat().includes(p)), ...chosen()])]);
      try {
        await chrome.storage.local.set({ [LANGUAGE_KEY]: language.value.trim() });
      } catch {
        // asked again next time
      }
      return null;
    },
    run: async (chosenPlans, shouldStop, progress) => {
      const { reports, stopped } = await runStarsPlans(chosenPlans, chosen(), intl ? language.value.trim() || null : null, tab, shouldStop, progress);
      return { reports: reports.map((r) => starsReport(r, schools)), stopped };
    },
    footer: [summary(items), items.some((p) => p.warnings.length) ? h("ul", { class: "warnings" }, ...[...new Set(items.flatMap((p) => p.warnings))].map((w) => h("li", {}, w))) : false],
  });
}

/** What the student may want to look at afterwards, in two lines instead of one note per course. */
function summary(plans: StarsPagePlan[]): HTMLElement | false {
  const lines: string[] = [];
  const other = plans.flatMap((p) => p.titleOther);
  const split = plans.reduce((n, p) => n + p.creditsSplit, 0);
  if (other.length) lines.push(`STARS has no closer course title for ${other.join(", ")}: they go in as "OTHER ...". Change one on STARS only if a listed title fits better.`);
  if (split) lines.push(`${split} course${split === 1 ? " prints" : "s print"} one credit for the whole course; it is split evenly over the terms.`);
  return lines.length ? h("ul", { class: "note" }, ...lines.map((l) => h("li", {}, l))) : false;
}
