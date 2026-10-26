// Side panel section for Cal State Apply: "Add courses" per US high school on the High School Coursework page. Courses already listed
// on the school are left alone; each new one is saved with the course form's own Save. A-G areas are set on the A-G Matching page.

import type { CsuSchoolPlan } from "../../../web/lib/csu-fill.ts";
import type { AssistResponse } from "../messages.ts";
import { button, h } from "../ui.ts";

export function csuAutoView(plans: CsuSchoolPlan[], tabId: number): HTMLElement {
  if (!plans.length) return h("p", { class: "note" }, "No US high school in your transcript: Cal State Apply skips course entry for schools outside the US.");
  const sections = plans.map((plan) => {
    const status = h("p", { class: "status" }, `${plan.rows.length} courses (school Term Type in the tracker: ${plan.termType}).`);
    const stop = button("Stop", () => {
      stop.disabled = true;
      void chrome.tabs.sendMessage(tabId, { type: "csuStop" }).catch(() => {});
    }, "btn danger", true);
    const go = button(`Add courses to ${plan.schoolName}`, async () => {
      go.disabled = true;
      stop.disabled = false;
      status.className = "status";
      status.textContent = "Adding courses on Cal State Apply... keep this tab open.";
      let r: AssistResponse | undefined;
      try {
        r = (await chrome.tabs.sendMessage(tabId, { type: "csuFill", plan })) as AssistResponse | undefined;
      } catch {
        r = undefined;
      }
      go.disabled = false;
      stop.disabled = true;
      if (r?.type !== "csuFill") {
        status.className = "status warn";
        status.textContent = "The Cal State Apply page stopped responding. Reload it and try again.";
        return;
      }
      const { added, skippedExisting, stopped } = r.result;
      status.className = stopped ? "status warn" : "status";
      status.textContent = [
        `Added ${added.length} course${added.length === 1 ? "" : "s"}${added.length ? `: ${added.join(", ")}` : ""}.`,
        skippedExisting ? `${skippedExisting} already there were left alone.` : "",
        stopped ?? "Check each course, then set each one's A-G area on the A-G Matching page.",
      ].filter(Boolean).join(" ");
    }, "btn primary");
    const codes = plan.rows.filter((r) => r.agCode).map((r) => `${r.name}: ${r.agCode}`);
    return h(
      "section",
      { class: "item" },
      h("h3", {}, plan.schoolName),
      status,
      h("div", { class: "row" }, go, stop),
      codes.length ? h("details", {}, h("summary", {}, "A-G areas to pick on A-G Matching"), h("ul", {}, ...codes.map((c) => h("li", {}, c)))) : false,
      plan.warnings.length ? h("ul", { class: "warnings" }, ...plan.warnings.map((w) => h("li", {}, w))) : false,
      plan.skipped.length ? h("details", {}, h("summary", {}, `Left for you (${plan.skipped.length})`), h("ul", {}, ...plan.skipped.map((s) => h("li", {}, `${s.course}: ${s.field}: ${s.reason}`)))) : false,
    );
  });
  return h("div", {}, h("h3", {}, "Add courses automatically"), h("p", { class: "muted" }, "Open Academic History > High School Coursework on Cal State Apply. Nothing is removed, marked done or submitted."), ...sections);
}
