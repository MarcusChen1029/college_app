import assert from "node:assert/strict";
import { test } from "node:test";
import { checkItemText } from "../components/TeacherText.ts";
import type { ChecklistItem } from "./checklist.ts";
import type { TFunction } from "./i18n/index.ts";

// Echoes the key, so the test sees which dictionary entry the text came from.
const t = ((key: string) => key) as unknown as TFunction;
const item = (key: string, detail: string | null = null): ChecklistItem => ({ key, done: false, shared: false, step: null, detail }) as ChecklistItem;

test("checkItemText: a Canadian test item names its test step, a US one stays plain", () => {
  assert.equal(checkItemText(t, item("test_scores", "Casper test"), "CA"), "teacher.check.testScores (Casper test)");
  assert.equal(checkItemText(t, item("test_scores"), "US"), "teacher.check.testScores");
  assert.equal(checkItemText(t, item("admissions_test", "TMUA"), "GB"), "teacher.check.admissionsTest (TMUA)");
  assert.equal(checkItemText(t, item("transcript"), "CA"), "teacher.check.transcriptCA");
});
