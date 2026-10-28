import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  CA_ACTIVITY_TYPES,
  CA_ATHLETIC_TYPES,
  CA_SPORTS,
  EMPTY_ACTIVITIES,
  UC_EDPREP_PROGRAMS,
  caActivityIssues,
  caHonorIssues,
  caVisibleQuestions,
  draftIssues,
  move,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  ucDraftIssues,
  ucDraftsFromCommonApp,
  ucEntryIssues,
  ucTextLength,
  ucVisibleQuestions,
  upgradeActivities,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type Issue,
  type UcEntry,
} from "./activities.ts";
import { CA_TYPE_KEYS } from "./i18n/ca-types.ts";
import { en } from "./i18n/en.ts";
import { zhTW } from "./i18n/zh-TW.ts";

const data = (): ActivityData => ({
  version: 2,
  commonApp: {
    activities: [
      { ...newCaActivity(), type: "Robotics", leadership: true, position: "Captain", organization: "FRC Team 1234", description: "Led 30 students.", grades: ["10", "11"], hoursPerWeek: 10, weeksPerYear: 30 },
      { ...newCaActivity(), type: "Employment or work (paid)", leadership: true, position: "Cashier", organization: "Corner Cafe", description: "Weekend shifts." },
      newCaActivity(), // blank slot: not copied
    ],
    honors: [{ ...newCaHonor(), title: "AIME Qualifier", grades: ["11"], levels: ["school", "national"] }],
  },
  uc: [],
});

// A Common App activity with every question answered.
const robotics = (): CaActivity => ({
  ...newCaActivity(),
  type: "Robotics",
  sport: "",
  leadership: true,
  position: "Captain",
  organization: "FRC Team 1234",
  description: "Led 30 students.",
  grades: ["10", "11"],
  timing: "school",
  hoursPerWeek: 10,
  weeksPerYear: 30,
  continueInCollege: "yes",
});

const fields = (issues: Issue[], kind?: Issue["kind"]) => issues.filter((i) => !kind || i.kind === kind).map((i) => i.field);

test("ucTextLength counts a newline as two characters", () => {
  assert.equal(ucTextLength("ab\ncd"), 6);
  assert.equal(ucTextLength(""), 0);
  assert.equal(ucTextLength("a\n\nb"), 6);
});

test("option lists match the portals", () => {
  assert.equal(CA_ACTIVITY_TYPES.length, 30);
  assert.equal(CA_ACTIVITY_TYPES[0], "Academic");
  assert.deepEqual(CA_ACTIVITY_TYPES.slice(9, 12), ["Debate or speech", "Employment or work (paid)", "Environmental"]); // display order, not value order
  assert.equal(CA_ACTIVITY_TYPES[29], "Other");
  assert.deepEqual([...CA_ATHLETIC_TYPES], ["Athletics (other)", "Athletics (JV or varsity)"]);
  for (const t of CA_ATHLETIC_TYPES) assert.ok(CA_ACTIVITY_TYPES.includes(t), t);
  assert.equal(CA_SPORTS.length, 48);
  assert.ok(CA_SPORTS.includes("Rock climbing, Bouldering")); // one label that contains a comma
  assert.equal(new Set(CA_SPORTS).size, 48);
  assert.equal(UC_EDPREP_PROGRAMS.length, 27);
  assert.deepEqual(UC_EDPREP_PROGRAMS.at(-1), { value: "18", label: "Other" });
  assert.equal(new Set(UC_EDPREP_PROGRAMS.map((p) => p.value)).size, UC_EDPREP_PROGRAMS.length);
  assert.equal(UC_EDPREP_PROGRAMS.find((p) => p.value === "11")?.label, "MESA (Mathematics, Engineering, Science Achievement) including MESA Schools Programs, SUCCESS Through Collaboration and California Community College Program");
  assert.equal(UC_EDPREP_PROGRAMS.find((p) => p.value === "15")?.label, 'UCSC SAGE (Students Acquiring "A-G" Expectations)');
});

test("a fully answered Common App activity has no issues", () => {
  assert.deepEqual(caActivityIssues(robotics()), []);
});

test("a blank Common App activity is missing its required answers, not invalid", () => {
  const issues = caActivityIssues(newCaActivity());
  assert.ok(issues.every((i) => i.kind === "missing"));
  assert.deepEqual(fields(issues).sort(), ["continueInCollege", "description", "grades", "hoursPerWeek", "type", "weeksPerYear"]);
});

test("Common App text and number limits", () => {
  const a = robotics();
  assert.deepEqual(caActivityIssues({ ...a, description: "x".repeat(150) }), []);
  const long = caActivityIssues({ ...a, description: "x".repeat(151) });
  assert.deepEqual([long.length, long[0].field, long[0].kind], [1, "description", "invalid"]);
  assert.match(long[0].message, /150 characters \(this has 151\)/);
  assert.deepEqual(fields(caActivityIssues({ ...a, organization: "x".repeat(101) }), "invalid"), ["organization"]);
  assert.deepEqual(fields(caActivityIssues({ ...a, position: "x".repeat(51) }), "invalid"), ["position"]);
  for (const hoursPerWeek of [0, 200]) assert.deepEqual(fields(caActivityIssues({ ...a, hoursPerWeek }), "invalid"), ["hoursPerWeek"]);
  assert.deepEqual(caActivityIssues({ ...a, hoursPerWeek: 5.5 }), []);
  assert.deepEqual(caActivityIssues({ ...a, hoursPerWeek: 168, weeksPerYear: 52 }), []);
  assert.deepEqual(fields(caActivityIssues({ ...a, weeksPerYear: 53 }), "invalid"), ["weeksPerYear"]);
  assert.deepEqual(fields(caActivityIssues({ ...a, weeksPerYear: 0.5 }), "invalid"), ["weeksPerYear"]);
});

test("a type outside the Common App list is invalid", () => {
  assert.deepEqual(fields(caActivityIssues({ ...robotics(), type: "Work (Paid)" }), "invalid"), ["type"]);
});

test("sport is required only for the athletics types", () => {
  const a = robotics();
  const athletic = caActivityIssues({ ...a, type: "Athletics (JV or varsity)", sport: "" });
  assert.deepEqual(fields(athletic, "missing"), ["sport"]);
  assert.deepEqual(fields(caActivityIssues({ ...a, type: "Athletics (other)", sport: "" }), "missing"), ["sport"]);
  assert.deepEqual(caActivityIssues({ ...a, type: "Athletics (other)", sport: "Soccer" }), []);
  assert.deepEqual(fields(caActivityIssues({ ...a, type: "Athletics (other)", sport: "Quidditch" }), "invalid"), ["sport"]);
  assert.ok(!fields(caActivityIssues({ ...a, type: "Robotics", sport: "" })).includes("sport"));
});

