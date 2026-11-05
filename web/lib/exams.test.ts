import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EMPTY_EXAMS,
  EXAM_LIMITS,
  EXAM_SCALES,
  EXAM_SUBJECTS,
  EXAM_SYSTEMS,
  examsHaveData,
  examStatus,
  gradeString,
  groupEntries,
  ibSummary,
  IB_CORE,
  mergeExams,
  normalizeGrade,
  parseIbTotal,
  scaleHint,
  sessionLabel,
  upgradeExams,
  validateEntry,
  type ExamEntry,
  type ExamsDoc,
} from "./exams.ts";

let n = 0;
const entry = (p: Partial<ExamEntry> & Pick<ExamEntry, "system" | "subject">): ExamEntry => ({ id: `e${++n}`, ...p });

test("every system accepts its full scale and rejects values outside it", () => {
  for (const [system, scale] of Object.entries(EXAM_SCALES)) {
    const sys = system === "ib_core" ? "ib" : (system as Exclude<(typeof EXAM_SYSTEMS)[number], "other">);
    const subject = system === "ib_core" ? IB_CORE.tok : "Subject";
    for (const v of scale.values) assert.equal(normalizeGrade(sys, v, subject), v, `${system} ${v}`);
    for (const bad of ["0.5", "X", "A**", "16", "100", "-1"]) assert.equal(normalizeGrade(sys, bad, subject), null, `${system} ${bad}`);
  }
  assert.equal(normalizeGrade("ap", "6"), null);
  assert.equal(normalizeGrade("ap", "0"), null);
  assert.equal(normalizeGrade("ib", "8", "Physics"), null);
  assert.equal(normalizeGrade("ib", "A", "Physics"), null, "letters are only for TOK / EE");
  assert.equal(normalizeGrade("ib", "6", IB_CORE.ee), null, "TOK / EE are A-E");
  assert.equal(normalizeGrade("a_level", "F"), null);
  assert.equal(normalizeGrade("as_level", "A*"), null, "AS has no A*");
  assert.equal(normalizeGrade("gsat", "0"), "0");
  assert.equal(normalizeGrade("gsat", "15"), "15");
  assert.equal(normalizeGrade("gsat", "16"), null);
});

test("grades normalise case and spelling, except AS which keeps Cambridge's lowercase as typed", () => {
  assert.equal(normalizeGrade("a_level", "a*"), "A*");
  assert.equal(normalizeGrade("a_level", " b "), "B");
  assert.equal(normalizeGrade("igcse", "g"), "G");
  assert.equal(normalizeGrade("gcse", "9"), "9");
  assert.equal(normalizeGrade("gcse", "u"), "U");
  assert.equal(normalizeGrade("ib", "c", "TOK"), "C");
  assert.equal(normalizeGrade("gsat", "07"), "7");
  assert.equal(normalizeGrade("as_level", "b"), "b");
  assert.equal(normalizeGrade("as_level", "B"), "B");
  assert.equal(normalizeGrade("other", "5**"), "5**", "free text");
  assert.equal(normalizeGrade("other", "x".repeat(21)), null);
  assert.equal(normalizeGrade("ap", "  "), null);
});

test("scale hints list what the form accepts", () => {
  assert.equal(scaleHint("ap"), "5, 4, 3, 2, 1");
  assert.equal(scaleHint("a_level"), "A*, A, B, C, D, E, U");
  assert.equal(scaleHint("ib", IB_CORE.ee), "A, B, C, D, E");
  assert.equal(scaleHint("gsat"), "0-15");
  assert.equal(scaleHint("other"), null);
});

