// Weighted GPA and the admission-test choice: row mapping, fit, AI patch rules, wording.
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildContextPack } from "./ai-context.ts";
import { comparableGpa, computeFit, type StudentProfile } from "./fit.ts";
import { parseGpa } from "./gpa.ts";
import { makeT } from "./i18n/index.ts";
import { planMonthText, testCardView, testPlanText } from "./i18n/test-plan-text.ts";
import { applyProfilePatch } from "./mcp/rules.ts";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER } from "./resume.ts";
import { fromProfile, PROFILE_COLUMNS_NO_LOGINS, toProfile, type ProfileRow } from "./student-rows.ts";
import { withTestChoice } from "./test-plan.ts";

const row: ProfileRow = {
  sat_total: 1450,
  act_composite: 33,
  gpa_unweighted: 3.8,
  gpa_weighted: 4.55,
  is_international: true,
  target_regions: ["US"],
  reminder_emails: true,
  plan: "free",
  test_details: { sat: { ebrw: 730, math: 720 }, plan: { using: [], planned: { test: "act", month: "2026-12" } } },
  interested: null,
  activities: null,
  resume: null,
  essays: null,
};

const purdue = { admit_rate: 43.43, intl_admit_rate: 22.49, sat_p25: 1220, sat_p75: 1470, act_p25: 28, act_p75: 34, test_policy: "required" };

test("weighted GPA and the test plan round-trip through the profile row mapping", () => {
  const profile = toProfile(row);
  assert.equal(profile.gpaWeighted, 4.55);
  assert.deepEqual(profile.tests?.plan, { using: [], planned: { test: "act", month: "2026-12" } });
  const back = fromProfile("u1", profile);
  assert.equal(back.gpa_weighted, 4.55);
  assert.deepEqual(back.test_details, row.test_details);
  assert.equal(toProfile({ ...row, gpa_weighted: "4.55" as never }).gpaWeighted, 4.55); // numeric can arrive as text
  assert.equal(toProfile({ ...row, gpa_weighted: undefined }).gpaWeighted, null); // a row read before migration 0037
  assert.equal(fromProfile("u1", { ...profile, gpaWeighted: null }).gpa_weighted, null);
  assert.match(PROFILE_COLUMNS_NO_LOGINS, /gpa_weighted/);
});

test("fit ignores a score the student switched away from, but keeps it saved", () => {
  const both: StudentProfile = { sat: 1500, act: 20 };
  const actOnly: StudentProfile = { ...both, tests: { plan: withTestChoice(undefined, "act") } };
  // ACT 20 is below Purdue's 25th percentile (28); the SAT 1500 would put the student above the 75th.
  assert.equal(computeFit(both, purdue)?.parts.score?.test, "SAT");
  const r = computeFit(actOnly, purdue)!;
  assert.deepEqual(r.parts.score, { test: "ACT", band: "below" });
  assert.equal(actOnly.sat, 1500);
  // Planning to take a test, or not taking one: no score is compared at all.
  for (const choice of ["planned", "none"] as const) {
    const r2 = computeFit({ ...both, tests: { plan: withTestChoice(undefined, choice) } }, purdue)!;
    assert.equal(r2.parts.score, null);
    assert.equal(r2.parts.note, "noScore");
  }
});

test("a weighted GPA never reaches fit or any GPA comparison", () => {
  assert.deepEqual(computeFit({ sat: 1350, gpaWeighted: 5.2 }, purdue), computeFit({ sat: 1350 }, purdue));
  assert.deepEqual(computeFit({ sat: 1350, gpa: 3.5, gpaWeighted: 5.2 }, purdue), computeFit({ sat: 1350, gpa: 3.5 }, purdue));
  assert.equal(comparableGpa({ gpaWeighted: 5.2 }), null);
  assert.equal(comparableGpa({ gpa: 3.5, gpaWeighted: 5.2 }), 3.5);
  assert.equal(computeFit({ gpaWeighted: 5.2 }, purdue)?.parts.note, "noScore");
});

test("parseGpa rounds to 2 decimals and rejects empty or out-of-range text", () => {
  assert.equal(parseGpa("3.856", 0, 4), 3.86);
  assert.equal(parseGpa("4.01", 0, 4), null);
  assert.equal(parseGpa("5.3", 0, 6), 5.3);
  assert.equal(parseGpa(" ", 0, 6), null);
  assert.equal(parseGpa("abc", 0, 6), null);
});