test("role is required only when the student had a leadership role", () => {
  const a = robotics();
  assert.deepEqual(fields(caActivityIssues({ ...a, leadership: true, position: "" }), "missing"), ["position"]);
  assert.ok(!fields(caActivityIssues({ ...a, leadership: false, position: "" })).includes("position"));
  assert.ok(!fields(caActivityIssues({ ...a, leadership: null, position: "" })).includes("position")); // never answered: not guessed
});

test("time of year, post-graduation dates and still-participating follow the grades ticked", () => {
  const a = robotics();
  assert.deepEqual(fields(caActivityIssues({ ...a, grades: ["10"], timing: null }), "missing"), ["timing"]);
  const pg = caActivityIssues({ ...a, grades: ["PG"], timing: null });
  assert.deepEqual(fields(pg, "missing").sort(), ["afterStart", "stillParticipating"]);
  assert.deepEqual(caActivityIssues({ ...a, grades: ["PG"], timing: null, afterStart: "2026-01", stillParticipating: true }), []);
  const ended = { ...a, grades: ["PG" as const], timing: null, afterStart: "2026-01", stillParticipating: false };
  assert.deepEqual(fields(caActivityIssues({ ...ended, afterEnd: null }), "missing"), ["afterEnd"]);
  assert.deepEqual(caActivityIssues({ ...ended, afterEnd: "2026-06" }), []);
  assert.deepEqual(fields(caActivityIssues({ ...ended, afterStart: "2026-09", afterEnd: "2026-06" }), "invalid"), ["afterEnd"]);
  assert.deepEqual(caActivityIssues({ ...ended, afterStart: "2026-06", afterEnd: "2026-06" }), []);
  assert.deepEqual(fields(caActivityIssues({ ...ended, afterStart: "1925-12", afterEnd: "2026-06" }), "invalid"), ["afterStart"]);
  assert.deepEqual(fields(caActivityIssues({ ...ended, afterStart: "2026-01", afterEnd: "2028-01" }), "invalid"), ["afterEnd"]);
  assert.deepEqual(fields(caActivityIssues({ ...ended, afterStart: "June 2026", afterEnd: "2026-06" }), "invalid"), ["afterStart"]);
  // Both 9-12 and PG ticked: both sets of questions apply.
  assert.deepEqual(fields(caActivityIssues({ ...a, grades: ["12", "PG"], timing: null }), "missing").sort(), ["afterStart", "stillParticipating", "timing"]);
});

test("plan to continue in college is never defaulted", () => {
  assert.deepEqual(fields(caActivityIssues({ ...robotics(), continueInCollege: null }), "missing"), ["continueInCollege"]);
  for (const c of ["yes", "no", "not_sure"] as const) assert.deepEqual(caActivityIssues({ ...robotics(), continueInCollege: c }), []);
});

test("Common App honors", () => {
  const h: CaHonor = { ...newCaHonor(), title: "AIME Qualifier", grades: ["11"], levels: ["school", "national"] };
  assert.deepEqual(caHonorIssues(h), []);
  assert.deepEqual(caHonorIssues({ ...h, title: "x".repeat(100) }), []);
  const long = caHonorIssues({ ...h, title: "x".repeat(101) });
  assert.deepEqual([long.length, long[0].field, long[0].kind], [1, "title", "invalid"]);
  assert.deepEqual(fields(caHonorIssues({ ...h, levels: [] }), "missing"), ["levels"]);
  assert.deepEqual(fields(caHonorIssues({ ...h, grades: [] }), "missing"), ["grades"]);
  assert.deepEqual(fields(caHonorIssues({ ...h, title: "" }), "missing"), ["title"]);
});

// UC fixtures with every question answered.
const uc = {
  extracurricular: (): UcEntry => ({ ...newUcEntry("extracurricular"), name: "Chess Club", description: "Ran weekly games.", grades: ["10", "11"], hoursPerWeek: 3, weeksPerYear: 30 }),
  award: (): UcEntry => ({ ...newUcEntry("award"), name: "AIME Qualifier", extra: "Top 5% on the AMC 12.", description: "Studied for a year.", grades: ["11"], awardLevels: ["national"], awardType: "academic" }),
  edprep: (): UcEntry => ({ ...newUcEntry("edprep"), program: "6", description: "Weekly workshops.", grades: ["11"], hoursPerWeek: 2, weeksPerYear: 20 }),
  coursework: (): UcEntry => ({ ...newUcEntry("coursework"), name: "Linear Algebra", description: "Community college course.", grades: ["12"], hoursPerWeek: 4, weeksPerYear: 15 }),
  volunteer: (): UcEntry => ({ ...newUcEntry("volunteer"), name: "Food Bank", extra: "Regional food bank.", description: "Packed boxes.", grades: ["10"], hoursPerWeek: 2, weeksPerYear: 40 }),
  work: (): UcEntry => ({
    ...newUcEntry("work"),
    name: "Corner Cafe",
    extra: "Family-run cafe.",
    jobTitle: "Cashier",
    description: "Weekend shifts.",
    grades: ["11"],
    workHours: { "11": { schoolYear: 8, summer: null } },
    stillWorking: true,
    start: "2026-01",
  }),
};

test("fully answered UC entries have no issues in every category", () => {
  for (const [name, make] of Object.entries(uc)) assert.deepEqual(ucEntryIssues(make()), [], name);
});

test("a blank UC entry is missing its required answers", () => {
  const blank = ucEntryIssues(newUcEntry("extracurricular"));
  assert.ok(blank.every((i) => i.kind === "missing"));
  assert.deepEqual(fields(blank).sort(), ["description", "grades", "hoursPerWeek", "name", "weeksPerYear"]);
  assert.deepEqual(fields(ucEntryIssues(newUcEntry("award"))).sort(), ["awardLevels", "awardType", "description", "extra", "grades", "name"]);
  assert.deepEqual(fields(ucEntryIssues(newUcEntry("edprep"))).sort(), ["description", "grades", "hoursPerWeek", "program", "weeksPerYear"]);
  assert.deepEqual(fields(ucEntryIssues(newUcEntry("work"))).sort(), ["description", "extra", "grades", "jobTitle", "name", "start", "stillWorking"]);
});

test("UC text boxes count each newline as two characters", () => {
  const e = uc.extracurricular();
  assert.deepEqual(ucEntryIssues({ ...e, description: "x".repeat(350) }), []);
  const over = ucEntryIssues({ ...e, description: "x".repeat(349) + "\n" });
  assert.deepEqual([over.length, over[0].field, over[0].kind], [1, "description", "invalid"]);
  assert.match(over[0].message, /350 characters.*this counts 351/);
  assert.deepEqual(ucEntryIssues({ ...e, description: "x".repeat(348) + "\n" }), []);
  assert.deepEqual(fields(ucEntryIssues({ ...e, name: "x".repeat(61) }), "invalid"), ["name"]);
  const v = uc.volunteer();
  assert.deepEqual(fields(ucEntryIssues({ ...v, extra: "x".repeat(249) + "\n" }), "invalid"), ["extra"]);
});

