import assert from "node:assert/strict";
import { test } from "node:test";
import { homePathFor, isStudentOnlyPath, navFor, parseRole, redirectFor, validateTeacher } from "./roles.ts";

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

test("navFor: teachers get no student pages; everyone else gets the student nav", () => {
  assert.equal(navFor("teacher").some(([href]) => href === "/profile"), false);
  assert.equal(navFor("teacher").some(([href]) => href === "/teacher"), true);
  assert.deepEqual(navFor(null), navFor("student"));
  assert.deepEqual(navFor(undefined), navFor("student"));
});
