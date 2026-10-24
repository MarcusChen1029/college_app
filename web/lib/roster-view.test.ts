import assert from "node:assert/strict";
import { test } from "node:test";
import { ALL_CLASSES, buildRows, daysLabel, groupDeadlines, NO_CLASS, relativeTime, statusLabel, viewRows, weekdayDate, type RosterFilter, type RosterSort } from "./roster-view.ts";
import type { RosterCollege, RosterStudent, UpcomingDeadline } from "./roster.ts";

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
const none: RosterFilter = { query: "", classId: ALL_CLASSES, attentionOnly: false };
const names = (s: RosterStudent[], f: RosterFilter, sort: RosterSort) => viewRows(buildRows(s, NOW), f, sort).map((r) => r.student.displayName);

// Ann: clean. Bob: two flags (no scores, no colleges). Cy: deadline soon with open checklist, class c1.
const ann = student({ studentId: "a", displayName: "Ann", email: "ann@school.org", lastActive: "2026-10-22T10:00:00Z" });
const bob = student({ studentId: "b", displayName: "bob", email: "b@x.org", satTotal: null, colleges: [], lastActive: null });
const cy = student({
  studentId: "c",
  displayName: "Cy",
  classIds: ["c1"],
  lastActive: "2026-10-24T08:00:00Z",
  colleges: [college({ nextDeadline: "2026-10-30", checklist: { no_essays: true } })],
});
const all = [ann, bob, cy];

test("relativeTime words", () => {
  assert.equal(relativeTime(null, NOW), "Never");
  assert.equal(relativeTime("garbage", NOW), "Never");
  assert.equal(relativeTime("2026-10-24T08:00:00", NOW), "Today");
  assert.equal(relativeTime("2026-10-23T12:00:00", NOW), "Yesterday");
  assert.equal(relativeTime("2026-10-21T08:00:00", NOW), "3 days ago");
  assert.equal(relativeTime("2026-10-03T00:00:00", NOW), "3 weeks ago");
  assert.equal(relativeTime("2026-07-01T00:00:00", NOW), "3 months ago");
  assert.equal(relativeTime("2025-01-01T00:00:00", NOW), "1 year ago");
  assert.equal(relativeTime("2023-01-01T00:00:00", NOW), "3 years ago");
  assert.equal(relativeTime("2026-11-30T00:00:00", NOW), "Today"); // clock skew into the future
});

test("daysLabel and weekdayDate", () => {
  assert.equal(daysLabel(0), "today");
  assert.equal(daysLabel(1), "tomorrow");
  assert.equal(daysLabel(8), "in 8 days");
  assert.equal(daysLabel(-1), "yesterday");
  assert.equal(daysLabel(-4), "4 days ago");
  assert.equal(weekdayDate("2026-11-01"), "Sun, Nov 1");
});

test("default sort ranks the most urgent flag first, then more flags, then the sooner deadline, then name", () => {
  // Cy's imminent deadline outranks bob's two minor flags (no scores, no colleges).
  assert.deepEqual(names(all, none, "attention"), ["Cy", "bob", "Ann"]);
  const dan = student({ studentId: "d", displayName: "Dan", colleges: [college({ nextDeadline: "2026-10-28", checklist: { no_essays: true } })] });
  // Cy and Dan both have one flag (deadline soon); Dan's deadline is sooner.
  assert.deepEqual(names([ann, cy, dan], none, "attention"), ["Dan", "Cy", "Ann"]);
});

test("name, deadline and last-active sorts", () => {
  assert.deepEqual(names(all, none, "name"), ["Ann", "bob", "Cy"]);
  assert.deepEqual(names(all, none, "deadline"), ["Cy", "Ann", "bob"]); // no deadline last, ties by name
  assert.deepEqual(names(all, none, "active"), ["Cy", "Ann", "bob"]); // never last
});

test("search matches name or email, case-insensitively", () => {
  assert.deepEqual(names(all, { ...none, query: "  ANN@school " }, "name"), ["Ann"]);
  assert.deepEqual(names(all, { ...none, query: "b" }, "name"), ["bob"]);
});

test("class filter: one class, or one-on-one only", () => {
  assert.deepEqual(names(all, { ...none, classId: "c1" }, "name"), ["Cy"]);
  assert.deepEqual(names(all, { ...none, classId: NO_CLASS }, "name"), ["Ann", "bob"]);
  assert.deepEqual(names(all, { ...none, classId: "gone" }, "name"), []);
});

test("archived classes don't count as a class for the filters", () => {
  const archivedOnly = student({ studentId: "z", displayName: "Zed", classIds: ["old"] });
  const f = { ...none, activeClassIds: ["c1"] };
  assert.deepEqual(names([...all, archivedOnly], { ...f, classId: NO_CLASS }, "name"), ["Ann", "bob", "Zed"]);
  assert.deepEqual(names([...all, archivedOnly], { ...f, classId: "c1" }, "name"), ["Cy"]);
  assert.deepEqual(names([...all, archivedOnly], { ...f, classId: "old" }, "name"), []);
});

test("needs attention only hides students without flags", () => {
  assert.deepEqual(names(all, { ...none, attentionOnly: true }, "name"), ["bob", "Cy"]);
});

test("buildRows exposes flags, next deadline and checklist progress", () => {
  const [row] = buildRows([cy], NOW);
  assert.deepEqual(row.flags.map((f) => f.key), ["deadline_soon"]);
  assert.equal(row.next?.days, 6);
  assert.deepEqual(row.checklist, { done: 1, total: 5 });
  assert.equal(row.activeColleges, 1);
});

test("statusLabel", () => {
  assert.equal(statusLabel("researching"), "In progress");
  assert.equal(statusLabel("in_progress", { transcript: true }), "In progress");
  assert.equal(statusLabel("in_progress", { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" }), "Ready");
  assert.equal(statusLabel("submitted"), "Submitted");
  assert.equal(statusLabel("interview"), "Submitted");
  assert.equal(statusLabel("admitted"), "Admitted");
  assert.equal(statusLabel("enrolled"), "Committed");
});

test("groupDeadlines groups by date with a heading", () => {
  const d = (studentName: string, dueDate: string): UpcomingDeadline => ({
    studentId: studentName,
    studentName,
    collegeName: "MIT",
    collegeSlug: "mit",
    dueDate,
    kind: "application",
    label: "EA",
    status: "in_progress",
  });
  const groups = groupDeadlines([d("B", "2026-11-01"), d("A", "2026-10-24"), d("C", "2026-11-01")], NOW);
  assert.deepEqual(groups.map((g) => g.heading), ["Sat, Oct 24 - today", "Sun, Nov 1 - in 8 days"]);
  assert.deepEqual(groups[1].items.map((x) => x.studentName), ["B", "C"]);
  assert.deepEqual(groupDeadlines([], NOW), []);
});
