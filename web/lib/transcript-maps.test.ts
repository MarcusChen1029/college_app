import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCourse, SYSTEM_IDS, SYSTEMS, type MappedCourse } from "./transcript-maps.ts";
import { emptyCourse, emptySchool, LEVELS, PERIOD_TYPES, SUB_SUBJECTS, SUBJECTS, type TranscriptCourse, type TranscriptSchool } from "./transcript.ts";

const school = (o: Partial<TranscriptSchool> = {}): TranscriptSchool => ({ id: "s", createdAt: "2026-10-01T00:00:00Z", ...emptySchool(), name: "Lincoln High", country: "United States", ...o });
const course = (o: Partial<TranscriptCourse> = {}): TranscriptCourse => ({ id: "c", createdAt: "2026-10-01T00:00:00Z", ...emptyCourse("s"), name: "AP Calculus BC", academicYear: 2025, credit: 1, ...o });
const field = (m: MappedCourse, key: string) => m.fields.find((f) => f.key === key)!;

test("every system has an entry for every level, subject and period", () => {
  assert.ok(SYSTEM_IDS.length >= 2);
  for (const id of SYSTEM_IDS) {
    const map = SYSTEMS[id]!;
    for (const l of LEVELS) assert.ok(["verified", "unverified", "none"].includes(map.level[l]?.status), `${id} level ${l}`);
    for (const s of SUBJECTS) assert.ok(["verified", "unverified", "none"].includes(map.subject[s]?.status), `${id} subject ${s}`);
    for (const p of PERIOD_TYPES) assert.ok(["verified", "unverified", "none"].includes(map.period[p]?.status), `${id} period ${p}`);
  }
});

test("unverified entries never claim verified", () => {
  for (const id of SYSTEM_IDS) {
    const map = SYSTEMS[id]!;
    const all = [...Object.values(map.level), ...Object.values(map.subject), ...Object.values(map.period)];
    for (const e of all) if (e.value === null) assert.notEqual(e.status, "verified", id);
  }
});

test("Common App maps AP, honors and quarter exactly", () => {
  const ap = mapCourse("common_app", school(), course({ level: "ap", period: "quarter" }));
  assert.equal(field(ap, "level").value, "Advanced Placement (AP)");
  assert.equal(field(ap, "level").status, "verified");
  assert.equal(field(ap, "period").value, "Quarterly");
  assert.equal(field(mapCourse("common_app", school(), course({ level: "honors" })), "level").value, "Honors");
});

test("Common App marks its subject dropdown as unverified", () => {
  const f = field(mapCourse("common_app", school(), course({ subject: "english" })), "subject");
  assert.equal(f.status, "unverified");
});

test("STARS maps arts to Fine Arts / Music for every arts sub-subject", () => {
  for (const sub of SUB_SUBJECTS.arts) {
    const f = field(mapCourse("stars", school(), course({ subject: "arts", subSubject: sub })), "subject");
    assert.equal(f.value, "Fine Arts / Music");
    assert.equal(f.status, "verified");
  }
});

test("STARS maps course length and level", () => {
  const m = mapCourse("stars", school(), course({ period: "trimester", level: "gifted" }));
  assert.equal(field(m, "period").value, "Trimester");
  assert.equal(field(m, "level").value, "Gifted and Talented");
});

test("an override wins and is flagged", () => {
  const m = mapCourse("common_app", school(), course({ level: "ap", overrides: { common_app: { level: "Honors" } } }));
  const f = field(m, "level");
  assert.equal(f.value, "Honors");
  assert.equal(f.overridden, true);
  assert.equal(field(mapCourse("stars", school(), course({ level: "ap", overrides: { common_app: { level: "Honors" } } })), "level").overridden, undefined);
});

test("a course with no grades and no credit yields warnings and does not throw", () => {
  const m = mapCourse("common_app", school(), course({ terms: [], finalGrade: null, credit: null }));
  assert.equal(field(m, "grades").value, null);
  assert.ok(m.warnings.some((w) => /grade/i.test(w)));
  assert.ok(m.warnings.some((w) => /credit/i.test(w)));
});

test("a course with only a final grade still maps", () => {
  const m = mapCourse("stars", school(), course({ terms: [], finalGrade: "B+" }));
  assert.equal(field(m, "grades").value, "B+");
});

test("term grades are listed per term, and a final grade is appended", () => {
  const m = mapCourse("common_app", school(), course({
    terms: [{ term: "S1", grade: "A", status: "graded" }, { term: "S2", grade: "A-", status: "graded" }],
    finalGrade: "A",
  }));
  assert.equal(field(m, "grades").value, "S1: A, S2: A-, Final: A");
});