test("UC award needs a level, and has no hours or years after 12th grade", () => {
  const a = uc.award();
  assert.deepEqual(fields(ucEntryIssues({ ...a, awardLevels: [] }), "missing"), ["awardLevels"]);
  assert.deepEqual(ucEntryIssues({ ...a, grades: ["PG"], afterYears: null, afterMonths: null }), []);
});

test("UC educational prep: Other needs a name of at most 30 characters", () => {
  const e = uc.edprep();
  assert.deepEqual(fields(ucEntryIssues({ ...e, program: "18", name: "" }), "missing"), ["name"]);
  assert.deepEqual(fields(ucEntryIssues({ ...e, program: "18", name: "x".repeat(31) }), "invalid"), ["name"]);
  assert.deepEqual(ucEntryIssues({ ...e, program: "18", name: "x".repeat(30) }), []);
  assert.deepEqual(fields(ucEntryIssues({ ...e, program: "999" }), "invalid"), ["program"]);
  assert.deepEqual(ucEntryIssues({ ...e, program: "6", name: "ignored" }), []); // name only counts for Other
});

test("UC hours and weeks are range-checked", () => {
  const e = uc.coursework();
  assert.deepEqual(fields(ucEntryIssues({ ...e, hoursPerWeek: 0 }), "invalid"), ["hoursPerWeek"]);
  assert.deepEqual(fields(ucEntryIssues({ ...e, hoursPerWeek: 169 }), "invalid"), ["hoursPerWeek"]);
  assert.deepEqual(fields(ucEntryIssues({ ...e, weeksPerYear: 53 }), "invalid"), ["weeksPerYear"]);
  assert.deepEqual(ucEntryIssues({ ...e, hoursPerWeek: 1.5, weeksPerYear: 52 }), []);
});

test("UC after-12th-grade years and months are required when PG is ticked", () => {
  for (const key of ["extracurricular", "edprep", "coursework", "volunteer"] as const) {
    const e = { ...uc[key](), grades: ["PG" as const] };
    assert.deepEqual(fields(ucEntryIssues(e), "missing").sort(), ["afterMonths", "afterYears"], key);
    assert.deepEqual(ucEntryIssues({ ...e, afterYears: 0, afterMonths: 0 }), [], key);
    assert.deepEqual(ucEntryIssues({ ...e, afterYears: "10+", afterMonths: 11 }), [], key);
    assert.deepEqual(fields(ucEntryIssues({ ...e, afterYears: 0, afterMonths: 12 }), "invalid"), ["afterMonths"], key);
  }
});

test("UC work experience: hours grid, still working and dates", () => {
  const w = uc.work();
  assert.deepEqual(fields(ucEntryIssues({ ...w, workHours: {} }), "missing"), ["workHours"]);
  assert.deepEqual(fields(ucEntryIssues({ ...w, workHours: { "11": { schoolYear: null, summer: null } } }), "missing"), ["workHours"]);
  assert.deepEqual(ucEntryIssues({ ...w, workHours: { "11": { schoolYear: null, summer: 20 } } }), []);
  assert.deepEqual(fields(ucEntryIssues({ ...w, workHours: { "11": { schoolYear: 169, summer: null } } }), "invalid"), ["workHours"]);
  assert.deepEqual(ucEntryIssues({ ...w, workHours: { "11": { schoolYear: 8, summer: null }, "9": { schoolYear: 500, summer: 500 } } }), []); // grade 9 not ticked
  assert.deepEqual(fields(ucEntryIssues({ ...w, stillWorking: false, end: null }), "missing"), ["end"]);
  assert.deepEqual(ucEntryIssues({ ...w, stillWorking: false, end: "2026-08" }), []);
  assert.deepEqual(fields(ucEntryIssues({ ...w, stillWorking: false, start: "2026-09", end: "2026-08" }), "invalid"), ["end"]);
  assert.deepEqual(fields(ucEntryIssues({ ...w, stillWorking: null }), "missing"), ["stillWorking"]);
  assert.deepEqual(fields(ucEntryIssues({ ...w, jobTitle: "x".repeat(61) }), "invalid"), ["jobTitle"]);
  assert.deepEqual(fields(ucEntryIssues({ ...w, grades: ["PG"], workHours: { PG: { schoolYear: 5, summer: null } } }), "missing").sort(), ["afterMonths", "afterYears"]);
});

test("new entries start blank with nothing answered for the student", () => {
  const a = newCaActivity();
  assert.deepEqual([a.leadership, a.timing, a.afterStart, a.stillParticipating, a.afterEnd, a.hoursPerWeek, a.weeksPerYear, a.continueInCollege], Array(8).fill(null));
  assert.equal(a.sport, "");
  assert.notEqual(newUcEntry("work").id, newUcEntry("work").id);
  assert.deepEqual(newUcEntry("work").workHours, {});
  assert.equal(EMPTY_ACTIVITIES.version, 2);
});

test("Common App items become UC drafts in the matching category", () => {
  const drafts = ucDraftsFromCommonApp(data());
  assert.deepEqual(
    drafts.map((d) => [d.category, d.name]),
    [
      ["extracurricular", "FRC Team 1234"],
      ["work", "Corner Cafe"],
      ["award", "AIME Qualifier"],
    ],
  );
  assert.equal(drafts[0].description, "Captain — Led 30 students.");
  assert.deepEqual([drafts[0].hoursPerWeek, drafts[0].weeksPerYear, drafts[0].grades], [10, 30, ["10", "11"]]);
  const d = data();
  const drafted = ucDraftsFromCommonApp(d);
  assert.deepEqual(drafted.map((e) => e.fromId), [d.commonApp.activities[0].id, d.commonApp.activities[1].id, d.commonApp.honors[0].id]);
});

test("a Common App type maps to the UC category it belongs in", () => {
  const category = (type: string) => ucDraftsFromCommonApp({ ...EMPTY_ACTIVITIES, commonApp: { activities: [{ ...newCaActivity(), type, organization: "X" }], honors: [] } })[0].category;
  assert.equal(category("Employment or work (paid)"), "work");
  assert.equal(category("Internship"), "work");
  assert.equal(category("Community service or volunteer work"), "volunteer");
  for (const t of ["Robotics", "Athletics (other)", "Other", "Music", ""]) assert.equal(category(t), "extracurricular", t);
});

