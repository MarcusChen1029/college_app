import assert from "node:assert/strict";
import { test } from "node:test";
import type { RosterCollege, RosterStudent, UpcomingDeadline } from "./roster.ts";
import { buildWeek, isDoneDeadline, WEEK_DAYS } from "./roster-week.ts";

const NOW = new Date(2026, 9, 30, 9, 0); // Fri 30 Oct 2026, local

const college = (o: Partial<RosterCollege> = {}): RosterCollege => ({ slug: "x", name: "X Univ", status: "in_progress", plan: null, checklist: {}, nextDeadline: null, ...o });
const student = (o: Partial<RosterStudent> = {}): RosterStudent => ({
  studentId: "s1",
  displayName: "Sam",
  email: "sam@example.test",
  linkedAt: "2026-10-01T00:00:00Z",
  classIds: [],
  satTotal: 1400,
  actComposite: null,
  gpaUnweighted: 3.8,
  isInternational: false,
  lastActive: "2026-10-29T00:00:00Z",
  colleges: [college()],
  ...o,
});
const deadline = (o: Partial<UpcomingDeadline> = {}): UpcomingDeadline => ({
  studentId: "s1",
  studentName: "Sam",
  collegeName: "X Univ",
  collegeSlug: "x",
  dueDate: "2026-11-01",
  kind: "application",
  label: "Early Action",
  status: "in_progress",
  ...o,
});

test("the week is today plus six days; past and later deadlines are left out", () => {
  assert.equal(WEEK_DAYS, 7);
  const week = buildWeek(
    [student()],
    [deadline({ dueDate: "2026-10-29" }), deadline({ dueDate: "2026-10-30" }), deadline({ dueDate: "2026-11-05" }), deadline({ dueDate: "2026-11-06" })],
    NOW,
  );
  assert.deepEqual(
    week.days.map((d) => [d.date, d.days]),
    [
      ["2026-10-30", 0],
      ["2026-11-05", 6],
    ],
  );
});

test("days come soonest first and keep every deadline of a day together", () => {
  const week = buildWeek(
    [student(), student({ studentId: "s2", displayName: "Ana" })],
    [deadline({ dueDate: "2026-11-02", studentId: "s2", studentName: "Ana" }), deadline({ dueDate: "2026-10-31" }), deadline({ dueDate: "2026-11-02" })],
    NOW,
  );
  assert.deepEqual(
    week.days.map((d) => [d.date, d.items.length]),
    [
      ["2026-10-31", 1],
      ["2026-11-02", 2],
    ],
  );
  assert.equal(week.dueStudents, 2);
});

test("submitted application deadlines count as done and are not listed", () => {
  const week = buildWeek([student()], [deadline({ status: "submitted" }), deadline({ status: "admitted", dueDate: "2026-11-02" }), deadline({ kind: "aid", status: "submitted", label: "CSS Profile" })], NOW);
  assert.equal(week.submitted, 2);
  assert.deepEqual(
    week.days.flatMap((d) => d.items.map((i) => i.deadline.label)),
    ["CSS Profile"],
  );
  assert.equal(isDoneDeadline(deadline({ status: "in_progress" })), false);
});

test("each item carries the open checklist count of that student's college", () => {
  const roster = [student({ colleges: [college({ slug: "x", checklist: { no_essays: true, recommendations: true } })] })];
  const [item] = buildWeek(roster, [deadline()], NOW).days[0].items;
  assert.equal(item.total! - item.open!, 2);
  const unknown = buildWeek(roster, [deadline({ collegeSlug: "elsewhere" })], NOW).days[0].items[0];
  assert.equal(unknown.open, null);
  assert.equal(unknown.total, null);
});

test("check-ins are the flagged students, without the deadline-soon flag the week already shows", () => {
  const roster = [
    // deadline soon, and that deadline is in the week list: not repeated in check-ins
    student({ studentId: "a", displayName: "Ann", colleges: [college({ nextDeadline: "2026-11-01", checklist: { no_essays: true } })] }),
    // deadline soon but 10 days out, past the week list: stays a check-in
    student({ studentId: "d", displayName: "Dee", colleges: [college({ nextDeadline: "2026-11-09", checklist: { no_essays: true } })] }),
    // no scores and no colleges
    student({ studentId: "b", displayName: "Bob", satTotal: null, colleges: [] }),
    // clean
    student({ studentId: "c", displayName: "Cy" }),
  ];
  const week = buildWeek(roster, [deadline({ studentId: "a", studentName: "Ann" }), deadline({ studentId: "d", studentName: "Dee", dueDate: "2026-11-09" })], NOW);
  assert.deepEqual(
    week.checkIns.map((c) => [c.row.student.displayName, c.reasons.map((r) => r.key)]),
    [
      ["Dee", ["deadline_soon"]],
      ["Bob", ["no_colleges", "no_scores"]],
    ],
  );
  assert.equal(week.dueStudents, 1);
  assert.equal(week.students, 4);
});
