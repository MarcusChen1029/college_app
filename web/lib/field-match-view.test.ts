// Run with: npm test  (node's built-in test runner + type stripping)
import assert from "node:assert/strict";
import { test } from "node:test";
import { aLevelGrades, courseOffer, gradeScore, offerRange, type MatchCourse } from "./field-match-view.ts";

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
  assert.equal(courseOffer({ aLevel: "A*AA", ib: 39, atar: null }), "A-level A*AA · IB 39");
  assert.equal(courseOffer({ aLevel: null, ib: null, atar: null }), null);
  const c = (aLevel: string | null, ib: number | null, atar: number | null = null): MatchCourse => ({ name: "x", fields: [], aLevel, ib, atar, full: "" });
  assert.equal(offerRange([c("AAA–ABB", 33), c("A*A*A–AAA", 38), c("A*AA–ABB", 35)]), "A-level A*A*A–ABB · IB 33–38");
  assert.equal(offerRange([c(null, 34, 88), c(null, 35, 89)]), "IB 34–35 · ATAR 88–89");
  assert.equal(offerRange([c(null, null)]), null);
});
