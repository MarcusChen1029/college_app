import assert from "node:assert/strict";
import { test } from "node:test";
import { newCaActivity, newCaHonor, newUcEntry, UC_EDPREP_OTHER, ucDraftsFromCommonApp, type ActivityData } from "./activities.ts";
import { buildResume, DEFAULT_OPTIONS, EMPTY_HEADER, gradeText, resumeText } from "./resume.ts";

const activities = (): ActivityData => {
  const d: ActivityData = {
    version: 2,
    commonApp: {
      activities: [
        { ...newCaActivity(), type: "Robotics", leadership: true, position: "Captain", organization: "FRC Team 1234", description: "Led 30 students.", grades: ["10", "11", "12"], hoursPerWeek: 10, weeksPerYear: 30 },
        { ...newCaActivity(), type: "Employment or work (paid)", leadership: true, position: "Cashier", organization: "Corner Cafe" },
      ],
      honors: [{ ...newCaHonor(), title: "AIME Qualifier", grades: ["11"], levels: ["national"] }],
    },
    uc: [],
  };
  // UC: one copy of each Common App item, plus a UC-only program.
  d.uc = [...ucDraftsFromCommonApp(d), { ...newUcEntry("edprep"), program: "281", grades: ["11"], description: "Summer engineering program." }];
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
  assert.deepEqual(titles, { honors: ["AIME Qualifier"], leadership: ["Captain"], work: ["Cashier"], programs: ["California State Summer School for Mathematics and Science (COSMOS)"] });
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

const resumeOf = (d: Partial<ActivityData>, source: "common" | "uc" | "both" = "both") =>
  buildResume({ activities: { version: 2, commonApp: { activities: [], honors: [] }, uc: [], ...d } }, EMPTY_HEADER, { ...DEFAULT_OPTIONS, source });
const itemsOf = (r: ReturnType<typeof buildResume>, key: string) => r.sections.find((s) => s.key === key)?.items ?? [];

test("Common App sections: paid work and internships are work, volunteering is service, the rest leadership", () => {
  const r = resumeOf({
    commonApp: {
      activities: [
        { ...newCaActivity(), type: "Employment or work (paid)", organization: "Cafe" },
        { ...newCaActivity(), type: "Internship", organization: "Lab" },
        { ...newCaActivity(), type: "Community service or volunteer work", organization: "Food bank" },
        { ...newCaActivity(), type: "Robotics", organization: "FRC" },
      ],
      honors: [],
    },
  });
  assert.deepEqual(itemsOf(r, "work").map((i) => i.title), ["Cafe", "Lab"]);
  assert.deepEqual(itemsOf(r, "service").map((i) => i.title), ["Food bank"]);
  assert.deepEqual(itemsOf(r, "leadership").map((i) => i.title), ["FRC"]);
});

test("the role is shown only when the student said they had a leadership role", () => {
  const r = resumeOf({
    commonApp: {
      activities: [
        { ...newCaActivity(), type: "Robotics", leadership: true, position: "Captain", organization: "FRC" },
        { ...newCaActivity(), type: "Robotics", leadership: false, position: "Captain", organization: "Chess Club" },
        { ...newCaActivity(), type: "Robotics", leadership: null, position: "Captain", organization: "Band" },
      ],
      honors: [],
    },
  });
  const items = itemsOf(r, "leadership");
  assert.deepEqual(items.map((i) => [i.title, i.organization]), [["Captain", "FRC"], ["Chess Club", ""], ["Band", ""]]);
  assert.ok(!resumeText(EMPTY_HEADER, r).includes("Captain · Chess Club"));
});

test("an activity with only a description or sport still gets a title; the private legacy note never appears", () => {
  const r = resumeOf({
    commonApp: {
      activities: [{ ...newCaActivity(), type: "Athletics (JV or varsity)", sport: "Soccer", description: "Midfielder.", legacy: "From your earlier version: secret note" }],
      honors: [],
    },
  });
  assert.deepEqual(itemsOf(r, "leadership").map((i) => i.title), ["Soccer"]);
  assert.ok(!JSON.stringify(r).includes("secret note"));
});

test("timing shows for school year or break only, not all year", () => {
  const act = (timing: "school" | "break" | "all") => ({ ...newCaActivity(), type: "Art", organization: "Studio", grades: ["11" as const], timing });
  const meta = (t: "school" | "break" | "all") => itemsOf(resumeOf({ commonApp: { activities: [act(t)], honors: [] } }), "leadership")[0].meta;
  assert.equal(meta("school"), "Grade 11 · During the school year");
  assert.equal(meta("break"), "Grade 11 · During school break");
  assert.equal(meta("all"), "Grade 11");
});

test("UC work shows the job title with the workplace; the hours-per-grade grid is not shown", () => {
  const r = resumeOf({ uc: [{ ...newUcEntry("work"), jobTitle: "Barista", name: "Corner Cafe", grades: ["11", "12"], description: "Made coffee.", workHours: { "11": { schoolYear: 10, summer: 20 } } }] }, "uc");
  assert.deepEqual(itemsOf(r, "work").map((i) => [i.title, i.organization, i.meta]), [["Barista", "Corner Cafe", "Grades 11–12"]]);
});

test("UC education prep shows the program label, or the Other name", () => {
  const r = resumeOf({
    uc: [
      { ...newUcEntry("edprep"), program: "2" },
      { ...newUcEntry("edprep"), program: UC_EDPREP_OTHER, name: "Local mentoring" },
      { ...newUcEntry("edprep"), program: UC_EDPREP_OTHER, name: "" },
      { ...newUcEntry("edprep"), program: null, name: "" },
    ],
  }, "uc");
  assert.deepEqual(itemsOf(r, "programs").map((i) => i.title), ["Cal-SOAP", "Local mentoring"]);
});

test("UC awards show every level ticked", () => {
  const r = resumeOf({ uc: [{ ...newUcEntry("award"), name: "Science Fair", awardLevels: ["school", "state", "national"], grades: ["10"] }] }, "uc");
  assert.equal(itemsOf(r, "honors")[0].meta, "School, State, National · Grade 10");
});
