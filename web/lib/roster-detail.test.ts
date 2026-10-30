import assert from "node:assert/strict";
import { test } from "node:test";
import { collegeSummary, detailToRoster, englishTests, humanize, interestedNames, sectionScores, slugToTitle } from "./roster-detail.ts";
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

test("englishTests lists every English test the student entered, from test_details", () => {
  const tests = englishTests(
    {
      english: {
        ielts: { total: 7.5, sections: { reading: 8, listening: 7.5, speaking: null, writing: 7 } },
        toefl: { total: 105, sections: {} },
        duolingo: { total: null, sections: {} },
      },
    },
    { key: null, score: null },
  );
  assert.deepEqual(
    tests.map((t) => [t.key, t.total]),
    [
      ["toefl", 105],
      ["ielts", 7.5],
    ],
  );
  assert.deepEqual(tests[1].parts, [
    { label: "Reading", value: 8 },
    { label: "Listening", value: 7.5 },
    { label: "Writing", value: 7 },
  ]);
  assert.equal(tests[0].label, "TOEFL iBT (0–120)");
});

test("englishTests falls back to the old single-test columns when test_details has none", () => {
  assert.deepEqual(englishTests({}, { key: "ielts", score: 6.5 }), [{ key: "ielts", label: "IELTS Academic", total: 6.5, parts: [] }]);
  assert.deepEqual(englishTests({}, { key: null, score: null }), []);
});

test("collegeSummary: counts, and the soonest application deadline ahead on a college still being worked on", () => {
  const s = collegeSummary(detail, new Date(2026, 9, 24, 12, 0));
  assert.deepEqual({ total: s.total, active: s.active, submitted: s.submitted }, { total: 2, active: 1, submitted: 1 });
  // MIT: EA Nov 1 beats Priority Dec 1; the CSS Profile (financial aid) is not an application deadline.
  assert.equal(s.next?.date, "2026-11-01");
  assert.equal(s.next?.college, "MIT");
  assert.equal(s.next?.days, 8);
  assert.equal(s.next!.items - s.next!.open, 1); // transcript ticked
  // A deadline already behind the viewer's day is never shown as "next" (the RPC sends only dates still ahead anyway).
  assert.equal(collegeSummary(detail, new Date(2026, 10, 5, 12, 0)).next, null);
  assert.equal(collegeSummary({ ...detail, colleges: [] }, new Date(2026, 9, 24)).next, null);
});
