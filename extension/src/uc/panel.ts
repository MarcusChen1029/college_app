// Side panel section for the UC application: "Add courses" for the grade whose Enter courses & grades page is open. New courses go into
// empty rows and are saved with UC's own "Save & continue"; courses already on the page are left alone.

import { schoolOnPage } from "../../../web/lib/school-match.ts";
import type { UcGradePlan } from "../../../web/lib/uc-fill.ts";
import { afterReload, sendTo } from "../tab-wait.ts";
import { button, h } from "../ui.ts";

const key = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** The plan for the open page: its grade level, and the school whose name the page shows when there are several. */
export function ucPlanForPage(plans: UcGradePlan[], grade: number, pageText: string): UcGradePlan | null {
  const same = plans.filter((p) => p.gradeLevel === grade);
  if (same.length <= 1) return same[0] ?? null;
  // UC shows "School code: 694132" on the page; names are compared word by word.
  return schoolOnPage(same, pageText, (p) => ({ name: p.schoolName, code: p.schoolCode }));
}

export async function ucAutoView(plans: UcGradePlan[], tabId: number): Promise<HTMLElement> {
  const page = await sendTo(tabId, { type: "ucPage" });
  if (page?.type !== "ucPage" || page.grade == null) {
    return h("p", { class: "note" }, "To add courses automatically, open Academic history > a grade > \"Enter courses & grades\" on UC.");
  }
  const grade = page.grade;
  const plan = ucPlanForPage(plans, grade, page.pageText);
  if (!plan || !plan.rows.length) return h("p", { class: "note" }, `Your transcript has no ${grade}th grade courses to add here (or its school name matches none on this page).`);
  const status = h("p", { class: "status" }, `${plan.rows.length} courses for ${grade}th grade (${plan.year}); names already on the page are left alone.`);
  const go = button(`Add ${grade}th grade courses to UC`, async () => {
    go.disabled = true;
    status.className = "status";
    status.textContent = "Filling UC's course rows...";
    const r = await sendTo(tabId, { type: "ucFill", plan });
    if (r?.type !== "ucFill" || !r.ok) {
      go.disabled = false;
      status.className = "status warn";
      status.textContent = r?.type === "ucFill" && !r.ok ? `${r.error}. Nothing was saved.` : "The UC page stopped responding. Reload it and try again.";
      return;
    }
    const { added, skippedExisting, left, saving } = r.result;
    let check = "";
    let ok = true;
    if (saving) {
      try {
        await afterReload(tabId, "UC");
        const after = await sendTo(tabId, { type: "ucPage" });
        const names = after?.type === "ucPage" ? after.names.map(key) : [];
        const missing = added.filter((n) => !names.includes(key(n)));
        ok = missing.length === 0;
        check = ok ? "UC lists every added course." : `UC does not list ${missing.join(", ")} after saving: check the page for a message.`;
      } catch (e) {
        ok = false;
        check = (e as Error).message;
      }
    }
    go.disabled = false;
    status.className = ok ? "status" : "status warn";
    status.textContent = [
      `Added ${added.length} course${added.length === 1 ? "" : "s"}${added.length ? `: ${added.join(", ")}` : ""}.`,
      skippedExisting ? `${skippedExisting} already there were left alone.` : "",
      left.length ? `Left for you (a box the tracker can't fill): ${left.join(", ")}.` : "",
      check,
    ].filter(Boolean).join(" ");
  }, "btn primary");
  return h(
    "section",
    { class: "item" },
    h("h3", {}, `Add ${grade}th grade courses automatically`),
    status,
    h("div", { class: "row" }, go),
    plan.warnings.length ? h("ul", { class: "warnings" }, ...plan.warnings.map((w) => h("li", {}, w))) : false,
    plan.skipped.length ? h("details", {}, h("summary", {}, `Left for you (${plan.skipped.length})`), h("ul", {}, ...plan.skipped.map((s) => h("li", {}, `${s.course}: ${s.field}: ${s.reason}`)))) : false,
  );
}
