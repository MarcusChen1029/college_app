// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { aLevelGrades, courseOffer, gradeScore, ibSummary, offerRange, type MatchCourse } from "./field-match-view.ts";

test("aLevelGrades reads the grades from published offers, and nothing else", () => {
  assert.equal(aLevelGrades("A*AA, with A*A in Maths and Further Maths if available"), "A*AA");
  assert.equal(aLevelGrades("Predicted/final A-Levels A*AA to ABB (typical minimum range; Physical, Earth, Math and Computer Sciences group)"), "A*AA–ABB");
  assert.equal(aLevelGrades("Predicted/final A-Levels A*A*A to AAA (typical minimum range)"), "A*A*A–AAA");
  // A points score (UNSW) states no grades.
  assert.equal(aLevelGrades("GCE A Levels (UK) direct entry score 12 from the best two, three or four A2 subjects, with A*=6, A=5, B=4"), null);
  assert.equal(aLevelGrades(null), null);
});

test("offers order hardest first and read as short phrases", () => {
  assert.ok(gradeScore("A*A*A") > gradeScore("A*AA"));
  assert.ok(gradeScore("AAA") > gradeScore("ABB"));
  assert.equal(courseOffer({ aLevel: "A*AA", ib: 39, ibText: null, atar: null }), "A-level A*AA · IB 39");
  assert.equal(courseOffer({ aLevel: null, ib: null, ibText: null, atar: null }), null);
  const c = (aLevel: string | null, ib: number | null, atar: number | null = null): MatchCourse => ({ name: "x", fields: [], aLevel, ib, ibText: null, atar });
  assert.deepEqual(offerRange([c("AAA–ABB", 33), c("A*A*A–AAA", 38), c("A*AA–ABB", 35)]), { text: "A-level A*A*A–ABB · IB 33–38" });
  assert.deepEqual(offerRange([c(null, 34, 88), c(null, 35, 89)]), { text: "IB 34–35 · ATAR 88–89" });
  assert.equal(offerRange([c(null, null)]), null);
  assert.equal(offerRange([]), null);
  // A measure only some courses publish is left out of the college's range; one course alone is named.
  assert.deepEqual(offerRange([c("AAA", 36), c("ABB", null)]), { text: "A-level AAA–ABB" });
  assert.deepEqual(offerRange([{ ...c("AAA", null), name: "Medicine (6-year)" }, c(null, null)]), { text: "Medicine: A-level AAA" });
});

// The courses as /tools/match builds them from data/colleges/<slug>.json (2026-10-30).
const course = (name: string, aLevel: string | null, ib: string | null): MatchCourse => ({
  name,
  fields: [],
  aLevel: aLevelGrades(aLevel),
  ib: null,
  ibText: ibSummary(ib),
  atar: null,
});

test("Toronto: one course's IB words never stand for the college", () => {
  const ibArts = "No minimum total published. Complete IB Diploma with English HL or SL; Mathematics: Analysis and Approaches HL or SL, or Applications and Interpretations HL. Based on predicted or final results, excluding bonus points.";
  const toronto = [
    course("Computer Science BCS (Faculty of Arts & Science, St. George)", "No grade offer published. Five IGCSE/GCSE/O Level subjects plus three different A Level/International A Level subjects", ibArts),
    course("Economics HBA (Faculty of Arts & Science, St. George; Social Sciences admission category)", "No grade offer published.", ibArts),
    course(
      "Mechanical Engineering BASc (Faculty of Applied Science & Engineering)",
      "Three A Levels including Mathematics and Physics; Chemistry strongly recommended as the third A Level. Grades of B or higher are recommended in the prerequisite subjects.",
      "Complete IB Diploma with Mathematics (Analysis and Approaches HL or SL, or Applications and Interpretations HL; AA HL strongly recommended), Chemistry, Physics and English. Minimum predicted score of at least 30 (excluding ToK and EE points) with at least 4 in the prerequisite subjects to be considered; most programs require higher scores.",
    ),
  ];
  assert.deepEqual(toronto.map((c) => c.ibText), [null, null, "Complete IB Diploma with Mathematics, Chemistry, Physics and English"]);
  assert.deepEqual(offerRange(toronto), { varies: true });
  assert.equal(courseOffer(toronto[2]), "Complete IB Diploma with Mathematics, Chemistry, Physics and English");
});

test("Edinburgh: the range covers every course; IB words two of three courses publish stay with their course", () => {
  const edinburgh = [
    course("Computer Science", "Most applicants needed A*A*A* down to AAB, with Maths at A; widening-access minimum ABB", "Range from 43 points (777 at HL) down to 34 points (665 at HL), with HL Maths"),
    course("Economics", "Most applicants needed A*A*A* down to A*AA, with Maths at B", "Range from 40 points (766 at HL) down to 37 points (666 at HL), with HL Maths 5"),
    course("Medicine MBChB (6-year programme)", "AAA, in one sitting", null),
  ];
  assert.deepEqual(edinburgh.map((c) => c.aLevel), ["A*A*A*–AAB", "A*A*A*–A*AA", "AAA"]);
  assert.equal(edinburgh[0].ibText, "Range from 43 points down to 34 points, with HL Maths");
  assert.deepEqual(offerRange(edinburgh), { text: "A-level A*A*A*–AAB" });
  // Both IB-word courses alone: different words, so "varies", never the first one's.
  assert.deepEqual(offerRange(edinburgh.slice(0, 2)), { text: "A-level A*A*A*–AAB" });
  assert.deepEqual(offerRange(edinburgh.slice(0, 2).map((c) => ({ ...c, aLevel: null }))), { varies: true });
});

test("a cut summary ends at a comma or a word, never inside brackets", () => {
  const long = "Complete IB Diploma with Mathematics, Chemistry, Physics, English, Biology and a second language at Higher Level";
  const s = ibSummary(long)!;
  assert.ok(s.endsWith("…") && s.length <= 73, s);
  assert.equal(s, "Complete IB Diploma with Mathematics, Chemistry, Physics, English…");
  assert.ok(!/\([^)]*$/.test(ibSummary("Range from 43 points (777 at HL) down to 34 points (665 at HL), with HL Maths and something long enough to cut")!));
});

test("a course with IB words but no points total shows the words (McMaster), never a made-up number", () => {
  const mcmaster = "30-33 is required for consideration (out of 45, including TOK and EE bonus points). Six subjects, three at HL";
  assert.equal(ibSummary(mcmaster), "30-33 is required for consideration");
  assert.equal(ibSummary("No IB points total published. Completed IB Diploma including at least three Higher Level courses."), null);
  assert.equal(ibSummary("6,6,6 including Mathematics"), "6,6,6 including Mathematics");
  assert.equal(courseOffer({ aLevel: null, ib: null, ibText: "6,6,6 including Mathematics", atar: null }), "IB 6,6,6 including Mathematics");
  assert.equal(courseOffer({ aLevel: null, ib: null, ibText: "Full IB Diploma, six IB courses", atar: null }), "Full IB Diploma, six IB courses");
});