test("subject suggestions: 42 AP courses with their prefix, the IB list with both core parts, the six GSAT subjects", () => {
  assert.equal(EXAM_SUBJECTS.ap.length, 42);
  assert.ok(EXAM_SUBJECTS.ap.every((s) => s.name.startsWith("AP ")));
  assert.equal(new Set(EXAM_SUBJECTS.ap.map((s) => s.name)).size, 42);
  const ib = EXAM_SUBJECTS.ib.map((s) => s.name);
  assert.ok(ib.includes(IB_CORE.tok) && ib.includes(IB_CORE.ee));
  assert.ok(EXAM_SUBJECTS.ib.filter((s) => s.group).every((s) => s.group! >= 1 && s.group! <= 6));
  assert.deepEqual(EXAM_SUBJECTS.gsat.map((s) => s.name), ["國文", "英文", "數學A", "數學B", "社會", "自然"]);
});

test("validateEntry trims, normalises and drops fields that don't apply", () => {
  const r = validateEntry({ system: "a_level", subject: "  Mathematics ", board: " AQA ", session: "2027-06", predicted: "a*", result: "", level: "HL", otherName: "x", note: " " });
  assert.deepEqual(r, { ok: true, entry: { system: "a_level", subject: "Mathematics", level: null, board: "AQA", session: "2027-06", predicted: "A*", result: null, otherName: null, note: null } });
  const ib = validateEntry({ system: "ib", subject: "Physics", level: "hl", board: "AQA", predicted: "6" });
  assert.ok(ib.ok && ib.entry.level === "HL" && ib.entry.board === null);
  const tok = validateEntry({ system: "ib", subject: "Theory of Knowledge", level: "HL", predicted: "b" });
  assert.ok(tok.ok && tok.entry.level === null && tok.entry.predicted === "B");
  const other = validateEntry({ system: "other", subject: "Maths", otherName: " HKDSE ", result: "5**" });
  assert.ok(other.ok && other.entry.otherName === "HKDSE" && other.entry.result === "5**");
});

test("validateEntry refuses with a code per field", () => {
  const err = (input: Parameters<typeof validateEntry>[0]) => {
    const r = validateEntry(input);
    return r.ok ? null : r.error;
  };
  assert.equal(err({ system: "sat", subject: "Math" }), "system");
  assert.equal(err({ system: "ap", subject: "  " }), "subject");
  assert.equal(err({ system: "ap", subject: "x".repeat(121) }), "subject");
  assert.equal(err({ system: "ib", subject: "Physics", level: "XL" }), "level");
  assert.equal(err({ system: "gcse", subject: "Maths", board: "x".repeat(61) }), "board");
  for (const s of ["2027-13", "2027-5", "27-05", "1989-05", "May 2027"]) assert.equal(err({ system: "ap", subject: "AP Biology", session: s }), "session", s);
  assert.equal(err({ system: "ap", subject: "AP Biology", predicted: "6" }), "predicted");
  assert.equal(err({ system: "ap", subject: "AP Biology", result: "A" }), "result");
  assert.equal(err({ system: "other", subject: "Maths" }), "otherName");
  assert.equal(err({ system: "other", subject: "Maths", otherName: "x".repeat(81) }), "otherName");
  assert.equal(err({ system: "ap", subject: "AP Biology", note: "x".repeat(301) }), "note");
  assert.equal(err({ system: "ap", subject: "AP Biology", session: "2027-05", predicted: "", result: "5" }), null);
});

test("upgradeExams turns junk into a valid empty document", () => {
  for (const junk of [null, undefined, 3, "x", [], { entries: "no" }, { entries: [null, 1, "x", []] }]) assert.deepEqual(upgradeExams(junk), { version: 1, entries: [] });
});

