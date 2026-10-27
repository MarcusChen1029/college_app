import assert from "node:assert/strict";
import { test } from "node:test";
import type { StarsPagePlan, StarsRow } from "../../../web/lib/stars-fill.ts";
import type { AssistMessage, AssistResponse } from "../messages.ts";
import { starsSchools, starsYearPath, starsYears } from "./nav.ts";
import { runStarsPlans, starsSchoolFor, type StarsTab } from "./run.ts";

// Shaped like the live pages (2026-10-27).
const SCHOOLS = `<a href="javascript:changeSchool('c','694132')" class="goButtons" title="Change Kang Chiao Intl Sch Linkou Cmp to a different school.">x</a>
<a href="javascript:goStep('ceeb','694132')" class="goButtons" title="Enter Coursework taken at Kang Chiao Intl Sch Linkou Cmp"><i></i></a>
<a href="javascript:goStep('ceeb','310880')" class="goButtons" title="Enter Coursework taken at Smith &amp; Jones High School"><i></i></a>
<a href="javascript:goStep('next')">Next</a>`;
const SUMMARY = `<script>
    function openCourseEntry(ceeb, yr) {
        openCourseEntry(ceeb, yr, "");
    }

    function openCourseEntry(ceeb, yr, ms) {
        var noWin = false;
        var course_url = "EnterCoursework-yr-2023.aspx";
        course_url = "EnterCoursework-yr-2023.aspx";
        noWin = true;
        course_url = "EnterInternationalCoursework-yr-2024.aspx";
        noWin = true;
        var addMs = "";
        if (ms == "Middle School") { addMs = "&ms=Y"; }
        else if (ms.toUpperCase().indexOf("9TH") != -1) { addMs = "&gl=09"; }
        window.location = course_url + "?selCeeb=" + ceeb + "&yr=" + yr + "&sel_sender_ceeb=" + ceeb + addMs;
    }

    function openRankEntry(ceeb) {}
</script>
<a href="javascript:openCourseEntry('694132','2024','2023-2024')" title="Edit 2023-2024 Coursework">2023-2024</a>
<a href="javascript:openCourseEntry('694132','2024','2023-2024')" class="goButtons">Edit</a>
<a href="javascript:openCourseEntry('694132','2025','10th Grade (2024-2025)')">2024-2025</a>`;

test("reads the schools and their codes from Enter Schools", () => {
  assert.deepEqual(starsSchools(SCHOOLS), [
    { ceeb: "694132", name: "Kang Chiao Intl Sch Linkou Cmp" },
    { ceeb: "310880", name: "Smith & Jones High School" },
  ]);
});

test("builds a year's coursework address the way the summary page does", () => {
  assert.deepEqual(starsYears(SUMMARY, "694132").map((y) => y.year), [2024, 2025]);
  assert.equal(starsYearPath(SUMMARY, "694132", 2024), "/srt/EnterInternationalCoursework-yr-2024.aspx?selCeeb=694132&yr=2024&sel_sender_ceeb=694132");
  assert.equal(starsYearPath(SUMMARY, "694132", 2025), "/srt/EnterInternationalCoursework-yr-2024.aspx?selCeeb=694132&yr=2025&sel_sender_ceeb=694132&gl=10");
  assert.equal(starsYearPath(SUMMARY, "694132", 2026), null);
  assert.equal(starsYearPath(SUMMARY.replace(/noWin = true;/g, ""), "694132", 2024), null);
});

const row = (name: string): StarsRow => ({
  trackerId: name, name, academicLevel: "Equivalent to U.S. High School 9th Grade", subject: "Mathematics", title: "ALGEBRA 1", level: "Standard",
  length: "Semester", scaleOptions: ["100-Point (100-90=A, 80-89=B...Pass=60)"], boxes: [{ grade: "93", credit: null }],
});
const plan = (endYear: number, rows: StarsRow[], schoolName = "Kang Chiao International School Linkou Campus"): StarsPagePlan =>
  ({ kind: "intl", endYear, schoolName, scaleQuestions: [], rows, skipped: [], warnings: [], titleOther: [], creditsSplit: 0 });

test("starsSchoolFor: the only school, else by code, else by name", () => {
  const two = starsSchools(SCHOOLS);
  assert.equal(starsSchoolFor(plan(2024, []), two)?.ceeb, "694132");
  assert.equal(starsSchoolFor({ ...plan(2024, []), schoolName: "SJHS", schoolCode: "310880" }, two)?.ceeb, "310880");
  assert.equal(starsSchoolFor({ ...plan(2024, []), schoolName: "Elsewhere Academy" }, two), null);
  assert.equal(starsSchoolFor({ ...plan(2024, []), schoolName: "Elsewhere Academy" }, [two[0]!])?.ceeb, "694132");
});

