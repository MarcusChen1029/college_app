import assert from "node:assert/strict";
import { test } from "node:test";
import { buildImportPlan, buildPrompt, parseImportText, planMcpAdd, transcriptFormatText, TRANSCRIPT_FORMAT_VERSION, type ImportPlan } from "./transcript-import.ts";
import { emptySchool, GRADE_SCALES, LEVELS, LIMITS, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const none = { schools: [] as TranscriptSchool[], courses: [] as TranscriptCourse[] };

type Fixture = { version: string; schools: { name: string; courses: Record<string, unknown>[]; [k: string]: unknown }[] };
const fixture = (): Fixture => ({
  version: TRANSCRIPT_FORMAT_VERSION,
  schools: [
    {
      name: "Taipei First Girls' High School",
      country: "Taiwan",
      kind: "high_school",
      curriculum: "other",
      defaultScale: "percent_100",
      defaultPeriod: "semester",
      courses: [
        {
          academicYear: 2024, gradeLevel: 10, name: "數學 (Mathematics)", subject: "mathematics", subSubject: "algebra_2", level: "honors", credit: 2, creditUnit: "not_listed",
          terms: [{ term: "S1", grade: "92", status: "graded" }, { term: "S2", grade: "88", status: "graded" }],
        },
      ],
    },
    {
      name: "IB World School",
      curriculum: "ib",
      defaultScale: "ib_7",
      defaultPeriod: "full_year",
      courses: [{ academicYear: 2025, gradeLevel: 11, name: "Biology HL", period: "full_year", subject: "science", subSubject: "biology", level: "ib_hl", credit: 1, terms: [{ term: "FY", grade: "6", status: "graded" }] }],
    },
    {
      name: "Cambridge Prep",
      curriculum: "a_level",
      defaultScale: "a_level",
      courses: [{ academicYear: 2025, name: "Mathematics (A-level)", subject: "mathematics", level: "a_level", period: "full_year", finalGrade: "A*" }],
    },
  ],
});

/** What the store would hold after saving a plan, so a second paste can be planned against it. */
function saved(plan: ImportPlan): { schools: TranscriptSchool[]; courses: TranscriptCourse[] } {
  const schools = plan.schools.map((s, i) => ({ id: `s${i}`, createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), ...(s.input ?? {}), name: s.name }) as TranscriptSchool);
  const courses = plan.rows.flatMap((r, i) => {
    if (!r.input) return [];
    const school = schools.find((s) => s.name === r.schoolName)!;
    return [{ id: `c${i}`, createdAt: "2026-10-01T00:00:00Z", ...r.input, schoolId: school.id } as TranscriptCourse];
  });
  return { schools, courses };
}

test("parseImportText strips code fences and surrounding prose", () => {
  const body = JSON.stringify(fixture());
  const fenced = parseImportText("Here you go:\n```json\n" + body + "\n```\nHope that helps!");
  assert.equal(fenced.ok, true);
  assert.deepEqual(fenced.ok && (fenced.data as { version: string }).version, TRANSCRIPT_FORMAT_VERSION);
  assert.equal(parseImportText(body).ok, true);
  assert.equal(parseImportText("not json at all").ok, false);
  assert.equal(parseImportText("").ok, false);
  assert.equal(parseImportText("{ broken: ").ok, false);
});

test("buildPrompt carries the version, every level and the as-printed rule", () => {
  const p = buildPrompt();
  assert.ok(p.includes(TRANSCRIPT_FORMAT_VERSION));
  for (const l of LEVELS) assert.ok(p.includes(l), l);
  for (const s of GRADE_SCALES) assert.ok(p.includes(s), s);
  assert.ok(p.includes("exactly as printed"));
  assert.ok(transcriptFormatText().includes("gradeWeighted"));
});

test("a valid fixture (percent, IB 7-point and A-level schools) plans with no errors", () => {
  const plan = buildImportPlan(fixture(), none, "ai_import");
  assert.equal(plan.error, null);
  assert.equal(plan.schools.length, 3);
  assert.ok(plan.schools.every((s) => s.errors.length === 0 && s.existingId === null));
  assert.equal(plan.rows.length, 3);
  assert.ok(plan.rows.every((r) => r.errors.length === 0 && r.input && r.duplicateOf === null), JSON.stringify(plan.rows.map((r) => r.errors)));
  assert.equal(plan.rows[0].input!.scale, "percent_100"); // taken from the school's default
  assert.equal(plan.rows[0].input!.source, "ai_import");
});

