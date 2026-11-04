import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ANCHOR_KINDS,
  PROFILE_CARDS,
  SECTIONS,
  anchorKey,
  focusAttr,
  genericLabelKey,
  parseFocus,
  studentHref,
  teacherHref,
  teacherTabFor,
  validateAnchor,
  type Anchor,
} from "./anchors.ts";

const a = (kind: Anchor["kind"], ref: string | null): Anchor => ({ kind, ref });
const UUID = "123e4567-e89b-12d3-a456-426614174000";

test("constants list the phase 1 kinds, sections and profile cards", () => {
  assert.deepEqual([...ANCHOR_KINDS], ["general", "section", "college", "essay", "activity", "profile", "task"]);
  assert.deepEqual([...SECTIONS], ["colleges", "essays", "activities", "profile"]);
  assert.deepEqual([...PROFILE_CARDS], ["gpa", "test", "english", "regions"]);
});

test("validateAnchor: general has no ref", () => {
  assert.equal(validateAnchor(a("general", null)), true);
  assert.equal(validateAnchor(a("general", "x")), false);
  assert.equal(validateAnchor(a("general", "")), false);
});

test("validateAnchor: section and profile refs come from fixed lists", () => {
  assert.equal(validateAnchor(a("section", "essays")), true);
  assert.equal(validateAnchor(a("section", "profile")), true);
  assert.equal(validateAnchor(a("section", "transcript")), false); // phase 2
  assert.equal(validateAnchor(a("section", null)), false);
  assert.equal(validateAnchor(a("profile", "gpa")), true);
  assert.equal(validateAnchor(a("profile", "regions")), true);
  assert.equal(validateAnchor(a("profile", "height")), false);
});

test("validateAnchor: essay refs are ps, uc:1-8 or supp:<slug>:<id>", () => {
  for (const ok of ["ps", "uc:1", "uc:8", "supp:mit:e1", "supp:cal-poly:abc123"]) assert.equal(validateAnchor(a("essay", ok)), true, ok);
  for (const bad of ["uc:9", "uc:0", "uc:", "supp:mit:", "supp::e1", "supp:MIT:e1", "supp:mit:e 1", "supp:mit", "PS", ""]) assert.equal(validateAnchor(a("essay", bad)), false, bad);
  assert.equal(validateAnchor(a("essay", null)), false);
});

test("validateAnchor: college, activity and task refs", () => {
  assert.equal(validateAnchor(a("college", "mit")), true);
  assert.equal(validateAnchor(a("college", "custom-123e4567-e89b-12d3-a456-426614174000")), true);
  assert.equal(validateAnchor(a("college", "MIT")), false);
  assert.equal(validateAnchor(a("college", "")), false);
  assert.equal(validateAnchor(a("college", "a".repeat(200))), true);
  assert.equal(validateAnchor(a("college", "a".repeat(201))), false);
  assert.equal(validateAnchor(a("activity", "a1")), true);
  assert.equal(validateAnchor(a("activity", "legacy-ca-0")), false);
  assert.equal(validateAnchor(a("activity", "")), false);
  assert.equal(validateAnchor(a("activity", "x".repeat(201))), false);
  assert.equal(validateAnchor(a("task", UUID)), true);
  assert.equal(validateAnchor(a("task", "not-a-uuid")), false);
  assert.equal(validateAnchor(a("task", null)), false);
});

test("anchorKey and parseFocus round trip", () => {
  assert.equal(anchorKey(a("general", null)), "general");
  assert.equal(anchorKey(a("college", "mit")), "college:mit");
  assert.equal(anchorKey(a("essay", "supp:mit:e1")), "essay:supp:mit:e1");
  assert.deepEqual(parseFocus("essay:supp:mit:e1"), { kind: "essay", ref: "supp:mit:e1" });
  assert.deepEqual(parseFocus("general"), { kind: "general", ref: null });
  assert.deepEqual(parseFocus("college:mit"), { kind: "college", ref: "mit" });
  for (const x of [a("general", null), a("section", "profile"), a("task", UUID), a("essay", "uc:3")]) assert.deepEqual(parseFocus(anchorKey(x)), x);
});

test("parseFocus rejects anything that is not a valid anchor", () => {
  for (const bad of [null, "", "college:", "nope:x", "college", "general:x", "essay:uc:9", "task:nope", ":x"]) assert.equal(parseFocus(bad), null, String(bad));
});

