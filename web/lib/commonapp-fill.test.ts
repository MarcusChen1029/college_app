import assert from "node:assert/strict";
import { test } from "node:test";
import { buildCgPlan, buildCurrentYearPlan, gradingScaleFor, matchOption, matchStem, rowsToAdd, schoolYearLabel } from "./commonapp-fill.ts";
import { emptyCourse, emptySchool, type Term, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States", ...o });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "Drama", academicYear: 2023, gradeLevel: 9, credit: 1, terms: [graded("S1", "A")], ...o });
const graded = (term: Term["term"], grade: string, extra: Partial<Term> = {}): Term => ({ term, grade, status: "graded", ...extra });

test("schoolYearLabel writes the two-digit end year", () => {
  assert.equal(schoolYearLabel(2023), "2023-24");
  assert.equal(schoolYearLabel(2099), "2099-00");
});

test("gradingScaleFor maps the tracker scale onto Common App's list", () => {
  assert.equal(gradingScaleFor("percent_100", null), "1-100");
  assert.equal(gradingScaleFor("letter_plus_minus", null), "A-F");
  assert.equal(gradingScaleFor("letter", null), "A-F");
  assert.equal(gradingScaleFor("gpa_decimal", 4), "0.0-4.0");
  assert.equal(gradingScaleFor("gpa_decimal", 5), "0.0-5.0");
  assert.equal(gradingScaleFor("gpa_decimal", 4.3), "Other");
  assert.equal(gradingScaleFor("gpa_decimal", null), "Other");
  assert.equal(gradingScaleFor("ib_7", null), "1-7");
  assert.equal(gradingScaleFor("other", 10), "1-10");
  assert.equal(gradingScaleFor("other", 11), "1-11");
  assert.equal(gradingScaleFor("other", 20), "1-20");
  assert.equal(gradingScaleFor("other", 15), "Other");
  assert.equal(gradingScaleFor("a_level", null), "Other");
  assert.equal(gradingScaleFor("pass_fail", null), "Other");
});

test("fills a graded 9th-grade semester course", () => {
  const name = "Kang Chiao International School - Linkou Campus";
  const plans = buildCgPlan(
    [school({ name })],
    [course({ id: "drama", terms: [graded("S1", "88"), graded("S2", "93")], finalGrade: "91", scale: "percent_100", level: "regular", subject: "other", credit: 4, creditUnit: "carnegie" })],
  );
  assert.equal(plans.length, 1);
  const p = plans[0]!;
  assert.equal(p.grade, "9");
  assert.equal(p.schoolName, name);
  assert.equal(p.schoolYear, "2023-24");
  assert.equal(p.scale, "1-100");
  assert.equal(p.scheduleStem, "semester");
  assert.deepEqual(p.rows[0], {
    trackerId: "drama", name: "Drama", subject: "Other/Elective", level: "Regular/Standard",
    grades: { "1": "88", "2": "93", final: "91" }, credit: "4", creditNA: false,
  });
});

test("maps term codes onto the four term columns and the final column", () => {
  // One term system per grade (a grade's dialog has one Schedule), so each system gets its own grade here.
  const plans = buildCgPlan(
    [school()],
    [
      course({ id: "q", gradeLevel: 9, period: "quarter", terms: [graded("Q1", "A"), graded("Q2", "B"), graded("Q3", "C"), graded("Q4", "D")] }),
      course({ id: "t", gradeLevel: 10, name: "Art", period: "trimester", terms: [graded("T1", "A"), graded("T2", "B"), graded("T3", "C")] }),
      course({ id: "f", gradeLevel: 11, name: "Band", period: "full_year", terms: [graded("FY", "A-")] }),
    ],
  );
  const rowOf = (id: string) => plans.flatMap((p) => p.rows).find((r) => r.trackerId === id)!;
  assert.deepEqual(rowOf("q").grades, { "1": "A", "2": "B", "3": "C", "4": "D" });
  assert.deepEqual(rowOf("t").grades, { "1": "A", "2": "B", "3": "C" });
  assert.deepEqual(rowOf("f").grades, { final: "A-" });
  assert.deepEqual(plans.map((p) => p.scheduleStem), ["quarter", "trimester", "year"]);
  assert.deepEqual(plans.flatMap((p) => p.skipped), []);
});

test("only graded terms with a grade are filled", () => {
  const plans = buildCgPlan([school()], [course({ terms: [graded("S1", "B"), { term: "S2", grade: "", status: "in_progress" }, graded("FY", " ")] })]);
  assert.deepEqual(plans[0]!.rows[0]!.grades, { "1": "B" });
});

test("uses the printed grade, not the weighted one", () => {
  const plans = buildCgPlan([school()], [course({ terms: [{ term: "S1", grade: "B+", gradeWeighted: "A", status: "graded" }] })]);
  assert.equal(plans[0]!.rows[0]!.grades["1"], "B+");
});

test("in-progress courses go to Current Year, not C&G", () => {
  const c = course({ id: "ip", name: "AP Physics", gradeLevel: 12, academicYear: 2026, terms: [{ term: "S1", grade: "", status: "in_progress" }] });
  const plans = buildCgPlan([school()], [c]);
  const p = plans.find((x) => x.grade === "12")!;
  assert.equal(p.rows.length, 0);
  assert.deepEqual(p.skipped, [{ where: "12", course: "AP Physics", field: "course", reason: "in progress: goes to Current Year Courses" }]);
});

test("an in-progress course does not displace the graded ones in the same grade", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "a", name: "Done", gradeLevel: 12 }),
    course({ id: "b", name: "Now", gradeLevel: 12, terms: [{ term: "S1", grade: "", status: "in_progress" }] }),
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.rows.map((r) => r.name), ["Done"]);
  assert.equal(plans[0]!.skipped.length, 1);
  assert.equal(plans[0]!.skipped[0]!.reason, "in progress: goes to Current Year Courses");
});

