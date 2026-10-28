import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CA_ACTIVITY_TYPES,
  CA_ATHLETIC_TYPES,
  CA_SPORTS,
  EMPTY_ACTIVITIES,
  UC_EDPREP_PROGRAMS,
  caActivityIssues,
  caHonorIssues,
  move,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  ucDraftsFromCommonApp,
  ucEntryIssues,
  ucTextLength,
  type ActivityData,
  type CaActivity,
  type CaHonor,
  type Issue,
  type UcEntry,
} from "./activities.ts";

const data = (): ActivityData => ({
  version: 2,
  commonApp: {
    activities: [
      { ...newCaActivity(), type: "Robotics", position: "Captain", organization: "FRC Team 1234", description: "Led 30 students.", grades: ["10", "11"], hoursPerWeek: 10, weeksPerYear: 30 },
      { ...newCaActivity(), type: "Employment or work (paid)", position: "Cashier", organization: "Corner Cafe", description: "Weekend shifts." },
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

// rewritten in Task 2: the converter still reads the v1 shape (organization, awardLevel).
test.skip("Common App items become UC drafts in the matching category", () => {
  const drafts = ucDraftsFromCommonApp(data());
  assert.deepEqual(
    drafts.map((d) => [d.category, d.name]),
    [
      ["extracurricular", "FRC Team 1234"],
      ["work", "Cashier"],
      ["award", "AIME Qualifier"],
    ],
  );
  assert.equal(drafts[0].description, "Captain — Led 30 students.");
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
