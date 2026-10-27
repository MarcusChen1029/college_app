import assert from "node:assert/strict";
import { test } from "node:test";
import type { UcGradePlan } from "../../../web/lib/uc-fill.ts";
import { html } from "../commonapp/test-dom.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { ucClassesLink, ucCoursesButtons } from "./nav.ts";
import { runUcPlans, type UcTab } from "./run.ts";

// Shaped like the live 9th grade page (2026-10-27): one card per school with an a#edit_<NN><id> link.
const card = (name: string, code: string, id: string) =>
  `<div><div><p>${name}</p><p>TAIWAN</p><p>School code: ${code}</p></div><div><p>2023 - 2024 academic year</p><a id="edit_09${id}" href="javascript:void(0)">Enter courses &amp; grades</a></div></div>`;

test("ucClassesLink: the only school's link, or the one whose card has the school's code or name", () => {
  const one = html(card("KANG CHIAO INTL SCH LINKOU CMP", "694132", "19055667"));
  assert.equal((ucClassesLink(one, 9, { name: "Anything" }) as HTMLElement).id, "edit_0919055667");
  const two = html(card("KANG CHIAO INTL SCH LINKOU CMP", "694132", "1") + card("TAIPEI AMERICAN SCHOOL", "694100", "2"));
  assert.equal((ucClassesLink(two, 9, { name: "Kang Chiao International School Linkou Campus" }) as HTMLElement).id, "edit_091");
  assert.equal((ucClassesLink(two, 9, { name: "TAS", code: "694100" }) as HTMLElement).id, "edit_092");
  assert.match(ucClassesLink(two, 9, { name: "Elsewhere Academy" }) as string, /matches none/);
  assert.match(ucClassesLink(html("<p>10th grade</p>"), 10, { name: "X" }) as string, /check that 10th grade is added to the school/);
});

test("a school year that already has courses shows Edit instead: that Edit is found, the school's own Edit and Delete are not", () => {
  const page = html(`<div><div><p>KANG CHIAO INTL SCH LINKOU CMP</p><p>School code: 694132</p><a href="/my-application/acadHistFrInfo?action=edit&schId=1">Edit</a></div>
    <div><div><h3>2023 - 2024 academic year</h3><button id="del_0919055667">Delete</button><a id="edit_0919055667" href="javascript:void(0)">Edit</a></div>
    <table><tr><th>Course name</th></tr><tr><td>Geometry</td></tr></table></div></div>`);
  assert.deepEqual(ucCoursesButtons(page, 9).map((e) => e.id), ["edit_0919055667"]);
  // Without the id, the year's Edit is still found by its place next to the academic year, and the school's Edit is not.
  const noId = html(`<div><div><p>KANG CHIAO</p><p>School code: 694132</p><a href="/x">Edit</a></div><div><div><h3>2023 - 2024 academic year</h3><button>Delete</button><button>Edit</button></div></div></div>`);
  assert.deepEqual(ucCoursesButtons(noId, 9).map((e) => e.tagName), ["BUTTON"]);
});

const plan = (gradeLevel: number, names: string[]): UcGradePlan => ({
  schoolName: "Kang Chiao", gradeLevel, year: `${2014 + gradeLevel} - ${2015 + gradeLevel}`, warnings: [], skipped: [],
  rows: names.map((name) => ({ name }) as UcGradePlan["rows"][number]),
});

/** A fake UC: a grade page, then the courses page after the link click, then the summary after saving. */
function fakeUc(saved: Record<number, string[]>, opts: { noGrade?: number } = {}) {
  let at: { grade: number | null; page: "grade" | "classes" | "other" } = { grade: null, page: "other" };
  const visits: string[] = [];
  let pendingClick = false;
  let lastFill: string[] = [];
  const tab: UcTab = {
    async send(msg: AssistMessage): Promise<AssistResponse> {
      switch (msg.type) {
        case "ucPage":
          return { type: "ucPage", grade: at.page === "classes" ? at.grade : null, names: at.grade ? [...(saved[at.grade] ?? [])] : [], pageText: "" };
        case "ucOpenClasses":
          if (msg.grade === opts.noGrade) return { type: "ucOpenClasses", ok: false, error: `UC has no ${msg.grade}th grade courses page` };
          pendingClick = true;
          return { type: "ucOpenClasses", ok: true };
        case "ucFill": {
          const have = saved[msg.plan.gradeLevel] ?? [];
          lastFill = msg.plan.rows.map((r) => r.name).filter((n) => !have.includes(n));
          return { type: "ucFill", ok: true, result: { added: lastFill, skippedExisting: msg.plan.rows.length - lastFill.length, left: [], saving: lastFill.length > 0 } };
        }
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
    async go(path) {
      visits.push(path);
      at = { grade: Number(path.slice(-2)), page: "grade" };
    },
    async afterReload() {
      if (pendingClick) {
        pendingClick = false;
        at = { ...at, page: "classes" };
      } else {
        (saved[at.grade!] ??= []).push(...lastFill);
        at = { ...at, page: "grade" };
      }
    },
  };
  return { tab, visits, saved };
}

test("runUcPlans opens each grade's courses page itself, fills, saves and checks", async () => {
  const uc = fakeUc({ 9: ["English 9"] });
  const r = await runUcPlans([plan(9, ["English 9", "Biology"]), plan(10, ["Chemistry"])], uc.tab, () => false, () => {});
  assert.deepEqual(uc.visits, ["/my-application/acadHistFrGrades/09", "/my-application/acadHistFrGrades/10"]);
  assert.deepEqual(r.reports.map((x) => [x.added, x.skippedExisting, x.problem]), [[["Biology"], 1, null], [["Chemistry"], 0, null]]);
  assert.deepEqual(uc.saved[10], ["Chemistry"]);
});

test("runUcPlans reports a grade UC has no page for and goes on", async () => {
  const uc = fakeUc({}, { noGrade: 11 });
  const r = await runUcPlans([plan(11, ["Physics"]), plan(12, ["Calculus"])], uc.tab, () => false, () => {});
  assert.match(r.reports[0]!.problem!, /no 11th grade/);
  assert.deepEqual(r.reports[1]!.added, ["Calculus"]);
});