/** A fake STARS site: knows which page the tab is on and what each year holds. */
function fakeStars(years: Record<number, string[]>, start: { year: number | null } = { year: null }) {
  let at: { year: number | null; ceeb: string } = { year: start.year, ceeb: start.year ? "694132" : "" };
  let pending: string | null = null;
  const visits: string[] = [];
  const tab: StarsTab = {
    async send(msg: AssistMessage): Promise<AssistResponse> {
      switch (msg.type) {
        case "starsSchools":
          return { type: "starsSchools", ok: true, schools: starsSchools(SCHOOLS).slice(0, 1) };
        case "starsYearPath":
          return { type: "starsYearPath", path: starsYearPath(SUMMARY, msg.ceeb, msg.year), years: starsYears(SUMMARY, msg.ceeb).map((y) => y.year) };
        case "starsPage":
          return { type: "starsPage", year: at.year, kind: at.year ? "intl" : null, existing: at.year ? [...(years[at.year] ?? [])] : [], pageText: `${at.ceeb}\nENTER ...`, errors: [] };
        case "starsFill":
          pending = msg.row.name.toUpperCase();
          return { type: "starsFill", ok: true, saved: true, blanks: [] };
        default:
          throw new Error(`unexpected ${msg.type}`);
      }
    },
    async afterSave() {
      if (pending && at.year) (years[at.year] ??= []).push(pending);
      pending = null;
    },
    async go(path) {
      visits.push(path);
      const u = new URL(path, "https://x");
      at = { year: Number(u.searchParams.get("yr")), ceeb: u.searchParams.get("selCeeb") ?? "" };
    },
  };
  return { tab, visits, years };
}

test("runStarsPlans opens every year itself and fills it, from any STARS page", async () => {
  const site = fakeStars({ 2024: ["ALGEBRA 1"] });
  const r = await runStarsPlans([plan(2024, [row("Algebra 1"), row("Geometry")]), plan(2025, [row("Biology")])], [], "English", site.tab, () => false, () => {});
  assert.equal(r.stopped, false);
  assert.deepEqual(r.reports.map((x) => x.result), [
    { added: ["Geometry"], skippedExisting: 1, stopped: null, left: [] },
    { added: ["Biology"], skippedExisting: 0, stopped: null, left: [] },
  ]);
  assert.equal(site.visits.length, 2);
  assert.deepEqual(site.years[2025], ["BIOLOGY"]);
});

test("runStarsPlans stays on the open page when it is already the right year, and reports a year STARS doesn't offer", async () => {
  const site = fakeStars({}, { year: 2024 });
  const r = await runStarsPlans([plan(2024, [row("Geometry")]), plan(2023, [row("Art")])], [], "English", site.tab, () => false, () => {});
  assert.deepEqual(site.visits, []);
  assert.deepEqual(r.reports[0]!.result.added, ["Geometry"]);
  assert.match(r.reports[1]!.result.stopped!, /STARS offers 2023-24, 2024-25 for .*, not 2022-23/);
});

test("runStarsPlans: Stop ends the run before the next year", async () => {
  const site = fakeStars({});
  let n = 0;
  const r = await runStarsPlans([plan(2024, [row("A")]), plan(2025, [row("B")])], [], "English", site.tab, () => n++ > 0, () => {});
  assert.equal(r.stopped, true);
  assert.equal(r.reports.length, 1);
});

test("runStarsPlans: a course missing a required box is not tried, is listed with why, and the run goes on", async () => {
  const site = fakeStars({});
  const noLevel = { ...plan(2024, [{ ...row("Art Life"), level: null as unknown as string }, row("Geometry")]) };
  noLevel.skipped = [{ course: "Art Life", field: "Proficiency Level", reason: "no single STARS level fits this course's level; pick it on STARS" }];
  const r = await runStarsPlans([noLevel, plan(2025, [row("Biology")])], [], "English", site.tab, () => false, () => {});
  assert.deepEqual(r.reports[0]!.result.added, ["Geometry"]);
  assert.deepEqual(r.reports[0]!.result.left, [{ course: "Art Life", why: "Proficiency Level: no single STARS level fits this course's level; pick it on STARS" }]);
  assert.deepEqual(r.reports[1]!.result.added, ["Biology"]);
});