test("teacherTabFor follows the spec table", () => {
  assert.equal(teacherTabFor(a("college", "mit")), "colleges");
  assert.equal(teacherTabFor(a("essay", "ps")), "essays");
  assert.equal(teacherTabFor(a("essay", "uc:2")), "essays");
  assert.equal(teacherTabFor(a("essay", "supp:mit:e1")), "colleges");
  assert.equal(teacherTabFor(a("activity", "a1")), "activities");
  assert.equal(teacherTabFor(a("profile", "gpa")), "overview");
  assert.equal(teacherTabFor(a("section", "profile")), "overview");
  assert.equal(teacherTabFor(a("section", "colleges")), "colleges");
  assert.equal(teacherTabFor(a("section", "essays")), "essays");
  assert.equal(teacherTabFor(a("section", "activities")), "activities");
  assert.equal(teacherTabFor(a("task", UUID)), "tasks");
  assert.equal(teacherTabFor(a("general", null)), "messages");
});

test("studentHref points at the page that shows the item, with the key encoded", () => {
  assert.equal(studentHref(a("college", "mit")), "/application/list?focus=college%3Amit");
  assert.equal(studentHref(a("essay", "supp:mit:e1")), "/materials/essays?focus=essay%3Asupp%3Amit%3Ae1");
  assert.equal(studentHref(a("activity", "a1")), "/materials/activities?focus=activity%3Aa1");
  assert.equal(studentHref(a("profile", "gpa")), "/profile?focus=profile%3Agpa");
  assert.equal(studentHref(a("section", "essays")), "/materials/essays?focus=section%3Aessays");
  assert.equal(studentHref(a("section", "colleges")), "/application/list?focus=section%3Acolleges");
  assert.equal(studentHref(a("section", "activities")), "/materials/activities?focus=section%3Aactivities");
  assert.equal(studentHref(a("section", "profile")), "/profile?focus=section%3Aprofile");
  assert.equal(studentHref(a("task", UUID)), `/counselor/task/${UUID}`); // its own page: no focus parameter
});

test("studentHref for a task opens the task page", () => {
  assert.equal(studentHref(a("task", "t1")), "/counselor/task/t1");
  assert.equal(studentHref({ kind: "task", ref: "t1" }, "c1"), "/counselor/task/t1"); // a conversation id is for general anchors only
  assert.equal(studentHref(a("task", null)), "/counselor"); // no ref: nothing to open, fall back to the list
});

test("studentHref for a general anchor opens the conversation", () => {
  assert.equal(studentHref(a("general", null), "c1"), "/counselor?c=c1");
  assert.equal(studentHref(a("general", null)), "/counselor");
});

test("teacherHref opens the student's tab with the key as focus", () => {
  assert.equal(teacherHref(a("activity", "a1"), "s1"), "/teacher/students?s=s1&tab=activities&focus=activity%3Aa1");
  assert.equal(teacherHref(a("essay", "supp:mit:e1"), "s1"), "/teacher/students?s=s1&tab=colleges&focus=essay%3Asupp%3Amit%3Ae1");
  assert.equal(teacherHref(a("profile", "gpa"), "s1"), "/teacher/students?s=s1&tab=overview&focus=profile%3Agpa");
  assert.equal(teacherHref(a("general", null), "s1"), "/teacher/students?s=s1&tab=messages");
});

test("genericLabelKey is the kind itself", () => {
  for (const k of ANCHOR_KINDS) assert.equal(genericLabelKey(k), k);
});

test("focusAttr is the data-focus value, and undefined for what cannot be an anchor", () => {
  assert.equal(focusAttr(a("college", "mit")), "college:mit");
  assert.equal(focusAttr(a("activity", "a1")), "activity:a1");
  assert.equal(focusAttr(a("essay", "supp:mit:e1")), "essay:supp:mit:e1");
  assert.equal(focusAttr(a("essay", "uc:3")), "essay:uc:3");
  assert.equal(focusAttr(a("activity", "legacy-ca-0")), undefined); // made up on read
  assert.equal(focusAttr(a("college", "Not A Slug")), undefined);
  assert.equal(focusAttr(a("profile", "height")), undefined);
});