test("a work draft takes the employer as the workplace and the role as the job title, with no hours", () => {
  const d = data();
  const [work] = ucDraftsFromCommonApp({ ...d, commonApp: { ...d.commonApp, activities: [{ ...d.commonApp.activities[1], hoursPerWeek: 8, weeksPerYear: 20, grades: ["11"] }] } });
  assert.deepEqual([work.category, work.name, work.jobTitle, work.description], ["work", "Corner Cafe", "Cashier", "Weekend shifts."]);
  assert.deepEqual([work.hoursPerWeek, work.weeksPerYear, work.workHours, work.stillWorking, work.start, work.end], [null, null, {}, null, null, null]);
  assert.deepEqual(work.grades, ["11"]);
  assert.deepEqual(ucEntryIssues(work).filter((i) => i.kind === "invalid"), []);
});

test("an honor becomes an award with every level mapped, and State/Regional is flagged", () => {
  const honor = (levels: CaHonor["levels"]) => ucDraftsFromCommonApp({ ...EMPTY_ACTIVITIES, commonApp: { activities: [], honors: [{ ...newCaHonor(), title: "Prize", grades: ["11"], levels }] } })[0];
  const flagged = honor(["school", "state_regional"]);
  assert.equal(flagged.category, "award");
  assert.deepEqual(flagged.awardLevels, ["school", "state"]);
  assert.equal(flagged.legacy, "Check the level: Common App's State/Regional was copied as State.");
  assert.deepEqual([flagged.awardType, flagged.name, flagged.grades], [null, "Prize", ["11"]]);
  const plain = honor(["national", "international"]);
  assert.deepEqual(plain.awardLevels, ["national", "international"]);
  assert.equal(plain.legacy, undefined);
  assert.deepEqual(honor([]).awardLevels, []);
});

test("drafts keep UC's limits", () => {
  const long = { ...newCaActivity(), type: "Robotics", position: "p".repeat(50), organization: "o".repeat(100), description: "d".repeat(150) };
  const [robotics_] = ucDraftsFromCommonApp({ ...EMPTY_ACTIVITIES, commonApp: { activities: [long], honors: [] } });
  assert.equal(robotics_.name.length, 60);
  assert.ok(ucTextLength(robotics_.description) <= 350);
  const [honor] = ucDraftsFromCommonApp({ ...EMPTY_ACTIVITIES, commonApp: { activities: [], honors: [{ ...newCaHonor(), title: "t".repeat(100) }] } });
  assert.equal(honor.name.length, 60);
});

// ── Upgrading stored data from the earlier format ──

const OLD_TO_NEW_TYPES: [string, string][] = [
  ["Academic", "Academic"],
  ["Art", "Art"],
  ["Athletics: Club", "Athletics (other)"],
  ["Athletics: JV/Varsity", "Athletics (JV or varsity)"],
  ["Career Oriented", "Career readiness or practicums"],
  ["Community Service (Volunteer)", "Community service or volunteer work"],
  ["Computer/Technology", "Computer or technology"],
  ["Cultural", "Cultural"],
  ["Dance", "Dance"],
  ["Debate/Speech", "Debate or speech"],
  ["Environmental", "Environmental"],
  ["Family Responsibilities", "Family responsibilities"],
  ["Foreign Exchange", "Study abroad or foreign exchange"],
  ["Foreign Language", "Foreign language"],
  ["Internship", "Internship"],
  ["Journalism/Publication", "Journalism or publishing"],
  ["Junior R.O.T.C.", "R.O.T.C. or military"],
  ["LGBT", "LGBT+"],
  ["Music: Instrumental", "Music"],
  ["Music: Vocal", "Music"],
  ["Religious", "Religious"],
  ["Research", "Research"],
  ["Robotics", "Robotics"],
  ["School Spirit", "School spirit"],
  ["Science/Math", "Science or math"],
  ["Social Justice", "Social justice or organizing"],
  ["Student Govt./Politics", "Student government or politics"],
  ["Theater/Drama", "Theater or drama"],
  ["Work (Paid)", "Employment or work (paid)"],
  ["Other Club/Activity", "Other"],
];

// What the app stored before the 2026-27 format (no `version`).
const oldActivity = (o: Record<string, unknown> = {}) => ({
  id: "a1",
  type: "Robotics",
  position: "",
  organization: "FRC",
  description: "Built robots.",
  grades: ["10"],
  timing: ["school"],
  hoursPerWeek: 4,
  weeksPerYear: 30,
  continueInCollege: null,
  ...o,
});
const oldUc = (o: Record<string, unknown> = {}) => ({
  id: "u1",
  category: "extracurricular",
  name: "Chess Club",
  organization: "",
  extra: "",
  description: "Played.",
  grades: ["11"],
  hoursPerWeek: 3,
  weeksPerYear: 30,
  awardLevel: null,
  awardType: null,
  ...o,
});
const oldData = (activities: unknown[] = [], uc: unknown[] = [], honors: unknown[] = []) => ({ commonApp: { activities, honors }, uc });
const upgradedUc = (o: Record<string, unknown>) => upgradeActivities(oldData([], [oldUc(o)])).uc[0];
const upgradedCa = (o: Record<string, unknown>) => upgradeActivities(oldData([oldActivity(o)])).commonApp.activities[0];

test("all 30 old Common App types convert to the new labels", () => {
  assert.equal(OLD_TO_NEW_TYPES.length, 30);
  for (const [oldType, newType] of OLD_TO_NEW_TYPES) {
    assert.equal(upgradedCa({ type: oldType }).type, newType, oldType);
    assert.ok(CA_ACTIVITY_TYPES.includes(newType), newType);
  }
  assert.equal(upgradedCa({ type: "" }).type, ""); // a blank slot stays blank
  assert.equal(upgradedCa({ type: "Something else" }).type, "Something else"); // never guessed; the validator flags it
});

test("old time of year, role, plan to continue convert without guessing", () => {
  assert.equal(upgradedCa({ timing: ["school", "break"] }).timing, "all");
  assert.equal(upgradedCa({ timing: ["break", "school"] }).timing, "all");
  assert.equal(upgradedCa({ timing: ["school"] }).timing, "school");
  assert.equal(upgradedCa({ timing: ["break"] }).timing, "break");
  assert.equal(upgradedCa({ timing: [] }).timing, null);
  const captain = upgradedCa({ position: "Captain" });
  assert.deepEqual([captain.leadership, captain.position], [true, "Captain"]);
  const none = upgradedCa({ position: "" });
  assert.deepEqual([none.leadership, none.position], [null, ""]); // never answered, so not false
  assert.equal(upgradedCa({ continueInCollege: true }).continueInCollege, "yes");
  assert.equal(upgradedCa({ continueInCollege: false }).continueInCollege, "no");
  assert.equal(upgradedCa({ continueInCollege: null }).continueInCollege, null);
  const a = upgradedCa({});
  assert.deepEqual([a.sport, a.afterStart, a.stillParticipating, a.afterEnd], ["", null, null, null]);
  assert.deepEqual([a.id, a.organization, a.description, a.grades, a.hoursPerWeek, a.weeksPerYear], ["a1", "FRC", "Built robots.", ["10"], 4, 30]);
});