test("upgradeExams drops unusable entries, clears bad fields, drops unknown fields and caps at 80", () => {
  const doc = upgradeExams({
    version: 7,
    extra: true,
    entries: [
      { id: "a", system: "ap", subject: "AP Biology", predicted: "9", result: "5", session: "nope", unknown: 1 },
      { id: "a", system: "ap", subject: "AP Chemistry" }, // repeated id
      { system: "ap", subject: "AP Latin" }, // no id
      { id: "b", system: "sat", subject: "Math" }, // unknown system
      { id: "c", system: "ib", subject: "" }, // no subject
      { id: "d", system: "other", subject: "Maths" }, // no curriculum name: kept under "Other"
      { id: "e", system: "ib", subject: "Physics", level: "HL", predicted: 7 },
    ],
    ibTotals: { predicted: 38, result: 46 },
  });
  assert.deepEqual(doc, {
    version: 1,
    entries: [
      { id: "a", system: "ap", subject: "AP Biology", level: null, board: null, session: null, predicted: null, result: "5", otherName: null, note: null },
      { id: "d", system: "other", subject: "Maths", level: null, board: null, session: null, predicted: null, result: null, otherName: "Other", note: null },
      { id: "e", system: "ib", subject: "Physics", level: "HL", board: null, session: null, predicted: "7", result: null, otherName: null, note: null },
    ],
    ibTotals: { predicted: 38, result: null },
  });
  const many = upgradeExams({ entries: Array.from({ length: 90 }, (_, i) => ({ id: `x${i}`, system: "ap", subject: `AP ${i}` })) });
  assert.equal(many.entries.length, EXAM_LIMITS.entries);
  assert.equal(upgradeExams({ entries: [], ibTotals: { predicted: 1.5, result: -1 } }).ibTotals, undefined);
});

test("upgradeExams keeps a valid document unchanged", () => {
  const doc: ExamsDoc = {
    version: 1,
    entries: [{ id: "a", system: "as_level", subject: "Physics", level: null, board: "Cambridge International", session: "2026-06", predicted: "b", result: null, otherName: null, note: "retake" }],
    ibTotals: { predicted: 40, result: null },
  };
  assert.deepEqual(upgradeExams(JSON.parse(JSON.stringify(doc))), doc);
});

test("examStatus is derived: final, predicted, then planned or waiting by the session month", () => {
  const today = "2026-11-05";
  assert.equal(examStatus({ result: "5", predicted: "4", session: "2027-05" }, today), "final");
  assert.equal(examStatus({ predicted: "4", session: "2025-05" }, today), "predicted");
  assert.equal(examStatus({ session: "2026-12" }, today), "planned");
  assert.equal(examStatus({ session: "2026-11" }, today), "waiting", "this month: the exam is happening, the result isn't out");
  assert.equal(examStatus({ session: "2026-05" }, today), "waiting");
  assert.equal(examStatus({}, today), "none");
});

test("ibSummary: six subjects, HL/SL count, TOK/EE, typed totals only", () => {
  const subjects = [
    ["Physics", "HL", "7"],
    ["Mathematics: Analysis and Approaches", "HL", "6"],
    ["Economics", "HL", "6"],
    ["Language A: Literature", "SL", "5"],
    ["Language B", "SL", "5"],
    ["Visual Arts", "SL", "4"],
  ] as const;
  const entries = [
    ...subjects.map(([subject, level, predicted]) => entry({ system: "ib", subject, level, predicted })),
    entry({ system: "ib", subject: IB_CORE.tok, predicted: "B" }),
    entry({ system: "ib", subject: IB_CORE.ee, predicted: "A", result: "B" }),
    entry({ system: "ap", subject: "AP Biology", predicted: "5" }),
  ];
  const s = ibSummary(entries, { predicted: 38 });
  assert.equal(s.subjects, 6);
  assert.equal(s.hl, 3);
  assert.equal(s.sl, 3);
  assert.deepEqual(s.predicted, { sum: 33, graded: 6 });
  assert.deepEqual(s.result, { sum: 0, graded: 0 });
  assert.deepEqual(s.tok, { predicted: "B", result: null });
  assert.deepEqual(s.ee, { predicted: "A", result: "B" });
  assert.deepEqual(s.totals, { predicted: 38, result: null });

  const fewer = ibSummary(entries.slice(0, 5).map((e, i) => (i === 4 ? { ...e, predicted: null } : e)));
  assert.deepEqual(fewer.predicted, { sum: 24, graded: 4 });
  assert.equal(fewer.subjects, 5);
  assert.equal(fewer.tok, null);
  assert.deepEqual(fewer.totals, { predicted: null, result: null });

  for (const bad of [-1, 46, 3.5]) assert.equal(ibSummary([], { predicted: bad, result: bad }).totals.predicted, null, String(bad));
  assert.deepEqual(ibSummary([], { predicted: 0, result: 45 }).totals, { predicted: 0, result: 45 });
});

