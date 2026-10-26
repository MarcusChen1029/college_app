import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCourse, matchSubjectOption, SYSTEM_IDS, SYSTEMS, type MappedCourse } from "./transcript-maps.ts";
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

test("Common App subjects are verified and split math and science by course", () => {
  const subj = (subject: TranscriptCourse["subject"], sub: string | null = null) => field(mapCourse("common_app", school(), course({ subject, subSubject: sub })), "subject");
  assert.equal(subj("english").value, "English");
  assert.equal(subj("english").status, "verified");
  assert.equal(subj("mathematics", "calculus").value, "Calculus");
  assert.equal(subj("mathematics", "algebra_2").value, "Algebra");
  assert.equal(subj("mathematics", "pre_algebra").value, "Pre-Algebra");
  assert.equal(subj("mathematics", "trigonometry").value, "Trigonometry");
  assert.equal(subj("mathematics", "statistics").value, "Math (Other)");
  assert.equal(subj("mathematics").value, "Math (Other)");
  assert.equal(subj("science", "biology").value, "Biology");
  assert.equal(subj("science", "earth_space").value, "Earth/Environmental Science");
  assert.equal(subj("science", "integrated").value, "Science (Other)");
  assert.equal(subj("arts", "music").value, "Art (Visual or Performing)");
  assert.equal(subj("arts", "dance").value, "Art (Visual or Performing)");
  assert.equal(subj("history_social").value, "History/Social Science");
  assert.equal(subj("world_language").value, "Foreign/World Language");
  assert.equal(subj("pe_health").value, "Physical Education/Health");
  assert.equal(subj("business").value, "Other/Elective");
});

test("every mapped subject is one of that system's own listed options", () => {
  for (const id of SYSTEM_IDS) {
    const list = SYSTEMS[id].subjectList;
    assert.ok(list.options.length >= 6, `${id} has a subject list`);
    for (const s of SUBJECTS) {
      for (const sub of [null, ...SUB_SUBJECTS[s]]) {
        const f = field(mapCourse(id, school(), course({ subject: s, subSubject: sub })), "subject");
        if (f.value !== null) assert.ok(list.options.includes(f.value), `${id}: "${f.value}" (${s}/${sub}) is not in its list`);
      }
    }
  }
});

test("Common App lists its 20 official subjects, STARS its 10, UIUC its 6", () => {
  assert.equal(SYSTEMS.common_app.subjectList.options.length, 20);
  assert.equal(SYSTEMS.common_app.subjectList.verified, true);
  assert.ok(SYSTEMS.common_app.subjectList.options.includes("Religion"));
  assert.equal(SYSTEMS.stars.subjectList.options.length, 10);
  assert.ok(SYSTEMS.stars.subjectList.options.includes("Fine Arts / Music"));
  assert.deepEqual([...SYSTEMS.uiuc.subjectList.options], ["English", "Mathematics", "Science", "Social Science", "Language Other Than English", "Other"]);
  assert.ok(SYSTEMS.csu.subjectList.options.includes("D1 – Biological Science"));
  assert.equal(SYSTEMS.uc.subjectList.verified, false);
});

test("matchSubjectOption matches case, dashes, spacing and A-G letter codes", () => {
  const csu = SYSTEMS.csu.subjectList.options;
  assert.equal(matchSubjectOption(csu, "c – mathematics"), "C – Mathematics");
  assert.equal(matchSubjectOption(csu, "C - Mathematics"), "C – Mathematics");
  assert.equal(matchSubjectOption(csu, "C"), "C – Mathematics");
  assert.equal(matchSubjectOption(csu, "D1"), "D1 – Biological Science");
  assert.equal(matchSubjectOption(csu, "D"), null); // ambiguous: D1 or D2
  assert.equal(matchSubjectOption(SYSTEMS.common_app.subjectList.options, "  calculus "), "Calculus");
  assert.equal(matchSubjectOption(SYSTEMS.common_app.subjectList.options, "Music"), null);
  assert.equal(matchSubjectOption(SYSTEMS.ut.subjectList.options, ""), null);
});

test("UIUC puts arts and computer science under Other, has no credit and no sub-category", () => {
  const f = (subject: TranscriptCourse["subject"]) => field(mapCourse("uiuc", school(), course({ subject })), "subject");
  assert.equal(f("history_social").value, "Social Science");
  assert.equal(f("world_language").value, "Language Other Than English");
  assert.equal(f("arts").value, "Other");
  assert.equal(f("computer_science").value, "Other");
  assert.equal(field(mapCourse("uiuc", school(), course()), "credit").status, "none");
  assert.equal(field(mapCourse("uiuc", school(), course()), "subSubject").status, "none");
});

test("UT Austin takes five areas plus Other, completed courses only", () => {
  assert.equal(field(mapCourse("ut", school(), course({ subject: "history_social" })), "subject").value, "Social Studies");
  assert.equal(field(mapCourse("ut", school(), course({ subject: "arts" })), "subject").value, "Other");
  const w = mapCourse("ut", school(), course({ terms: [{ term: "S2", grade: "", status: "in_progress" }] })).warnings.join(" ");
  assert.match(w, /completed/i);
});

test("UC marks its area names unverified because the dropdown wording is not published", () => {
  const f = field(mapCourse("uc", school(), course({ subject: "mathematics" })), "subject");
  assert.equal(f.value, "C – Mathematics");
  assert.equal(f.status, "unverified");
});

test("CSU area names are official, and science splits into D1 and D2", () => {
  assert.equal(field(mapCourse("csu", school(), course({ subject: "history_social" })), "subject").status, "verified");
  assert.equal(field(mapCourse("csu", school(), course({ subject: "english" })), "subject").value, "B – English");
  assert.equal(field(mapCourse("csu", school(), course({ subject: "arts" })), "subject").value, "F – Visual & Performing Arts");
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

test("all six systems are registered", () => {
  assert.deepEqual([...SYSTEM_IDS].sort(), ["common_app", "csu", "stars", "uc", "uiuc", "ut"]);
});

test("CSU maps course types exactly", () => {
  assert.equal(field(mapCourse("csu", school(), course({ level: "ap" })), "level").value, "Advanced Placement");
  assert.equal(field(mapCourse("csu", school(), course({ level: "regular" })), "level").value, "None");
  assert.equal(field(mapCourse("csu", school(), course({ level: "ib_hl" })), "level").value, "International Baccalaureate");
  assert.equal(field(mapCourse("csu", school(), course({ level: "honors" })), "level").value, "Honors");
});

test("CSU maps subjects to A-G areas and splits science", () => {
  assert.match(field(mapCourse("csu", school(), course({ subject: "mathematics" })), "subject").value ?? "", /^C /);
  const bio = field(mapCourse("csu", school(), course({ subject: "science", subSubject: "biology" })), "subject");
  assert.match(bio.value ?? "", /^D1/);
  const phys = field(mapCourse("csu", school(), course({ subject: "science", subSubject: "physics" })), "subject");
  assert.match(phys.value ?? "", /^D2/);
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