test("missing or undefined fields become null so the validators never see undefined", () => {
  const a = upgradedCa({ hoursPerWeek: undefined, weeksPerYear: undefined, continueInCollege: undefined, timing: undefined });
  assert.deepEqual([a.hoursPerWeek, a.weeksPerYear, a.continueInCollege, a.timing, a.afterStart, a.stillParticipating, a.afterEnd, a.leadership], Array(8).fill(null));
  assert.doesNotThrow(() => caActivityIssues(a));
  // A half-old v2 object: new keys present, others absent.
  const half = upgradeActivities({ version: 2, commonApp: { activities: [{ id: "x", type: "Robotics", leadership: false }], honors: [{ id: "h" }] }, uc: [{ id: "u", category: "work", name: "Cafe" }] });
  const [ca] = half.commonApp.activities;
  assert.deepEqual([ca.leadership, ca.position, ca.organization, ca.grades, ca.hoursPerWeek, ca.timing, ca.sport], [false, "", "", [], null, null, ""]);
  assert.deepEqual(half.commonApp.honors, [{ id: "h", title: "", grades: [], levels: [] }]);
  const [u] = half.uc;
  assert.deepEqual([u.jobTitle, u.extra, u.hoursPerWeek, u.afterYears, u.afterMonths, u.awardLevels, u.awardType, u.program, u.workHours, u.stillWorking, u.start, u.end], ["", "", null, null, null, [], null, null, {}, null, null, null]);
  assert.doesNotThrow(() => ucEntryIssues(u));
  assert.equal(u.name, "Cafe"); // v2 work keeps name = workplace
});

test("UC award level becomes a list", () => {
  assert.deepEqual(upgradedUc({ category: "award", awardLevel: "national" }).awardLevels, ["national"]);
  assert.deepEqual(upgradedUc({ category: "award", awardLevel: null }).awardLevels, []);
});

test("an old work entry swaps job title and employer, and parks the hours in a note", () => {
  const w = upgradedUc({ category: "work", name: "Cashier", organization: "Corner Cafe", hoursPerWeek: 10, weeksPerYear: 40 });
  assert.deepEqual([w.jobTitle, w.name, w.workHours, w.legacy], ["Cashier", "Corner Cafe", {}, "From your earlier version: 10 hours/week, 40 weeks/year"]);
  assert.deepEqual([w.hoursPerWeek, w.weeksPerYear, w.stillWorking, w.start, w.end], [null, null, null, null, null]);
  assert.equal(upgradedUc({ category: "work", name: "Cashier", organization: "Cafe", hoursPerWeek: null, weeksPerYear: null }).legacy, undefined);
  assert.equal(upgradedUc({ category: "work", name: "A", organization: "B", hoursPerWeek: 5, weeksPerYear: null }).legacy, "From your earlier version: 5 hours/week");
});

test("an old educational prep name finds its UC program, by acronym or full label", () => {
  const ed = (name: string) => upgradedUc({ category: "edprep", name });
  for (const name of ["EAOP", "eaop", "Early Academic Outreach Program (EAOP)", "  early   ACADEMIC outreach program (eaop) "]) {
    const e = ed(name);
    assert.deepEqual([e.program, e.name, e.legacy], ["6", "", undefined], name);
  }
  assert.equal(ed("GEAR UP").program, "10");
  assert.equal(ed("mesa").program, "11"); // acronym before the long bracket
  assert.equal(ed("UCLA VIP Scholars Program").program, "62");
  const local = ed("Local STEM camp");
  assert.deepEqual([local.program, local.name, local.legacy], ["18", "Local STEM camp", undefined]);
  const long = ed("A Very Long Summer Program Name That Is Over Thirty");
  assert.deepEqual([long.program, long.name, long.legacy], ["18", "", "From your earlier version: A Very Long Summer Program Name That Is Over Thirty"]);
  assert.deepEqual([ed("x".repeat(30)).name.length, ed("x".repeat(31)).name], [30, ""]);
  assert.deepEqual([ed("").program, ed("").name], [null, ""]); // nothing to match: left for the student
  assert.deepEqual([ed("Other").program, ed("Other").name], ["18", "Other"]);
});

test("old entries keep their ids, order, grades and fromId", () => {
  const out = upgradeActivities(oldData([oldActivity({ id: "z" }), oldActivity({ id: "a" })], [oldUc({ id: "q", fromId: "z" }), oldUc({ id: "b", grades: ["PG", "9"] })], [{ id: "h2", title: "T", grades: ["12"], levels: ["national"] }]));
  assert.deepEqual(out.commonApp.activities.map((a) => a.id), ["z", "a"]);
  assert.deepEqual(out.uc.map((e) => e.id), ["q", "b"]);
  assert.equal(out.uc[0].fromId, "z");
  assert.equal("fromId" in out.uc[1], false);
  assert.deepEqual(out.uc[1].grades, ["PG", "9"]);
  assert.deepEqual(out.commonApp.honors, [{ id: "h2", title: "T", grades: ["12"], levels: ["national"] }]);
  assert.equal(out.version, 2);
});

test("upgrading is idempotent and never throws", () => {
  const once = upgradeActivities(oldData([oldActivity({ position: "Captain", timing: ["school", "break"], continueInCollege: true })], [oldUc({ category: "work", name: "Cashier", organization: "Cafe", hoursPerWeek: 10 }), oldUc({ id: "e", category: "edprep", name: "EAOP" })]));
  assert.deepEqual(upgradeActivities(once), once);
  assert.deepEqual(upgradeActivities(upgradeActivities(once)), once);
  for (const bad of [null, undefined, {}, [], "text", 7, { commonApp: null, uc: "x" }, { commonApp: { activities: [null, 3, "x"], honors: 5 }, uc: [null, []] }]) {
    const out = upgradeActivities(bad);
    assert.deepEqual(out, EMPTY_ACTIVITIES, JSON.stringify(bad));
  }
  assert.notEqual(upgradeActivities(null).commonApp.activities, EMPTY_ACTIVITIES.commonApp.activities); // a fresh object, not the shared constant
});

test("an entry with no usable id gets an id from its list and position, never a random one", () => {
  const raw = {
    commonApp: {
      activities: [oldActivity({ id: undefined }), null, oldActivity({ id: "" }), oldActivity({ id: 42 }), oldActivity({ id: "   " }), oldActivity({ id: "keep" })],
      honors: [{ title: "A" }, { id: 7, title: "B" }, { id: "h", title: "C" }],
    },
    uc: ["junk", oldUc({ id: undefined }), oldUc({ id: null })],
  };
  const out = upgradeActivities(raw);
  assert.deepEqual(out.commonApp.activities.map((a) => a.id), ["legacy-ca-0", "legacy-ca-2", "legacy-ca-3", "legacy-ca-4", "keep"]); // the index counts dropped entries
  assert.deepEqual(out.commonApp.honors.map((h) => h.id), ["legacy-honor-0", "legacy-honor-1", "h"]);
  assert.deepEqual(out.uc.map((e) => e.id), ["legacy-uc-1", "legacy-uc-2"]);
  assert.deepEqual(upgradeActivities(raw), out); // two calls, identical output
  assert.deepEqual(upgradeActivities(out), out);
});

