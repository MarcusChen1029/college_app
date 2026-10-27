import assert from "node:assert/strict";
import { test } from "node:test";
import { bestSchoolMatch, codeInText, sameSchoolCode, schoolNameScore, schoolOnPage, SAME_SCHOOL } from "./school-match.ts";

const KC = "Kang Chiao International School Linkou Campus";

test("portal spellings of the same school match", () => {
  for (const other of [
    "KANG CHIAO INTL SCH LINKOU CMP",
    "Kang Chiao International School - Linkou Campus",
    "Kang Chiao Int'l School (Linkou Campus)",
    "kang chiao international school lin kou campus",
    "Kang Chiao International School Linkou Campus, New Taipei City",
    "Kang Chiao Internatonal School Linkou Campus", // one typo
  ]) assert.ok(schoolNameScore(KC, other) >= SAME_SCHOOL, other);
  assert.ok(schoolNameScore("St. Mary's H.S.", "Saint Marys High School") >= SAME_SCHOOL);
  assert.ok(schoolNameScore("Lincoln High", "Lincoln High School") >= SAME_SCHOOL);
});

test("different schools do not match", () => {
  assert.ok(schoolNameScore(KC, "Kang Chiao Bilingual School Hsinchu Campus") < SAME_SCHOOL);
  assert.ok(schoolNameScore("Lincoln High School", "Lincoln Middle School") < SAME_SCHOOL);
  assert.ok(schoolNameScore("Taipei American School", "Taipei European School") < SAME_SCHOOL);
  assert.equal(schoolNameScore("", "Lincoln High School"), 0);
});

test("codes compare without case, spaces or dashes and are found as whole words", () => {
  assert.ok(sameSchoolCode("694132", " 694-132 "));
  assert.ok(!sameSchoolCode("", ""));
  assert.ok(!sameSchoolCode(null, "694132"));
  assert.ok(codeInText("694132", "Kang Chiao ... School code: 694132 Edit"));
  assert.ok(!codeInText("694132", "School code: 1694132"));
  assert.ok(!codeInText("", "anything"));
});

test("bestSchoolMatch: exact, then code, then the single best name", () => {
  const v = (o: { name: string; code?: string }) => o;
  const opts = [{ name: "KANG CHIAO INTL SCH LINKOU CMP" }, { name: "Kang Chiao Bilingual School Hsinchu" }];
  assert.equal(bestSchoolMatch(opts, { name: KC }, v), opts[0]);
  assert.equal(bestSchoolMatch(opts, { name: "Somewhere Else High" }, v), null);
  const coded = [{ name: "School A", code: "111111" }, { name: "School B", code: "694132" }];
  assert.equal(bestSchoolMatch(coded, { name: KC, code: "694132" }, v), coded[1]);
  // Two equally good names: no guess.
  const twins = [{ name: "Lincoln High School North" }, { name: "Lincoln High School South" }];
  assert.equal(bestSchoolMatch(twins, { name: "Lincoln High" }, v), null);
  // Exact text beats a broader match.
  const exact = [{ name: "Lincoln High School" }, { name: "Lincoln High School North" }];
  assert.equal(bestSchoolMatch(exact, { name: "Lincoln High School" }, v), exact[0]);
});

test("schoolOnPage: code first, then the most specific name whose words are all on the page", () => {
  const v = (o: { name: string; code?: string }) => o;
  const plans = [{ name: KC, code: "694132" }, { name: "Taipei American School", code: "694100" }];
  assert.equal(schoolOnPage(plans, "Enter courses for KANG CHIAO INTL SCH LINKOU CMP. School code: 694132", v), plans[0]);
  assert.equal(schoolOnPage([{ name: KC }, { name: "Taipei American School" }], "Courses at Kang Chiao Int'l School, Linkou Campus", v)?.name, KC);
  assert.equal(schoolOnPage([{ name: KC }, { name: "Taipei American School" }], "Your coursework", v), null);
});
