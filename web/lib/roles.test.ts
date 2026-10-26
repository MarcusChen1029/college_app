import assert from "node:assert/strict";
import { test } from "node:test";
import { accountMenuFor, activeNavHref, hasStarted, homePathFor, isStudentOnlyPath, navFor, parseRole, redirectFor, roleChangeMessage, startedFrom, validateTeacher } from "./roles.ts";

test("parseRole accepts only the two roles", () => {
  assert.equal(parseRole("student"), "student");
  assert.equal(parseRole("teacher"), "teacher");
  assert.equal(parseRole("admin"), null);
  assert.equal(parseRole(undefined), null);
});

test("validateTeacher needs a name and trims; blank school becomes null", () => {
  assert.equal(validateTeacher({ displayName: "  ", school: "" }).ok, false);
  assert.deepEqual(validateTeacher({ displayName: " Ms Lee ", school: " " }), { ok: true, value: { displayName: "Ms Lee", school: null } });
  assert.deepEqual(validateTeacher({ displayName: "Mr Wu", school: " Lincoln High " }), { ok: true, value: { displayName: "Mr Wu", school: "Lincoln High" } });
});

test("student-only paths match whole path segments", () => {
  assert.equal(isStudentOnlyPath("/profile"), true);
  assert.equal(isStudentOnlyPath("/application/list"), true);
  assert.equal(isStudentOnlyPath("/profiles"), false);
  assert.equal(isStudentOnlyPath("/colleges"), false);
  assert.equal(isStudentOnlyPath("/teacher"), false);
});

test("home path per role", () => {
  assert.equal(homePathFor("teacher"), "/teacher");
  assert.equal(homePathFor("student"), "/application/list");
  assert.equal(homePathFor(null), "/welcome");
});

test("redirectFor: signed out and loading never redirect", () => {
  assert.equal(redirectFor(undefined, "/profile", false), null);
  assert.equal(redirectFor(null, "/profile", false), null);
  assert.equal(redirectFor(undefined, "/profile", true), null);
});

test("redirectFor: signed in without a role goes to /welcome", () => {
  assert.equal(redirectFor(null, "/profile", true), "/welcome");
  assert.equal(redirectFor(null, "/welcome", true), null);
});

test("redirectFor: the OAuth consent screen is not interrupted for a no-role user, but is student-only", () => {
  assert.equal(redirectFor(null, "/oauth/consent", true), null);
  assert.equal(redirectFor("teacher", "/oauth/consent", true), "/teacher");
  assert.equal(redirectFor("student", "/oauth/consent", true), null);
});

test("redirectFor: the extension sign-in popup is not sent to /welcome for a no-role user", () => {
  assert.equal(redirectFor(null, "/extension/connect", true), null);
  assert.equal(redirectFor("student", "/extension/connect", true), null);
  assert.equal(redirectFor(null, "/extension", true), "/welcome");
  assert.equal(redirectFor(null, "/extensions/connect", true), "/welcome");
});

test("redirectFor: a chosen role leaves /welcome", () => {
  assert.equal(redirectFor("student", "/welcome", true), "/application/list");
  assert.equal(redirectFor("teacher", "/welcome", true), "/teacher");
});

test("redirectFor: teachers are kept out of student-only pages, students are not", () => {
  assert.equal(redirectFor("teacher", "/profile", true), "/teacher");
  assert.equal(redirectFor("teacher", "/application/list", true), "/teacher");
  assert.equal(redirectFor("teacher", "/colleges", true), null);
  assert.equal(redirectFor("student", "/profile", true), null);
});

const hrefsOf = (items: readonly (readonly [string, string])[]) => items.map(([h]) => h);