test("STARS asks for the unweighted grade and IP for in-progress terms", () => {
  const m = mapCourse("stars", school(), course({ terms: [{ term: "S1", grade: "A", gradeWeighted: "5.0", status: "graded" }, { term: "S2", grade: "", status: "in_progress" }] }));
  assert.ok(m.warnings.some((w) => /unweighted/i.test(w)));
  assert.ok(m.warnings.some((w) => /IP/.test(w)));
});

test("all four systems are registered", () => {
  assert.deepEqual([...SYSTEM_IDS].sort(), ["common_app", "csu", "stars", "uc"]);
});

test("CSU maps course types exactly", () => {
  assert.equal(field(mapCourse("csu", school(), course({ level: "ap" })), "level").value, "Advanced Placement");
  assert.equal(field(mapCourse("csu", school(), course({ level: "regular" })), "level").value, "None");
  assert.equal(field(mapCourse("csu", school(), course({ level: "ib_hl" })), "level").value, "International Baccalaureate");
  assert.equal(field(mapCourse("csu", school(), course({ level: "honors" })), "level").value, "Honors");
});

test("CSU maps subjects to A-G areas and splits science", () => {
  assert.match(field(mapCourse("csu", school(), course({ subject: "mathematics" })), "subject").value ?? "", /^C /);
  const bio = field(mapCourse("csu", school(), course({ subject: "science", subSubject: "biology" })), "subSubject");
  assert.match(bio.value ?? "", /^D1/);
  const phys = field(mapCourse("csu", school(), course({ subject: "science", subSubject: "physics" })), "subSubject");
  assert.match(phys.value ?? "", /^D2/);
  assert.equal(field(mapCourse("csu", school(), course({ subject: "history_social" })), "subject").status, "unverified");
});

test("CSU warns for non-US and college schools", () => {
  assert.ok(mapCourse("csu", school({ country: "Taiwan" }), course()).warnings.some((w) => /foreign/i.test(w)));
  assert.ok(mapCourse("csu", school({ kind: "college" }), course()).warnings.some((w) => /college/i.test(w)));
  assert.ok(!mapCourse("csu", school(), course()).warnings.some((w) => /foreign/i.test(w)));
});

test("UC maps honors codes", () => {
  const honors = field(mapCourse("uc", school(), course({ level: "honors" })), "level");
  assert.equal(honors.value, "HL");
  assert.equal(honors.status, "unverified");
  assert.equal(field(mapCourse("uc", school(), course({ level: "dual_enrollment" })), "level").value, "CL");
  assert.equal(field(mapCourse("uc", school(), course({ level: "regular" })), "level").value, "NH");
  assert.equal(field(mapCourse("uc", school(), course({ level: "ap" })), "level").value, "AP");
  assert.equal(field(mapCourse("uc", school(), course({ level: "ib_sl" })), "level").value, "IB");
});

test("UC ignores plus and minus and flags it", () => {
  const m = mapCourse("uc", school(), course({ terms: [{ term: "S1", grade: "B+", status: "graded" }, { term: "S2", grade: "A-", status: "graded" }] }));
  assert.equal(field(m, "grades").value, "S1: B, S2: A");
  assert.ok(m.warnings.some((w) => /\+|-/.test(w) && /ignore/i.test(w)));
});

test("UC rejects Pass/Fail, and uses IP, PL and NO codes", () => {
  const pf = mapCourse("uc", school(), course({ scale: "pass_fail", terms: [{ term: "S1", grade: "P", status: "graded" }] }));
  assert.ok(pf.warnings.some((w) => /pass/i.test(w)));
  const codes = mapCourse("uc", school(), course({ terms: [{ term: "S1", grade: "", status: "in_progress" }, { term: "S2", grade: "", status: "planned" }, { term: "FY", grade: "", status: "none" }] }));
  assert.equal(field(codes, "grades").value, "S1: IP, S2: PL, FY: NO");
});

test("UC has no credit field, and maps arts to its five disciplines", () => {
  const m = mapCourse("uc", school(), course({ subject: "arts", subSubject: "dance" }));
  assert.equal(field(m, "credit").status, "none");
  assert.equal(field(m, "subject").value, "F – Visual and performing arts");
  assert.equal(field(m, "subSubject").value, "Dance");
  assert.equal(field(mapCourse("uc", school(), course({ subject: "arts", subSubject: "interdisciplinary" })), "subSubject").value, "Interdisciplinary Arts");
});

test("UC flags college, summer and non-A-G courses", () => {
  const w = mapCourse("uc", school(), course({ isCollege: true, isSummer: true, subject: "pe_health" })).warnings.join(" | ");
  assert.match(w, /Colleges attended/);
  assert.match(w, /summer/i);
  assert.match(w, /A-G/);
});