test("parseIbTotal accepts whole numbers 0-45 only", () => {
  assert.equal(parseIbTotal(""), null);
  assert.equal(parseIbTotal(" 0 "), 0);
  assert.equal(parseIbTotal("45"), 45);
  for (const bad of ["46", "-1", "3.5", "abc", "100"]) assert.equal(parseIbTotal(bad), false, bad);
});

test("gradeString orders grades best first with U last, per system and per kind", () => {
  const entries = [
    entry({ system: "a_level", subject: "Chemistry", predicted: "A", result: "U" }),
    entry({ system: "a_level", subject: "Maths", predicted: "A*", result: "A" }),
    entry({ system: "a_level", subject: "Physics", predicted: "U" }),
    entry({ system: "a_level", subject: "Further Maths", predicted: "B", result: "A*" }),
    entry({ system: "as_level", subject: "Biology", predicted: "b" }),
    entry({ system: "as_level", subject: "History", predicted: "A" }),
    entry({ system: "as_level", subject: "Art", predicted: "u" }),
  ];
  assert.equal(gradeString(entries, "a_level", "predicted"), "A*ABU");
  assert.equal(gradeString(entries, "a_level", "result"), "A*AU");
  assert.equal(gradeString(entries, "as_level", "predicted"), "Abu");
  assert.equal(gradeString(entries, "gcse", "predicted"), "");
});

test("groupEntries: fixed curriculum order, other curricula grouped by name", () => {
  const groups = groupEntries([
    entry({ system: "other", subject: "Maths", otherName: "HKDSE" }),
    entry({ system: "gcse", subject: "English" }),
    entry({ system: "ap", subject: "AP Biology" }),
    entry({ system: "other", subject: "Physics", otherName: "hkdse " }),
    entry({ system: "other", subject: "EPQ", otherName: "EPQ" }),
    entry({ system: "ib", subject: "Physics" }),
  ]);
  assert.deepEqual(
    groups.map((g) => [g.key, g.entries.length]),
    [["ap", 1], ["ib", 1], ["gcse", 1], ["other:epq", 1], ["other:hkdse", 2]],
  );
  assert.equal(groups[4].title, "HKDSE");
});

test("sessionLabel", () => {
  assert.equal(sessionLabel("2027-05", "en"), "May 2027");
  assert.equal(sessionLabel("2027-11", "zh-TW"), "2027 年 11 月");
  assert.equal(sessionLabel("bad", "en"), "bad");
});

test("mergeExams: empty account takes every local entry, identical ones included, and the totals", () => {
  const twin = { system: "ib" as const, subject: "Language A: Literature", level: "HL" as const, session: "2027-05" };
  const local: ExamsDoc = {
    version: 1,
    entries: [entry({ system: "ap", subject: "AP Biology", result: "5" }), entry(twin), entry(twin)],
    ibTotals: { predicted: 40 },
  };
  const m = mergeExams(EMPTY_EXAMS, local);
  assert.equal(m.changed, true);
  assert.deepEqual(m.doc.entries, local.entries, "two identical local entries (bilingual diploma) both join");
  assert.deepEqual(m.leftover, []);
  assert.deepEqual(m.doc.ibTotals, { predicted: 40, result: null });
  assert.deepEqual(mergeExams(EMPTY_EXAMS, EMPTY_EXAMS), { doc: { version: 1, entries: [] }, changed: false, leftover: [] });
});