test("an old organization on a non-work UC entry is kept in the note", () => {
  const e = upgradedUc({ category: "extracurricular", organization: "Chess Federation" });
  assert.equal(e.legacy, "From your earlier version: organization Chess Federation");
  assert.equal(upgradedUc({ category: "award", organization: "Math Society" }).legacy, "From your earlier version: organization Math Society");
  assert.equal(upgradedUc({ category: "volunteer", organization: "   " }).legacy, undefined);
  assert.equal(upgradedUc({ category: "volunteer", organization: "" }).legacy, undefined);
  // Joined with the other note for the same entry.
  const long = upgradedUc({ category: "edprep", name: "A Very Long Summer Program Name That Is Over Thirty", organization: "Local Org" });
  assert.equal(long.legacy, "From your earlier version: A Very Long Summer Program Name That Is Over Thirty; From your earlier version: organization Local Org");
  // A work entry's organization is its workplace, not a note.
  assert.equal(upgradedUc({ category: "work", name: "Cashier", organization: "Cafe", hoursPerWeek: null, weeksPerYear: null }).legacy, undefined);
});

test("only the portals' own keys count as grades, levels and award levels", () => {
  const a = upgradedCa({ grades: ["9", "13", "PG", 10, "constructor"] });
  assert.deepEqual(a.grades, ["9", "PG"]);
  const out = upgradeActivities(oldData([], [oldUc({ category: "award", awardLevel: "constructor" }), oldUc({ id: "v2", category: "award", awardLevel: "toString" })], [{ id: "h", title: "T", grades: ["x"], levels: ["national", "constructor", "toString", "bogus", "school"] }]));
  assert.deepEqual(out.commonApp.honors[0], { id: "h", title: "T", grades: [], levels: ["national", "school"] });
  assert.deepEqual(out.uc.map((e) => e.awardLevels), [[], []]);
  assert.deepEqual(upgradeActivities({ version: 2, commonApp: { activities: [], honors: [] }, uc: [{ id: "q", category: "award", awardLevels: ["school", "hasOwnProperty", "state"] }] }).uc[0].awardLevels, ["school", "state"]);
});

test("an unknown UC category, whitespace role, and decimal work hours convert as written", () => {
  assert.equal(upgradedUc({ category: "mystery" }).category, "extracurricular");
  const blankRole = upgradedCa({ position: "   " });
  assert.deepEqual([blankRole.leadership, blankRole.position], [null, "   "]);
  assert.equal(upgradedUc({ category: "work", name: "Barista", organization: "Cafe", hoursPerWeek: 7.5, weeksPerYear: 12 }).legacy, "From your earlier version: 7.5 hours/week, 12 weeks/year");
});

test("an old educational prep name is trimmed and measured the way UC counts", () => {
  const ed = (name: string) => upgradedUc({ category: "edprep", name });
  assert.deepEqual([ed("   ").program, ed("   ").name, ed("   ").legacy], [null, "", undefined]);
  const spaced = ed("  Local STEM camp  ");
  assert.deepEqual([spaced.program, spaced.name], ["18", "Local STEM camp"]);
  assert.equal(ed(`  ${"y".repeat(30)}  `).name, "y".repeat(30));
  const lines = `${"y".repeat(15)}\n${"z".repeat(14)}`; // 30 characters, but UC counts the line break as 2
  const over = ed(lines);
  assert.deepEqual([over.program, over.name, over.legacy], ["18", "", `From your earlier version: ${lines}`]);
});

const fixtureDir = new URL("./fixtures/", import.meta.url);
const fixture = (name: string): { student: string; activities: unknown }[] => JSON.parse(readFileSync(new URL(name, fixtureDir), "utf8"));

test("the v1 fixture upgrades to the v2 fixture exactly", () => {
  const before = fixture("activities-v1.json");
  const after = fixture("activities-v2.json");
  assert.equal(before.length, after.length);
  for (const [i, b] of before.entries()) {
    assert.equal(after[i].student, b.student);
    assert.deepEqual(upgradeActivities(b.activities), after[i].activities, b.student);
    assert.deepEqual(upgradeActivities(after[i].activities), after[i].activities, `${b.student} (already v2)`);
  }
});

test("the fixtures cover every old type and rule", () => {
  const before = fixture("activities-v1.json");
  const olds = before.flatMap((s) => ((s.activities as ReturnType<typeof oldData>).commonApp?.activities ?? []) as ReturnType<typeof oldActivity>[]).filter((a) => a && typeof a === "object");
  const oldTypes = new Set(OLD_TO_NEW_TYPES.map(([t]) => t));
  const types = new Set(olds.map((a) => a.type));
  for (const t of oldTypes) assert.ok(types.has(t), t);
  assert.ok(types.has("") && types.has("Quidditch")); // blank and unknown types pass through
  const timings = new Set(olds.map((a) => JSON.stringify([...(a.timing ?? [])].sort())));
  for (const t of ['["break","school"]', '["school"]', '["break"]', "[]"]) assert.ok(timings.has(t), t);
  assert.deepEqual(new Set(olds.map((a) => a.continueInCollege)), new Set([true, false, null]));
  assert.ok(olds.some((a) => a.position) && olds.some((a) => !a.position) && olds.some((a) => a.position === "   "));
  assert.ok(olds.some((a) => a.grades.some((g) => !["9", "10", "11", "12", "PG"].includes(g as string))));
  // Entries without a usable id: missing, blank, whitespace, numeric, null; and a null entry in a list.
  const ids = olds.filter((a) => a.id === undefined || typeof a.id !== "string" || !a.id.trim()).length;
  assert.ok(ids >= 4);
  assert.ok(olds.some((a) => typeof a.id === "number"));
  assert.ok(before.some((s) => ((s.activities as ReturnType<typeof oldData>).commonApp?.activities ?? []).includes(null as never)));
  const ucs = before.flatMap((s) => ((s.activities as ReturnType<typeof oldData>).uc ?? []) as ReturnType<typeof oldUc>[]).filter((e) => e && typeof e === "object");
  assert.ok(ucs.some((e) => e.awardLevel) && ucs.some((e) => e.category === "award" && !e.awardLevel));
  assert.ok(ucs.some((e) => e.category === "work"));
  assert.ok(ucs.some((e) => !["award", "edprep", "extracurricular", "coursework", "volunteer", "work"].includes(e.category))); // unknown category
  assert.ok(ucs.some((e) => e.category !== "work" && (e.organization ?? "").trim())); // organization on a non-work entry
  assert.ok(ucs.some((e) => e.category === "work" && e.hoursPerWeek === 7.5));
  assert.ok(ucs.some((e) => e.category === "edprep" && !(e.name ?? "").trim()) && ucs.some((e) => e.category === "edprep" && e.name !== (e.name ?? "").trim()));
  assert.ok(before.some((s) => Object.keys(s.activities as object).length === 0));
  const honors = before.flatMap((s) => (s.activities as ReturnType<typeof oldData>).commonApp?.honors ?? []) as { levels: string[] }[];
  assert.ok(honors.some((h) => h.levels.includes("state_regional")));
  assert.ok(honors.some((h) => h.levels.includes("constructor")));
});