test("a final grade alone is enough to be entered", () => {
  const plans = buildCgPlan([school()], [course({ terms: [], finalGrade: "92" })]);
  assert.deepEqual(plans[0]!.rows[0]!.grades, { final: "92" });
});

test("college schools are left out", () => {
  const plans = buildCgPlan(
    [school({ id: "hs" }), school({ id: "col", name: "Community College", kind: "college" })],
    [course({ id: "x", schoolId: "col", name: "Calc at CC" })],
  );
  assert.equal(plans.length, 0);
});

test("a college school's course does not show up in a high-school plan's skipped list", () => {
  const plans = buildCgPlan(
    [school({ id: "hs" }), school({ id: "col", name: "Community College", kind: "college" })],
    [course({ id: "a", schoolId: "hs" }), course({ id: "x", schoolId: "col", name: "Calc at CC" })],
  );
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.skipped, []);
});

test("no grade level goes to Other courses", () => {
  const plans = buildCgPlan([school()], [course({ gradeLevel: null }), course({ id: "d", gradeLevel: 8 })]);
  assert.equal(plans.length, 1);
  assert.equal(plans[0]!.grade, "other");
  assert.equal(plans[0]!.rows.length, 2);
});

test("credit: not listed ticks N/A; a missing credit is blank and reported", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "na", name: "NA course", credit: null, creditUnit: "not_listed" }),
    course({ id: "none", name: "No credit", credit: null, creditUnit: "carnegie" }),
    course({ id: "half", name: "Half", credit: 0.5 }),
  ]);
  const rows = plans[0]!.rows;
  const row = (id: string) => rows.find((r) => r.trackerId === id)!;
  assert.equal(row("na").creditNA, true);
  assert.equal(row("na").credit, null);
  assert.equal(row("none").creditNA, false);
  assert.equal(row("none").credit, null);
  assert.equal(row("half").credit, "0.5");
  assert.deepEqual(plans[0]!.skipped, [{ where: "9", course: "No credit", field: "credit", reason: "no credit in tracker" }]);
});

