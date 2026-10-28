import assert from "node:assert/strict";
import { test } from "node:test";
import { checklistSummary, computeFlags, daysUntil, localDate, nextDeadline, parseRosterRow, parseStudentDetail, worstSeverity, type Flag, type RosterCollege, type RosterStudent } from "./roster.ts";

const NOW = new Date(2026, 9, 24, 15, 0); // 24 Oct 2026, local

const college = (o: Partial<RosterCollege> = {}): RosterCollege => ({ slug: "x", name: "X Univ", status: "in_progress", plan: null, checklist: {}, nextDeadline: null, ...o });
const student = (o: Partial<RosterStudent> = {}): RosterStudent => ({
  studentId: "s1",
  displayName: "Sam",
  email: "sam@example.com",
  linkedAt: "2026-10-01T00:00:00Z",
  classIds: [],
  satTotal: 1400,
  actComposite: null,
  gpaUnweighted: 3.8,
  isInternational: false,
  lastActive: "2026-10-23T00:00:00Z",
  colleges: [college()],
  ...o,
});
const keys = (s: RosterStudent) => computeFlags(s, NOW).map((f) => f.key);

test("daysUntil counts calendar days, negative when past", () => {
  assert.equal(daysUntil("2026-10-24", NOW), 0);
  assert.equal(daysUntil("2026-11-01", NOW), 8);
  assert.equal(daysUntil("2026-10-20", NOW), -4);
});

test("nextDeadline ignores finished colleges and past dates and picks the soonest", () => {
  const s = student({
    colleges: [
      college({ name: "Far", nextDeadline: "2026-12-01" }),
      college({ name: "Near", nextDeadline: "2026-11-01" }),
      college({ name: "Done", status: "submitted", nextDeadline: "2026-10-25" }),
      college({ name: "Past", nextDeadline: "2026-10-01" }),
    ],
  });
  assert.deepEqual(nextDeadline(s, NOW), { date: "2026-11-01", collegeName: "Near", days: 8 });
  assert.equal(nextDeadline(student({ colleges: [] }), NOW), null);
});

test("checklistSummary adds up only the colleges still in progress", () => {
  const s = student({
    colleges: [college({ checklist: { recommendations: true, transcript: true } }), college({ status: "admitted", checklist: { recommendations: true } })],
  });
  assert.deepEqual(checklistSummary(s), { done: 2, total: 5 });
});

test("a healthy student has no flags", () => {
  assert.deepEqual(keys(student()), []);
});

test("no_colleges and no_scores", () => {
  const ks = keys(student({ colleges: [], satTotal: null, actComposite: null }));
  assert.ok(ks.includes("no_colleges") && ks.includes("no_scores"));
  assert.ok(!keys(student({ satTotal: null, actComposite: 30 })).includes("no_scores"));
});