test("already-copied items are not copied again", () => {
  const d = data();
  d.uc = ucDraftsFromCommonApp(d);
  assert.equal(ucDraftsFromCommonApp(d).length, 0);
  assert.equal(ucDraftsFromCommonApp(EMPTY_ACTIVITIES).length, 0);
});

test("move swaps neighbours and stops at the ends", () => {
  assert.deepEqual(move([1, 2, 3], 0, 1), [2, 1, 3]);
  assert.deepEqual(move([1, 2, 3], 0, -1), [1, 2, 3]);
  assert.deepEqual(move([1, 2, 3], 2, 1), [1, 2, 3]);
});

test("caVisibleQuestions follows the portal's order and show/hide rules", () => {
  const base = { ...newCaActivity(), type: "Robotics" };
  assert.deepEqual(caVisibleQuestions(base), ["type", "description", "organization", "leadership", "grades", "hoursPerWeek", "weeksPerYear", "continueInCollege"]);
  assert.deepEqual(caVisibleQuestions({ ...base, type: "" }).slice(0, 2), ["type", "description"]); // nothing chosen: no sport
  for (const type of CA_ATHLETIC_TYPES) assert.deepEqual(caVisibleQuestions({ ...base, type }).slice(0, 3), ["type", "sport", "description"]);
  assert.deepEqual(caVisibleQuestions({ ...base, leadership: true }).slice(2, 5), ["organization", "leadership", "position"]);
  assert.ok(!caVisibleQuestions({ ...base, leadership: false }).includes("position"));
  const g11 = caVisibleQuestions({ ...base, grades: ["11"] });
  assert.deepEqual(g11.slice(4, 6), ["grades", "timing"]);
  assert.ok(!g11.includes("afterStart"));
  const pg = caVisibleQuestions({ ...base, grades: ["PG"] });
  assert.deepEqual(pg.slice(4, 7), ["grades", "afterStart", "stillParticipating"]);
  assert.ok(!pg.includes("timing") && !pg.includes("afterEnd"));
  assert.ok(!caVisibleQuestions({ ...base, grades: ["PG"], stillParticipating: true }).includes("afterEnd"));
  assert.deepEqual(caVisibleQuestions({ ...base, grades: ["PG"], stillParticipating: false }).slice(4, 8), ["grades", "afterStart", "stillParticipating", "afterEnd"]);
  const all = caVisibleQuestions({ ...base, type: "Athletics (other)", leadership: true, grades: ["9", "PG"], stillParticipating: false });
  assert.deepEqual(all, ["type", "sport", "description", "organization", "leadership", "position", "grades", "timing", "afterStart", "stillParticipating", "afterEnd", "hoursPerWeek", "weeksPerYear", "continueInCollege"]);
});

test("draftIssues blocks an edit that would make the dates inconsistent, whichever date is moved", () => {
  const pg: CaActivity = { ...robotics(), grades: ["PG"], timing: null, afterStart: "2027-01", stillParticipating: false, afterEnd: "2027-06" };
  assert.deepEqual(caActivityIssues(pg), []);
  const startAfterEnd = draftIssues(pg, { afterStart: "2027-09" });
  assert.deepEqual(startAfterEnd.map((i) => [i.field, i.kind]), [["afterEnd", "invalid"]]); // the start edit breaks the end date
  const endBeforeStart = draftIssues(pg, { afterEnd: "2026-12" });
  assert.deepEqual(endBeforeStart.map((i) => [i.field, i.kind]), [["afterEnd", "invalid"]]);
  assert.deepEqual(draftIssues(pg, { afterStart: "2027-03" }), []); // valid moves
  assert.deepEqual(draftIssues(pg, { afterEnd: "2027-12" }), []);
  assert.equal(draftIssues(pg, { afterStart: "1900-01" })[0].field, "afterStart"); // out of the portal's year range
  assert.deepEqual(draftIssues({ ...pg, stillParticipating: true }, { afterStart: "2027-09" }), []); // no end date to conflict with
});

test("draftIssues ignores problems the activity already had on other fields", () => {
  const a = { ...robotics(), description: "x".repeat(200) };
  assert.deepEqual(draftIssues(a, { hoursPerWeek: 12 }), []);
  assert.deepEqual(draftIssues(a, { hoursPerWeek: 500 }).map((i) => i.field), ["hoursPerWeek"]);
  assert.deepEqual(draftIssues(a, { description: "y".repeat(151) }).map((i) => i.field), ["description"]); // an edit to the long field stays blocked
});

test("every Common App activity type has a translation key in both languages", () => {
  for (const type of CA_ACTIVITY_TYPES) {
    const key = CA_TYPE_KEYS[type];
    assert.ok(key, `no CA_TYPE_KEYS entry for "${type}"`);
    assert.ok(key in en && key in zhTW, `${key} missing from a dictionary`);
  }
  assert.deepEqual(Object.keys(CA_TYPE_KEYS).sort(), [...CA_ACTIVITY_TYPES].sort()); // no stale entries either
});

test("ucVisibleQuestions follows UC's questions per category", () => {
  const award = newUcEntry("award");
  assert.deepEqual(ucVisibleQuestions(award), ["name", "awardLevels", "awardType", "grades", "extra", "description"]);
  assert.deepEqual(ucVisibleQuestions({ ...award, grades: ["PG"] }), ["name", "awardLevels", "awardType", "grades", "extra", "description"]); // an award has no years/months
  const edprep = newUcEntry("edprep");
  assert.deepEqual(ucVisibleQuestions(edprep), ["program", "description", "grades", "hoursPerWeek", "weeksPerYear"]);
  assert.ok(!ucVisibleQuestions({ ...edprep, program: "6" }).includes("name")); // a listed program needs no name
  assert.deepEqual(ucVisibleQuestions({ ...edprep, program: "18" }).slice(0, 3), ["program", "name", "description"]);
  const hours = ["hoursPerWeek", "weeksPerYear"];
  assert.deepEqual(ucVisibleQuestions(newUcEntry("extracurricular")), ["name", "description", "grades", ...hours]);
  assert.deepEqual(ucVisibleQuestions(newUcEntry("coursework")), ["name", "description", "grades", ...hours]);
  assert.deepEqual(ucVisibleQuestions(newUcEntry("volunteer")), ["name", "extra", "description", "grades", ...hours]);
  for (const key of ["extracurricular", "edprep", "coursework", "volunteer"] as const) {
    const pg = ucVisibleQuestions({ ...newUcEntry(key), program: "6", grades: ["PG"] });
    assert.deepEqual(pg.slice(pg.indexOf("grades"), pg.indexOf("grades") + 3), ["grades", "afterYears", "afterMonths"], key);
    assert.ok(!ucVisibleQuestions({ ...newUcEntry(key), grades: ["12"] }).includes("afterYears"), key);
  }
});