test("second school in the same grade is reported, not filled", () => {
  const plans = buildCgPlan(
    [school({ id: "a", name: "School A" }), school({ id: "b", name: "School B" })],
    [
      course({ id: "1", schoolId: "a", name: "One" }),
      course({ id: "2", schoolId: "a", name: "Two" }),
      course({ id: "3", schoolId: "a", name: "Three" }),
      course({ id: "4", schoolId: "b", name: "Four" }),
    ],
  );
  const p = plans[0]!;
  assert.equal(p.schoolName, "School A");
  assert.equal(p.rows.length, 3);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0]!.course, "Four");
  assert.ok(p.skipped[0]!.reason.startsWith("another school (School B)"), p.skipped[0]!.reason);
});

test("a second school year in the same grade is reported, not filled", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "One", academicYear: 2023 }),
    course({ id: "2", name: "Two", academicYear: 2023 }),
    course({ id: "3", name: "Summer", academicYear: 2024, isSummer: true }),
  ]);
  const p = plans[0]!;
  assert.equal(p.schoolYear, "2023-24");
  assert.equal(p.rows.length, 2);
  assert.equal(p.skipped.length, 1);
  assert.equal(p.skipped[0]!.course, "Summer");
  assert.ok(p.skipped[0]!.reason.startsWith("another school year (2024-25)"), p.skipped[0]!.reason);
});

test("per-course override wins", () => {
  const plans = buildCgPlan([school()], [course({ overrides: { common_app: { subject: "Religion" } } })]);
  assert.equal(plans[0]!.rows[0]!.subject, "Religion");
});

test("subject and level come from the Common App map", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "n", name: "Club", level: "none" }),
    course({ id: "m", name: "Stats", subject: "mathematics", subSubject: "statistics", level: "ap" }),
  ]);
  const row = (id: string) => plans[0]!.rows.find((r) => r.trackerId === id)!;
  assert.equal(row("n").level, "N/A");
  assert.equal(row("m").subject, "Math (Other)");
  assert.equal(row("m").level, "Advanced Placement (AP)");
});

test("dual-enrollment courses are entered with level Dual Enrollment", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "a", name: "College Algebra", isCollege: true, level: "regular" }),
    course({ id: "b", name: "College Bio", isCollege: true, level: "ap" }),
    course({ id: "c", name: "Dual by level", level: "dual_enrollment" }),
    course({ id: "d", name: "Plain", level: "regular" }),
  ]);
  const level = (id: string) => plans[0]!.rows.find((r) => r.trackerId === id)!.level;
  assert.equal(level("a"), "Dual Enrollment");
  assert.equal(level("b"), "Dual Enrollment");
  assert.equal(level("c"), "Dual Enrollment");
  assert.equal(level("d"), "Regular/Standard");
});

test("a student's level override beats the dual-enrollment rule", () => {
  const plans = buildCgPlan([school()], [course({ isCollege: true, level: "regular", overrides: { common_app: { level: "Honors" } } })]);
  assert.equal(plans[0]!.rows[0]!.level, "Honors");
});

test("plans come in order 9, 10, 11, 12, other and only for grades with courses", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "o", gradeLevel: null }),
    course({ id: "12", gradeLevel: 12 }),
    course({ id: "9", gradeLevel: 9 }),
    course({ id: "11", gradeLevel: 11 }),
  ]);
  assert.deepEqual(plans.map((p) => p.grade), ["9", "11", "12", "other"]);
});

test("mixed scales: the grade uses the most common scale; a course on another scale gets its row but no grades", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "Math", scale: "percent_100", terms: [graded("S1", "90"), graded("S2", "92")] }),
    course({ id: "2", name: "Physics", scale: "percent_100", terms: [graded("S1", "85"), graded("S2", "88")] }),
    course({ id: "3", name: "IB Biology HL", scale: "ib_7", scaleMax: 7, level: "regular", subject: "other", terms: [graded("S1", "6"), graded("S2", "7")], finalGrade: "7" }),
  ]);
  const p = plans[0]!;
  assert.equal(p.scale, "1-100");
  const ib = p.rows.find((r) => r.trackerId === "3")!;
  // Never 6/100 and 7/100: an IB grade typed against the 1-100 list.
  assert.deepEqual(ib, { trackerId: "3", name: "IB Biology HL", subject: "Other/Elective", level: "Regular/Standard", grades: {}, credit: "1", creditNA: false });
  assert.deepEqual(p.skipped.filter((s) => s.course === "IB Biology HL"), [
    { where: "9", course: "IB Biology HL", field: "grades", reason: "grades are on scale 1-7; this grade uses 1-100 on Common App: enter them by hand" },
  ]);
  // Same-scale rows are untouched.
  assert.deepEqual(p.rows.find((r) => r.trackerId === "1")!.grades, { "1": "90", "2": "92" });
  assert.deepEqual(p.rows.find((r) => r.trackerId === "2")!.grades, { "1": "85", "2": "88" });
  assert.ok(!p.skipped.some((s) => s.course === "Math" || s.course === "Physics"), JSON.stringify(p.skipped));
});