test("an unknown level and a missing name only break their own rows", () => {
  const data = fixture();
  data.schools[0].courses.push({ academicYear: 2024, name: "Chemistry", level: "super_honors" } as never, { academicYear: 2024, name: "  " } as never);
  const plan = buildImportPlan(data, none, "ai_import");
  const bad = plan.rows.filter((r) => r.errors.length);
  assert.equal(bad.length, 2);
  assert.ok(bad.every((r) => r.input === null));
  assert.ok(bad[0].errors.some((e) => /level/i.test(e)));
  assert.equal(plan.rows.filter((r) => r.input).length, 3);
});

test("the same JSON planned against its own result marks every row as a duplicate", () => {
  const first = buildImportPlan(fixture(), none, "ai_import");
  const second = buildImportPlan(fixture(), saved(first), "ai_import");
  assert.equal(second.rows.length, 3);
  assert.ok(second.rows.every((r) => r.duplicateOf !== null));
  assert.ok(second.schools.every((s) => s.existingId !== null));
});

test("a repeated course inside one paste is flagged as a duplicate of the earlier row", () => {
  const data = fixture();
  data.schools[0].courses.push({ ...data.schools[0].courses[0] });
  const plan = buildImportPlan(data, none, "ai_import");
  assert.equal(plan.rows[0].duplicateOf, null);
  assert.notEqual(plan.rows[1].duplicateOf, null);
});

test("CJK names are accepted up to the limit and rejected past it", () => {
  const data = fixture();
  data.schools[0].courses = [
    { academicYear: 2024, name: "微".repeat(LIMITS.courseName) } as never,
    { academicYear: 2024, name: "積".repeat(LIMITS.courseName + 1) } as never,
  ];
  const plan = buildImportPlan(data, none, "ai_import");
  assert.equal(plan.rows[0].errors.length, 0);
  assert.equal(plan.rows[1].errors.length > 0, true);
});

test("data that is not a transcript gives a plan error, not an exception", () => {
  assert.notEqual(buildImportPlan({ hello: "world" }, none, "ai_import").error, null);
  assert.notEqual(buildImportPlan(null, none, "ai_import").error, null);
  assert.notEqual(buildImportPlan({ schools: "nope" }, none, "ai_import").error, null);
});

test("planMcpAdd accepts valid rows, rejects bad ones by index and reports a new school", () => {
  const r = planMcpAdd(
    { school: { name: "Lincoln High" }, courses: [{ academicYear: 2025, name: "Biology" }, { academicYear: 2025, name: "Chem", level: "nope" }, { academicYear: 2025, name: "Art" }] },
    none,
  );
  assert.equal(r.newSchool?.name, "Lincoln High");
  assert.equal(r.schoolId, null);
  assert.equal(r.accepted.length, 2);
  assert.ok(r.accepted.every((c) => c.source === "mcp"));
  assert.deepEqual(r.rejected.map((x) => x.index), [1]);
  assert.equal(r.duplicates, 0);
});

test("planMcpAdd reuses a known school and skips duplicates", () => {
  const first = planMcpAdd({ school: { name: "Lincoln High" }, courses: [{ academicYear: 2025, name: "Biology" }] }, none);
  const school = { id: "s1", createdAt: "x", ...emptySchool(), ...first.newSchool!, name: "Lincoln High" } as TranscriptSchool;
  const course = { id: "c1", createdAt: "x", ...first.accepted[0], schoolId: "s1" } as TranscriptCourse;
  const again = planMcpAdd({ school: { name: "lincoln high" }, courses: [{ academicYear: 2025, name: "BIOLOGY" }, { academicYear: 2025, name: "Physics" }] }, { schools: [school], courses: [course] });
  assert.equal(again.newSchool, null);
  assert.equal(again.schoolId, "s1");
  assert.equal(again.duplicates, 1);
  assert.equal(again.accepted.length, 1);
  assert.equal(again.accepted[0].schoolId, "s1");
});

test("planMcpAdd rejects every course when the school itself is invalid", () => {
  const r = planMcpAdd({ school: { name: "  " }, courses: [{ academicYear: 2025, name: "Biology" }] }, none);
  assert.ok(r.schoolErrors.length > 0);
  assert.equal(r.accepted.length, 0);
});