test("ucVisibleQuestions for work: hours grid only once a grade is ticked, end date only on 'no'", () => {
  const work = newUcEntry("work");
  assert.deepEqual(ucVisibleQuestions(work), ["name", "extra", "jobTitle", "description", "grades", "stillWorking", "start"]);
  const g10 = ucVisibleQuestions({ ...work, grades: ["10"] });
  assert.deepEqual(g10, ["name", "extra", "jobTitle", "description", "grades", "workHours", "stillWorking", "start"]);
  assert.ok(!g10.includes("hoursPerWeek") && !g10.includes("weeksPerYear")); // work has no weeks per year
  assert.ok(!ucVisibleQuestions({ ...work, grades: ["10"], stillWorking: true }).includes("end"));
  assert.deepEqual(ucVisibleQuestions({ ...work, grades: ["10"], stillWorking: false }).slice(-3), ["stillWorking", "start", "end"]);
  assert.deepEqual(ucVisibleQuestions({ ...work, grades: ["PG"] }).slice(4, 8), ["grades", "afterYears", "afterMonths", "workHours"]);
});

test("ucVisibleQuestions agrees with ucEntryIssues: a hidden question is never flagged", () => {
  for (const make of Object.values(uc)) {
    const e = make();
    for (const variant of [e, { ...e, grades: [] }, { ...e, program: null }, { ...e, program: "18" }, { ...e, stillWorking: false, end: null }]) {
      const visible = new Set<string>(ucVisibleQuestions(variant));
      for (const i of ucEntryIssues(variant)) assert.ok(visible.has(i.field), `${variant.category}: ${i.field} is flagged but not shown`);
    }
  }
});

test("ucDraftIssues blocks an edit that would break the work dates, whichever date is moved", () => {
  const w: UcEntry = { ...uc.work(), stillWorking: false, start: "2026-01", end: "2026-06" };
  assert.deepEqual(ucEntryIssues(w), []);
  assert.deepEqual(ucDraftIssues(w, { start: "2026-09" }).map((i) => [i.field, i.kind]), [["end", "invalid"]]); // the start edit breaks the end date
  assert.deepEqual(ucDraftIssues(w, { end: "2025-12" }).map((i) => [i.field, i.kind]), [["end", "invalid"]]);
  assert.deepEqual(ucDraftIssues(w, { start: "2026-03" }), []);
  assert.deepEqual(ucDraftIssues(w, { end: "2027-12" }), []);
  assert.equal(ucDraftIssues(w, { start: "1900-01" })[0].field, "start");
  assert.deepEqual(ucDraftIssues({ ...w, stillWorking: true }, { start: "2026-09" }), []); // no end date to conflict with
});

test("ucDraftIssues blocks over-long text counted the UC way, and out-of-range numbers", () => {
  const e = uc.extracurricular();
  assert.deepEqual(ucDraftIssues(e, { description: "x".repeat(350) }), []);
  assert.deepEqual(ucDraftIssues(e, { description: "x".repeat(349) + "\n" }).map((i) => i.field), ["description"]);
  assert.deepEqual(ucDraftIssues(e, { name: "x".repeat(61) }).map((i) => i.field), ["name"]);
  assert.deepEqual(ucDraftIssues(e, { hoursPerWeek: 169 }).map((i) => i.field), ["hoursPerWeek"]);
  assert.deepEqual(ucDraftIssues(e, { hoursPerWeek: 1.5 }), []);
  assert.deepEqual(ucDraftIssues(uc.work(), { workHours: { "11": { schoolYear: 0, summer: null } } }).map((i) => i.field), ["workHours"]);
  assert.deepEqual(ucDraftIssues({ ...uc.edprep(), program: "18" }, { name: "x".repeat(31) }).map((i) => i.field), ["name"]);
  assert.deepEqual(ucDraftIssues({ ...uc.edprep(), program: "18" }, { name: "x".repeat(30) }), []);
});

test("ucDraftIssues ignores problems the entry already had on other fields", () => {
  const e = { ...uc.extracurricular(), description: "x".repeat(400) };
  assert.deepEqual(ucDraftIssues(e, { hoursPerWeek: 12 }), []);
  assert.deepEqual(ucDraftIssues(e, { hoursPerWeek: 500 }).map((i) => i.field), ["hoursPerWeek"]);
  assert.deepEqual(ucDraftIssues(e, { description: "y".repeat(351) }).map((i) => i.field), ["description"]);
});

test("a stale role is not copied to UC unless the student answered yes to the leadership question", () => {
  const act = (patch: Partial<CaActivity>) => ({
    ...EMPTY_ACTIVITIES,
    commonApp: { activities: [{ ...newCaActivity(), type: "Robotics", organization: "Robo Club", position: "Treasurer", description: "Built robots.", ...patch }], honors: [] },
  });
  for (const leadership of [false, null]) {
    const [d] = ucDraftsFromCommonApp(act({ leadership }));
    assert.equal(d.description, "Built robots.", String(leadership));
    assert.ok(!JSON.stringify(d).includes("Treasurer"), String(leadership));
  }
  assert.equal(ucDraftsFromCommonApp(act({ leadership: true }))[0].description, "Treasurer — Built robots.");
  assert.equal(ucDraftsFromCommonApp(act({ leadership: false, organization: "", description: "" })).length, 0); // only a stale role: nothing to copy
  assert.equal(ucDraftsFromCommonApp(act({ leadership: true, organization: "", description: "" }))[0].name, "Treasurer");
  assert.equal(ucDraftsFromCommonApp(act({ type: "Employment or work (paid)", leadership: false }))[0].jobTitle, "");
  assert.equal(ucDraftsFromCommonApp(act({ type: "Employment or work (paid)", leadership: true }))[0].jobTitle, "Treasurer");
});

test("a stale sport is not copied to UC", () => {
  const act = (type: string) => ({ ...EMPTY_ACTIVITIES, commonApp: { activities: [{ ...newCaActivity(), type, sport: "Soccer", organization: "Club", description: "Played." }], honors: [] } });
  for (const type of ["Robotics", "Athletics (other)"]) assert.ok(!JSON.stringify(ucDraftsFromCommonApp(act(type))).includes("Soccer"), type);
});