test("mixed scales: a 0.0-5.0 course in a 0.0-4.0 grade gets no grades", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "a", name: "History", scale: "gpa_decimal", scaleMax: 4, terms: [graded("S1", "3.7")] }),
    course({ id: "b", name: "English", scale: "gpa_decimal", scaleMax: 4, terms: [graded("S1", "3.3")] }),
    course({ id: "c", name: "AP Chem", scale: "gpa_decimal", scaleMax: 5, terms: [graded("S1", "4.7")], finalGrade: "4.7" }),
  ]);
  const p = plans[0]!;
  assert.equal(p.scale, "0.0-4.0");
  assert.deepEqual(p.rows.find((r) => r.trackerId === "c")!.grades, {});
  assert.deepEqual(p.rows.find((r) => r.trackerId === "a")!.grades, { "1": "3.7" });
  assert.deepEqual(p.skipped, [{ where: "9", course: "AP Chem", field: "grades", reason: "grades are on scale 0.0-5.0; this grade uses 0.0-4.0 on Common App: enter them by hand" }]);
});

test("a course on another term system keeps only its final grade; its term grades are reported, never moved across", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "Math", period: "semester", terms: [graded("S1", "A"), graded("S2", "B")] }),
    course({ id: "2", name: "Science", period: "semester", terms: [graded("S1", "B")] }),
    course({ id: "3", name: "Health", period: "quarter", terms: [graded("Q1", "A"), graded("Q2", "B")], finalGrade: "A" }),
    course({ id: "4", name: "Lab", period: "quarter", terms: [graded("Q1", "A")] }),
  ]);
  const p = plans[0]!;
  assert.equal(p.scheduleStem, "semester");
  assert.deepEqual(p.rows.find((r) => r.trackerId === "3")!.grades, { final: "A" });
  // Q1 is not Semester 1: with no final grade the row has no grades at all.
  assert.deepEqual(p.rows.find((r) => r.trackerId === "4")!.grades, {});
  assert.deepEqual(p.rows.find((r) => r.trackerId === "1")!.grades, { "1": "A", "2": "B" });
  const reason = (term: string) => `the course is on a quarter schedule; this grade uses the semester schedule on Common App, which has no ${term} column: enter it by hand`;
  assert.deepEqual(p.skipped, [
    { where: "9", course: "Health", field: "Q1 grade", reason: reason("Q1") },
    { where: "9", course: "Health", field: "Q2 grade", reason: reason("Q2") },
    { where: "9", course: "Lab", field: "Q1 grade", reason: reason("Q1") },
  ]);
});

test("a full-year course in a semester grade keeps its final grade with nothing reported", () => {
  const plans = buildCgPlan([school()], [
    course({ id: "1", name: "Math", period: "semester" }),
    course({ id: "2", name: "Band", period: "full_year", terms: [graded("FY", "A-")] }),
  ]);
  assert.deepEqual(plans[0]!.rows.find((r) => r.trackerId === "2")!.grades, { final: "A-" });
  assert.deepEqual(plans[0]!.skipped, []);
});