test("AI profile patch: weighted GPA 0-6, and the test choice never deletes a score", () => {
  const ok = applyProfilePatch({ sat: 1500 }, { gpaWeighted: 4.7 });
  assert.ok(ok.ok);
  assert.equal(ok.value.gpaWeighted, 4.7);
  assert.equal(applyProfilePatch({}, { gpaWeighted: 6.5 }).ok, false);
  assert.equal(applyProfilePatch({}, { gpaWeighted: "4.5" }).ok, false);
  assert.ok(applyProfilePatch({ gpaWeighted: 4.7 }, { gpaWeighted: null }).ok);

  const act = applyProfilePatch({ sat: 1500, act: 30 }, { testChoice: "act" });
  assert.ok(act.ok);
  assert.deepEqual([act.value.sat, act.value.act, act.value.tests?.plan?.using], [1500, 30, ["act"]]);

  const planned = applyProfilePatch({}, { testChoice: "planned", plannedTest: "act", plannedMonth: "2027-03" });
  assert.ok(planned.ok);
  assert.deepEqual(planned.value.tests?.plan, { using: [], planned: { test: "act", month: "2027-03" } });
  // the same keys in the other order give the same result
  const swapped = applyProfilePatch({}, { plannedMonth: "2027-03", plannedTest: "act", testChoice: "planned" });
  assert.ok(swapped.ok);
  assert.deepEqual(swapped.value.tests?.plan, planned.value.tests?.plan);

  assert.equal(applyProfilePatch({}, { testChoice: "gre" }).ok, false);
  assert.equal(applyProfilePatch({}, { plannedTest: "toefl" }).ok, false);
  assert.equal(applyProfilePatch({}, { plannedMonth: "2027-13" }).ok, false);
  assert.equal(applyProfilePatch({}, { plannedMonth: "next spring" }).ok, false);
});

test("test-choice wording in English and Traditional Chinese", () => {
  const en = makeT("en");
  const zh = makeT("zh-TW");
  const planned = { plan: withTestChoice(undefined, "planned") };
  assert.equal(testPlanText(en, "en", undefined), "");
  assert.equal(testPlanText(en, "en", { plan: withTestChoice(undefined, "both") }), "SAT and ACT");
  assert.equal(testPlanText(en, "en", planned), "SAT planned");
  const dec = { plan: { using: [], planned: { test: "act" as const, month: "2026-12" } } };
  assert.equal(testPlanText(en, "en", dec), "ACT planned, Dec 2026");
  assert.notEqual(testPlanText(zh, "zh-TW", dec), testPlanText(en, "en", dec));
  assert.match(planMonthText("zh-TW", "2026-12"), /2026/);
  assert.equal(testPlanText(en, "en", { plan: withTestChoice(undefined, "none") }), "Not taking a test (test-optional)");

  // card: derived from the scores when nothing is stored; a number each for SAT, ACT, both
  assert.deepEqual(testCardView(en, "en", { sat: 1450, tests: { sat: { ebrw: 730, math: 720 } } }), { label: "SAT", value: 1450, sub: "730 / 720" });
  assert.deepEqual(testCardView(en, "en", { sat: 1450, act: 33 }), { label: "SAT + ACT", value: 1450, sub: "ACT 33" });
  assert.deepEqual(testCardView(en, "en", {}), { label: "Admission test", value: null });
  assert.deepEqual(testCardView(en, "en", { tests: dec }), { label: "Admission test", value: "ACT", sub: "Planned · Dec 2026" });
  assert.equal(testCardView(en, "en", { tests: { plan: withTestChoice(undefined, "none") } }).small, true);
});

test("AI context and résumé follow the choice and mention the weighted GPA", () => {
  const profile: StudentProfile = { gpa: 3.8, gpaWeighted: 4.55, sat: 1450, act: 33, tests: { plan: withTestChoice(undefined, "act") } };
  const md = buildContextPack({ profile, colleges: [], deadlines: [], planLabels: {}, englishTestNames: {}, full: false, today: new Date("2026-10-27T12:00:00Z") });
  assert.match(md, /GPA \(unweighted, 4\.0 scale\): 3\.8/);
  assert.match(md, /GPA \(weighted, as on my transcript[^)]*\): 4\.55/);
  assert.match(md, /Admission test: ACT only/);
  assert.match(md, /SAT: 1450 \(saved, but I'm not using this test\)/);
  assert.doesNotMatch(md, /ACT: 33 \(saved/);

  const plain = buildContextPack({ profile: { gpa: 3.8, sat: 1450 }, colleges: [], deadlines: [], planLabels: {}, englishTestNames: {}, full: false, today: new Date("2026-10-27T12:00:00Z") });
  assert.doesNotMatch(plain, /weighted, as on|Admission test:|not using this test/);

  const lines = buildResume(profile, EMPTY_HEADER, DEFAULT_OPTIONS).education.lines;
  assert.deepEqual(lines, ["GPA 3.80 (unweighted)", "ACT 33"]);
});
