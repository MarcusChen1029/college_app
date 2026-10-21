import assert from "node:assert/strict";
import { test } from "node:test";
import { newCaActivity, newCaHonor, newUcEntry, ucDraftsFromCommonApp, type ActivityData } from "./activities.ts";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER, gradeText, resumeText } from "./resume.ts";

const activities = (): ActivityData => {
  const d: ActivityData = {
    commonApp: {
      activities: [
        { ...newCaActivity(), type: "Robotics", position: "Captain", organization: "FRC Team 1234", description: "Led 30 students.", grades: ["10", "11", "12"], hoursPerWeek: 10, weeksPerYear: 30 },
        { ...newCaActivity(), type: "Work (Paid)", position: "Cashier", organization: "Corner Cafe" },
      ],
      honors: [{ ...newCaHonor(), title: "AIME Qualifier", grades: ["11"], levels: ["national"] }],
    },
    uc: [],
  };
  // UC: one copy of each Common App item, plus a UC-only program.
  d.uc = [...ucDraftsFromCommonApp(d), { ...newUcEntry("edprep"), name: "COSMOS", grades: ["11"], description: "Summer engineering program." }];
  return d;
};

test("grade text collapses consecutive grades", () => {
  assert.equal(gradeText(["10", "11", "12"]), "Grades 10–12");
  assert.equal(gradeText(["9", "11"]), "Grades 9, 11");
  assert.equal(gradeText(["11"]), "Grade 11");
  assert.equal(gradeText([]), "");
});

test("both sources: Common App items plus UC-only entries, no duplicates", () => {
  const r = buildResume({ activities: activities() }, EMPTY_HEADER, DEFAULT_OPTIONS);
  const titles = Object.fromEntries(r.sections.map((s) => [s.key, s.items.map((i) => i.title)]));
  assert.deepEqual(titles, { honors: ["AIME Qualifier"], leadership: ["Captain"], work: ["Cashier"], programs: ["COSMOS"] });
  assert.equal(r.sections.find((s) => s.key === "leadership")!.items[0].meta, "Grades 10–12 · 10 hr/wk, 30 wk/yr");
});

test("single source and hidden hours", () => {
  const ca = buildResume({ activities: activities() }, EMPTY_HEADER, { ...DEFAULT_OPTIONS, source: "common", showHours: false });
  assert.equal(ca.sections.some((s) => s.key === "programs"), false);
  assert.equal(ca.sections.find((s) => s.key === "leadership")!.items[0].meta, "Grades 10–12");
  const uc = buildResume({ activities: activities() }, EMPTY_HEADER, { ...DEFAULT_OPTIONS, source: "uc" });
  assert.equal(uc.sections.flatMap((s) => s.items).length, 4);
});

test("education lines and plain text", () => {
  const p = { gpa: 3.9, sat: 1530, tests: { sat: { ebrw: 740, math: 790 }, english: { ielts: { total: 7.5, sections: {} } } } };
  const r = buildResume(p, { ...EMPTY_HEADER, fullName: "Alex Lin", school: "Taipei American School", gradYear: "2027" }, DEFAULT_OPTIONS);
  assert.deepEqual(r.education.lines, ["GPA 3.90 (unweighted)", "SAT 1530 (Reading & Writing 740, Math 790) · IELTS Academic 7.5"]);
  assert.match(resumeText({ ...EMPTY_HEADER, fullName: "Alex Lin", school: "Taipei American School", gradYear: "2027" }, r), /^ALEX LIN\n\nEDUCATION\nTaipei American School · Class of 2027/);
  assert.deepEqual(buildResume(p, EMPTY_HEADER, { ...DEFAULT_OPTIONS, showScores: false }).education.lines, []);
});