test("the review repro: two 1-100 courses, an IB course and a quarter course in one semester grade", () => {
  const p = buildCgPlan([school()], [
    course({ id: "1", name: "Math", scale: "percent_100", period: "semester", gradeLevel: 11, terms: [graded("S1", "90"), graded("S2", "92")] }),
    course({ id: "2", name: "Physics", scale: "percent_100", period: "semester", gradeLevel: 11, terms: [graded("S1", "85"), graded("S2", "88")] }),
    course({ id: "3", name: "IB Biology HL", scale: "ib_7", scaleMax: 7, period: "semester", gradeLevel: 11, terms: [graded("S1", "6"), graded("S2", "7")] }),
    course({ id: "4", name: "Health", scale: "percent_100", period: "quarter", gradeLevel: 11, terms: [graded("Q1", "95")] }),
  ])[0]!;
  assert.equal(p.scale, "1-100");
  assert.equal(p.scheduleStem, "semester");
  assert.deepEqual(p.rows.map((r) => [r.name, r.grades]), [
    ["Math", { "1": "90", "2": "92" }],
    ["Physics", { "1": "85", "2": "88" }],
    ["IB Biology HL", {}],
    ["Health", {}],
  ]);
  assert.deepEqual(p.skipped.map((s) => `${s.course}/${s.field}`), ["IB Biology HL/grades", "Health/Q1 grade"]);
});

test("Common App's own rule warnings are carried into the plan", () => {
  const plans = buildCgPlan([school()], [course({ name: "Chem", terms: [], finalGrade: "90" })]);
  assert.ok(plans[0]!.warnings.some((w) => w.includes("Chem") && w.includes("term grades")), plans[0]!.warnings.join(" | "));
});

test("matchOption is an exact match after trimming, collapsing spaces and ignoring case", () => {
  assert.equal(matchOption(["A-", "A", "B+"], " a- "), "A-");
  assert.equal(matchOption(["105", "100"], "100.0"), null);
  assert.equal(matchOption(["Pass - (Pass/Fail)"], "P"), null);
  assert.equal(matchOption(["Math (Other)"], "math  (other)"), "Math (Other)");
});

test("matchStem picks the first option that starts with the stem", () => {
  // The Current Year radios read live (2026-10-26): Semester, Trimester, Quarter, Yearly.
  const options = ["Semester", "Trimester", "Quarter", "Yearly"];
  assert.equal(matchStem(options, "quarter"), "Quarter");
  assert.equal(matchStem(options, "year"), "Yearly");
  assert.equal(matchStem(options, "semester"), "Semester");
  // The C&G dialog's Schedule select read live (2026-10-26): "Other" is a fifth option that no stem may pick.
  const dialog = ["Semesters", "Trimesters", "Quarters", "Yearly", "Other"];
  assert.deepEqual((["semester", "trimester", "quarter", "year"] as const).map((s) => matchStem(dialog, s)), ["Semesters", "Trimesters", "Quarters", "Yearly"]);
  assert.equal(matchStem(["Semester", "Quarter"], "trimester"), null);
});

test("rowsToAdd keeps only rows whose name is not already there, counting duplicates", () => {
  const rows = [{ name: "PE" }, { name: "PE" }, { name: "Math" }];
  assert.deepEqual(rowsToAdd(rows, ["pe "]), [{ name: "PE" }, { name: "Math" }]);
  assert.deepEqual(rowsToAdd(rows, []), rows);
  assert.deepEqual(rowsToAdd(rows, ["PE", "pe", "MATH"]), []);
});

const ip = (term: Term["term"]): Term => ({ term, grade: "", status: "in_progress" });
const planned = (term: Term["term"]): Term => ({ term, grade: "", status: "planned" });

test("current year plan: the most recent year's courses with their schedule", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "old", name: "Old", academicYear: 2025 }),
    course({ id: "a", name: "AP Physics", academicYear: 2026, period: "semester", subject: "science", level: "ap", terms: [ip("S1")] }),
    course({ id: "b", name: "Art", academicYear: 2026, period: "full_year", terms: [planned("FY")] }),
  ])!;
  assert.deepEqual(plan.rows.map((r) => [r.trackerId, r.schedule]), [["a", "First Semester"], ["b", "Full Year"]]);
  assert.equal(plan.rows[0]!.subject, "Science (Other)");
  assert.equal(plan.rows[0]!.level, "Advanced Placement (AP)");
  assert.deepEqual(plan.skipped, []);
});

