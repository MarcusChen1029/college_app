import assert from "node:assert/strict";
import { test } from "node:test";
import { sameCourseName } from "./course-names.ts";

test("the same course typed a little differently matches", () => {
  assert.ok(sameCourseName("World Language - Japanese I", "World Language Japanese I"));
  assert.ok(sameCourseName("Information Technology 9", "Information Technology"));
  assert.ok(sameCourseName("AP Statistic", "AP Statistics"));
  assert.ok(sameCourseName("japanese 1", "Japanese I"));
  assert.ok(sameCourseName("ENGLISH 9 LEVEL 1", "English 9 Level 1"));
});

test("different courses never match", () => {
  assert.ok(!sameCourseName("AP Physics 1", "AP Physics 1- Laboratory"));
  assert.ok(!sameCourseName("Chinese 1", "Chinese 2"));
  assert.ok(!sameCourseName("AP Physics 1", "AP Physics 2"));
  assert.ok(!sameCourseName("Drama", "Drama 10 Advanced"));
  assert.ok(!sameCourseName("Art", "Arts"));
  assert.ok(!sameCourseName("", "Art"));
});