test("mergeExams: local entries are compared with the account's only, one account entry per local entry", () => {
  const twin = { system: "ib" as const, subject: "Language A: Literature", level: "HL" as const, session: "2027-05" };
  const account: ExamsDoc = { version: 1, entries: [entry({ ...twin, id: "acct" })] };
  const m = mergeExams(account, { version: 1, entries: [entry(twin), entry(twin)] });
  assert.equal(m.doc.entries.length, 2, "one local copy folds into the account's, the other joins");
  assert.equal(m.doc.entries[0].id, "acct");
  assert.equal(m.changed, true);
});

test("mergeExams: a matching local entry fills the account entry's missing grades; a disagreeing one joins as its own entry", () => {
  const acct = entry({ id: "same", system: "a_level", subject: "Maths", session: "2027-06", predicted: "A" });
  const account: ExamsDoc = { version: 1, entries: [acct], ibTotals: { predicted: 38, result: null } };
  const fill = mergeExams(account, { version: 1, entries: [entry({ system: "a_level", subject: " maths ", session: "2027-06", predicted: "A", result: "A*", board: "AQA" })] });
  assert.equal(fill.changed, true);
  assert.deepEqual(fill.doc.entries, [{ ...acct, result: "A*", board: "AQA" }]);
  assert.equal(acct.result, undefined, "the account document passed in is not changed");

  const local: ExamsDoc = {
    version: 1,
    entries: [
      entry({ system: "a_level", subject: "Maths", session: "2027-06", predicted: "B" }), // disagrees: joins, nothing lost
      entry({ system: "a_level", subject: "Maths", session: "2027-11" }), // other session: joins
      entry({ id: "same", system: "ib", subject: "Physics", level: "HL" }), // colliding id: joins with a suffix
      entry({ system: "other", subject: "Maths", otherName: "HKDSE" }),
      entry({ system: "other", subject: "Maths", otherName: "IAL" }), // other curriculum name: a different exam
    ],
    ibTotals: { predicted: 30, result: 39 },
  };
  const m = mergeExams(account, local);
  assert.equal(m.changed, true);
  assert.deepEqual(
    m.doc.entries.map((e) => [e.id, e.predicted ?? null, e.session ?? null, e.otherName ?? null]),
    [
      ["same", "A", "2027-06", null],
      [local.entries[0].id, "B", "2027-06", null],
      [local.entries[1].id, null, "2027-11", null],
      ["same-local", null, null, null],
      [local.entries[3].id, null, null, "HKDSE"],
      [local.entries[4].id, null, null, "IAL"],
    ],
  );
  assert.deepEqual(m.doc.ibTotals, { predicted: 38, result: 39 });
  assert.deepEqual(m.leftover, []);
  assert.equal(mergeExams(account, { version: 1, entries: [{ ...acct, id: "other-id" }] }).changed, false, "the same exam with nothing new");
});

test("mergeExams never goes past 80 entries and hands back the local entries that didn't fit", () => {
  const many = (p: string, k: number): ExamsDoc => ({ version: 1, entries: Array.from({ length: k }, (_, i) => ({ id: `${p}${i}`, system: "ap", subject: `${p} ${i}` })) });
  const local = many("l", 10);
  const m = mergeExams(many("a", 75), local);
  assert.equal(m.doc.entries.length, EXAM_LIMITS.entries);
  assert.deepEqual(m.leftover, local.entries.slice(5));
  assert.deepEqual(mergeExams(EMPTY_EXAMS, many("l", 85)).leftover.map((e) => e.id), ["l80", "l81", "l82", "l83", "l84"]);
});

test("examsHaveData", () => {
  assert.equal(examsHaveData(EMPTY_EXAMS), false);
  assert.equal(examsHaveData({ version: 1, entries: [], ibTotals: { predicted: null, result: null } }), false);
  assert.equal(examsHaveData({ version: 1, entries: [], ibTotals: { predicted: 0 } }), true);
});