test("current year plan: when every course is graded the most recent year is still used", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "old", name: "Old", academicYear: 2025 }),
    course({ id: "a", name: "A", academicYear: 2026 }),
    course({ id: "b", name: "B", academicYear: 2026 }),
  ])!;
  assert.deepEqual(plan.rows.map((r) => r.trackerId), ["a", "b"]);
});

test("current year plan: schedule from which terms the course has", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "s2", name: "S2 only", academicYear: 2026, terms: [ip("S2")] }),
    course({ id: "both", name: "Both", academicYear: 2026, terms: [ip("S1"), planned("S2")] }),
    course({ id: "fy", name: "FY term", academicYear: 2026, terms: [{ term: "FY", grade: "A", status: "graded" }] }),
    course({ id: "q4", name: "All quarters", academicYear: 2026, period: "quarter", terms: [ip("Q1"), planned("Q2"), planned("Q3"), planned("Q4")] }),
  ])!;
  const sched = (id: string) => plan.rows.find((r) => r.trackerId === id)!.schedule;
  assert.equal(sched("s2"), "Second Semester");
  assert.equal(sched("both"), "Full Year");
  assert.equal(sched("fy"), "Full Year");
  assert.equal(sched("q4"), "Full Year");
});

test("current year plan: single trimester/quarter terms use Common App's wording (read live 2026-10-26)", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "t", name: "Tri", academicYear: 2026, period: "trimester", terms: [ip("T2")] }),
    course({ id: "q", name: "Qtr", academicYear: 2026, period: "quarter", terms: [ip("Q3")] }),
    course({ id: "q4", name: "Qtr4", academicYear: 2026, period: "quarter", terms: [ip("Q4")] }),
  ])!;
  assert.deepEqual(plan.rows.map((r) => r.schedule), ["Second Trimester", "Third Quarter", "Fourth Quarter"]);
  assert.deepEqual(plan.skipped, []);
});

test("current year plan: some but not all terms of a trimester/quarter year cannot be one option", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "q", name: "Qtr", academicYear: 2026, period: "quarter", terms: [ip("Q1"), planned("Q2")] }),
  ])!;
  assert.deepEqual(plan.rows.map((r) => r.schedule), [null]);
  assert.equal(plan.skipped.length, 1);
  assert.equal(plan.skipped[0]!.field, "schedule");
});

test("current year plan: the scheduling system is the most common period; full year means year", () => {
  const sem = buildCurrentYearPlan([school()], [
    course({ id: "1", name: "One", academicYear: 2026, period: "semester", terms: [ip("S1")] }),
    course({ id: "2", name: "Two", academicYear: 2026, period: "semester", terms: [ip("S1")] }),
    course({ id: "3", name: "Three", academicYear: 2026, period: "full_year", terms: [planned("FY")] }),
  ])!;
  assert.equal(sem.scheduleStem, "semester");
  const year = buildCurrentYearPlan([school()], [course({ academicYear: 2026, period: "full_year", terms: [planned("FY")] })])!;
  assert.equal(year.scheduleStem, "year");
});

test("current year plan: college schools are left out; no high-school courses means no plan", () => {
  const schools = [school({ id: "hs" }), school({ id: "col", name: "CC", kind: "college" })];
  assert.equal(buildCurrentYearPlan(schools, [course({ schoolId: "col", academicYear: 2026 })]), null);
  assert.equal(buildCurrentYearPlan(schools, []), null);
  const plan = buildCurrentYearPlan(schools, [course({ id: "hs1", schoolId: "hs", academicYear: 2025 }), course({ id: "cc", schoolId: "col", academicYear: 2026 })])!;
  assert.deepEqual(plan.rows.map((r) => r.trackerId), ["hs1"]);
});

test("current year plan: dual enrollment level and subject override apply", () => {
  const plan = buildCurrentYearPlan([school()], [
    course({ id: "d", name: "College Algebra", academicYear: 2026, isCollege: true, level: "regular", terms: [ip("S1")] }),
    course({ id: "o", name: "Override", academicYear: 2026, overrides: { common_app: { subject: "Religion" } }, terms: [ip("S1")] }),
  ])!;
  assert.equal(plan.rows[0]!.level, "Dual Enrollment");
  assert.equal(plan.rows[1]!.subject, "Religion");
});
