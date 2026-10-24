import assert from "node:assert/strict";
import { test } from "node:test";
import { detailToRoster, humanize, interestedNames, sectionScores, slugToTitle } from "./roster-detail.ts";
import { parseStudentDetail } from "./roster.ts";
import { SAT_SCALE } from "./scores.ts";

const detail = parseStudentDetail({
  student_id: "s1",
  display_name: "Sam",
  email: "sam@example.com",
  linked_at: "2026-10-01T00:00:00Z",
  share_essays: true,
  classes: [{ id: "c1", name: "Grade 12" }],
  profile: { sat_total: 1500, gpa_unweighted: 3.9, is_international: true, interested: ["johns-hopkins", "mit", "custom-abc"], updated_at: "2026-10-10T00:00:00Z" },
  colleges: [
    {
      slug: "mit",
      name: "MIT",
      status: "in_progress",
      plan: "EA",
      checklist: { transcript: true },
      updated_at: "2026-10-20T00:00:00Z",
      deadlines: [
        { due_date: "2026-12-01", kind: "priority", label: "Priority", plan: null },
        { due_date: "2026-11-01", kind: "application", label: "EA", plan: "EA" },
        { due_date: "2026-10-30", kind: "financial_aid", label: "CSS Profile", plan: null },
      ],
    },
    { slug: "yale", name: "Yale", status: "submitted", checklist: {}, updated_at: "2026-09-01T00:00:00Z", deadlines: [] },
  ],
});

test("detailToRoster carries scores, class ids and the newest update as last active", () => {
  const r = detailToRoster(detail);
  assert.equal(r.studentId, "s1");
  assert.deepEqual(r.classIds, ["c1"]);
  assert.equal(r.satTotal, 1500);
  assert.equal(r.actComposite, null);
  assert.equal(r.isInternational, true);
  assert.equal(r.lastActive, "2026-10-20T00:00:00Z");
});

test("detailToRoster next deadline is the earliest application/priority date only", () => {
  const [mit, yale] = detailToRoster(detail).colleges;
  assert.equal(mit.nextDeadline, "2026-11-01");
  assert.equal(mit.plan, "EA");
  assert.equal(yale.nextDeadline, null);
});

test("detailToRoster has no last active when nothing carries a date", () => {
  const bare = parseStudentDetail({ student_id: "s2", colleges: [{ slug: "x", name: "X", checklist: {}, deadlines: [] }] });
  assert.equal(detailToRoster(bare).lastActive, null);
});

test("interestedNames prefers the listed college's name and falls back to the slug", () => {
  assert.deepEqual(interestedNames(detail), [
    { slug: "johns-hopkins", name: "Johns Hopkins" },
    { slug: "mit", name: "MIT" },
    { slug: "custom-abc", name: "Custom college" },
  ]);
  assert.equal(slugToTitle("uc-san-diego"), "Uc San Diego");
});

test("sectionScores lists filled sections in scale order", () => {
  assert.deepEqual(sectionScores(SAT_SCALE, { math: 760, ebrw: 740 }), [
    { label: "Reading & Writing", value: 740 },
    { label: "Math", value: 760 },
  ]);
  assert.deepEqual(sectionScores(SAT_SCALE, { math: 760, ebrw: null }), [{ label: "Math", value: 760 }]);
  assert.deepEqual(sectionScores(SAT_SCALE, undefined), []);
});

test("humanize turns keys into sentences", () => {
  assert.equal(humanize("computer_science"), "Computer science");
  assert.equal(humanize(""), "");
});