test("deadline_soon needs a deadline within 14 days AND open checklist items", () => {
  const open = student({ colleges: [college({ nextDeadline: "2026-11-01" })] });
  assert.ok(keys(open).includes("deadline_soon"));
  const complete = student({
    colleges: [college({ nextDeadline: "2026-11-01", checklist: { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" } })],
  });
  assert.ok(!keys(complete).includes("deadline_soon"));
  assert.ok(!keys(student({ colleges: [college({ nextDeadline: "2026-11-20" })] })).includes("deadline_soon"));
  assert.ok(!keys(student({ colleges: [college({ nextDeadline: "2026-10-20" })] })).includes("deadline_soon"));
});

test("deadline_soon detail says how many days and how many items are open", () => {
  const f = computeFlags(student({ colleges: [college({ name: "Harvard", nextDeadline: "2026-11-01" })] }), NOW).find((x) => x.key === "deadline_soon");
  assert.equal(f?.detail, "Harvard is due in 8 days with 5 checklist items open.");
});

test("essay_not_started: within 30 days, no essay begun, and not marked as 'no essays'", () => {
  const base = { nextDeadline: "2026-11-15" };
  assert.ok(keys(student({ colleges: [college(base)] })).includes("essay_not_started"));
  assert.ok(keys(student({ colleges: [college({ ...base, checklist: { essay_list: [{ id: "1", title: "", url: "", status: "not_started" }] } })] })).includes("essay_not_started"));
  assert.ok(!keys(student({ colleges: [college({ ...base, checklist: { essay_list: [{ id: "1", title: "", url: "", status: "drafting" }] } })] })).includes("essay_not_started"));
  assert.ok(!keys(student({ colleges: [college({ ...base, checklist: { no_essays: true } })] })).includes("essay_not_started"));
  assert.ok(!keys(student({ colleges: [college({ nextDeadline: "2026-12-30" })] })).includes("essay_not_started"));
});

test("inactive: more than 30 days since last change; a never-active student is judged from the link date", () => {
  assert.ok(keys(student({ lastActive: "2026-09-01T00:00:00Z" })).includes("inactive"));
  assert.ok(!keys(student({ lastActive: "2026-10-10T00:00:00Z" })).includes("inactive"));
  assert.ok(keys(student({ lastActive: null, linkedAt: "2026-08-01T00:00:00Z" })).includes("inactive"));
  assert.ok(!keys(student({ lastActive: null, linkedAt: "2026-10-20T00:00:00Z" })).includes("inactive"));
});

test("parseRosterRow normalises nulls and numeric strings", () => {
  const s = parseRosterRow({
    student_id: "a", display_name: null, email: "e@x.com", linked_at: "2026-10-01", class_ids: ["c1"], sat_total: 1400,
    act_composite: null, gpa_unweighted: "3.80", is_international: true, last_active: null,
    colleges: [{ slug: "mit", name: "MIT", status: "in_progress", plan: "ea", checklist: { transcript: true }, next_deadline: "2026-11-01" }],
  });
  assert.equal(s.displayName, "Student");
  assert.equal(s.gpaUnweighted, 3.8);
  assert.equal(s.lastActive, null);
  assert.deepEqual(s.colleges[0], { slug: "mit", name: "MIT", status: "in_progress", plan: "ea", checklist: { transcript: true }, nextDeadline: "2026-11-01" });
});

test("parseStudentDetail keeps essays null when not shared and defaults missing parts", () => {
  const d = parseStudentDetail({ student_id: "a", display_name: "Sam", share_essays: false, essays: null, profile: {}, colleges: [] });
  assert.equal(d.essays, null);
  assert.equal(d.shareEssays, false);
  assert.deepEqual(d.profile.targetRegions, []);
  assert.deepEqual(d.activities, { version: 2, commonApp: { activities: [], honors: [] }, uc: [] });
  assert.deepEqual(d.colleges, []);
  const shared = parseStudentDetail({ student_id: "a", share_essays: true, essays: { ps: { status: "drafting", url: "", prompt: 1 } }, profile: {}, colleges: [] });
  assert.equal(shared.essays?.ps?.status, "drafting");
});

test("worstSeverity ranks one imminent deadline above several minor flags", () => {
  const minor = [{ key: "no_colleges" }, { key: "no_scores" }, { key: "inactive" }].map((f) => ({ ...f, label: "", detail: "" })) as Flag[];
  const urgent = [{ key: "deadline_soon", label: "", detail: "" }] as Flag[];
  assert.ok(worstSeverity(urgent) > worstSeverity(minor));
  assert.equal(worstSeverity([]), 0);
});

test("localDate is the viewer's calendar day, zero padded", () => {
  assert.equal(localDate(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(localDate(new Date(2026, 9, 24, 0, 1)), "2026-10-24");
});

test("parseStudentDetail returns activities in the 2026-27 format whatever the server stored", () => {
  const old = {
    commonApp: { activities: [{ id: "a1", type: "Work (Paid)", position: "Cashier", organization: "Cafe", description: "d", grades: ["11"], timing: ["school", "break"], hoursPerWeek: 5, weeksPerYear: 20, continueInCollege: true }], honors: [] },
    uc: [{ id: "u1", category: "work", name: "Cashier", organization: "Cafe", description: "d", grades: ["11"] }, { id: "u2", category: "award", name: "Prize", awardLevel: "state" }],
  };
  const d = parseStudentDetail({ student_id: "a", profile: {}, colleges: [], activities: old });
  assert.equal(d.activities.version, 2);
  const [ca] = d.activities.commonApp!.activities;
  assert.deepEqual([ca.type, ca.leadership, ca.timing, ca.continueInCollege], ["Employment or work (paid)", true, "all", "yes"]);
  assert.deepEqual([d.activities.uc![0].jobTitle, d.activities.uc![0].name], ["Cashier", "Cafe"]);
  assert.deepEqual(d.activities.uc![1].awardLevels, ["state"]);
  // A current payload is unchanged, and a missing one is empty but current.
  assert.deepEqual(parseStudentDetail({ student_id: "a", profile: {}, colleges: [], activities: d.activities }).activities, d.activities);
  assert.deepEqual(parseStudentDetail({ student_id: "a", profile: {}, colleges: [] }).activities, { version: 2, commonApp: { activities: [], honors: [] }, uc: [] });
});