test("navFor: teacher, student, and public navs", () => {
  assert.deepEqual(hrefsOf(navFor("teacher", { signedIn: true, started: false })), ["/teacher", "/teacher/students", "/teacher/classes", "/teacher/deadlines", "/teacher/tasks", "/colleges", "/compare"]);
  assert.deepEqual(hrefsOf(navFor(undefined, { signedIn: false, started: false })), ["/colleges", "/pricing", "/help"]);
  assert.deepEqual(navFor(undefined, { signedIn: false, started: true }), navFor("student", { signedIn: true, started: false }));
  assert.deepEqual(hrefsOf(navFor(undefined, { signedIn: false, started: true })), ["/colleges", "/compare", "/application", "/writing", "/tools", "/profile"]);
});

test("accountMenuFor: teachers get settings and help, everyone else the student menu", () => {
  assert.deepEqual(hrefsOf(accountMenuFor("teacher")), ["/settings", "/help"]);
  assert.deepEqual(hrefsOf(accountMenuFor("student")), ["/settings", "/connect-ai", "/pricing", "/help"]);
  assert.deepEqual(accountMenuFor(null), accountMenuFor("student"));
});

test("hasStarted: a saved college or any score counts", () => {
  assert.equal(hasStarted({ collegeCount: 0, hasScore: false }), false);
  assert.equal(hasStarted({ collegeCount: 1, hasScore: false }), true);
  assert.equal(hasStarted({ collegeCount: 0, hasScore: true }), true);
});

test("startedFrom: list, starred colleges, scores and English tests all count", () => {
  assert.equal(startedFrom({ list: [], profile: {} }), false);
  assert.equal(startedFrom({ list: [{}], profile: {} }), true);
  assert.equal(startedFrom({ list: [], profile: { interested: ["mit"] } }), true);
  assert.equal(startedFrom({ list: [], profile: { sat: 1400 } }), true);
  assert.equal(startedFrom({ list: [], profile: { act: 30 } }), true);
  assert.equal(startedFrom({ list: [], profile: { tests: { english: { toefl: { total: null }, ielts: { total: 7 } } } } }), true);
  assert.equal(startedFrom({ list: [], profile: { tests: { english: { toefl: { total: null } } } } }), false);
});

test("startedFrom: empty real-shape profile is not started", () => {
  assert.equal(startedFrom({ list: [], profile: { sat: null, act: null, interested: [], tests: { english: {} } } }), false);
});

test("/writing and /tools are student-only", () => {
  assert.equal(isStudentOnlyPath("/writing/essays"), true);
  assert.equal(isStudentOnlyPath("/tools"), true);
  assert.equal(isStudentOnlyPath("/tools/resume"), true);
  assert.equal(isStudentOnlyPath("/toolsmith"), false);
  assert.equal(isStudentOnlyPath("/settings"), false);
});

test("roleChangeMessage explains what to do first", () => {
  assert.match(roleChangeMessage("leave your teachers first"), /Leave your teachers/);
  assert.match(roleChangeMessage("remove your students first"), /Remove all your linked students/);
  assert.equal(roleChangeMessage("teacher name required"), "Enter your name.");
  assert.equal(roleChangeMessage("network down"), "network down");
});

test("activeNavHref picks the longest matching nav item", () => {
  const t = navFor("teacher", { signedIn: true, started: false }).map(([h]) => h);
  const s = navFor("student", { signedIn: true, started: false }).map(([h]) => h);
  assert.equal(activeNavHref("/teacher/classes", t), "/teacher/classes");
  assert.equal(activeNavHref("/teacher", t), "/teacher");
  assert.equal(activeNavHref("/teacher/students", t), "/teacher/students");
  assert.equal(activeNavHref("/writing/essays", s), "/writing");
  assert.equal(activeNavHref("/tools/resume", s), "/tools");
  assert.equal(activeNavHref("/colleges/harvard", s), "/colleges");
  assert.equal(activeNavHref("/compare", s), "/compare");
  assert.equal(activeNavHref("/", s), null);
  assert.equal(activeNavHref("/colleges-old", s), null);
});
