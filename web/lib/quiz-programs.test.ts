import assert from "node:assert/strict";
import { test } from "node:test";
import { isUndergraduateProgram, rankPrograms } from "../components/tools/programs.ts";
import { INTEREST_CAREERS, type InterestCareer } from "./interest-careers.ts";
import { matchCareers, RIASEC, type RiasecType } from "./interest-quiz.ts";

const career = (code: string, programs: string[]): InterestCareer => ({ code, title: code, zone: 4, scores: [1, 1, 1, 1, 1, 1], programs });

test("graduate, professional and residency programs are not suggested", () => {
  for (const t of [
    "Combined Medical Residency/Fellowship Program, General",
    "Pediatrics Residency Program",
    "Medical Toxicology Fellowship Program",
    "Family Medicine/Psychiatry Combined Specialty Program",
    "Law",
    "Medicine",
    "Pharmacy",
    "Veterinary Medicine",
    "Advanced Legal Research/Studies, General",
    "Dental Clinical Sciences, General",
  ])
    assert.equal(isUndergraduateProgram(t), false, t);
  for (const t of ["Biology/Biological Sciences, General", "Pre-Law Studies", "Pre-Medicine/Pre-Medical Studies", "Veterinary Sciences/Veterinary Clinical Sciences, General", "Computer Science", "Law Enforcement Investigation and Interviewing"])
    assert.equal(isUndergraduateProgram(t), true, t);
});

test("programs rank by the summed match of the careers that list them, then by how many share them, then A-Z", () => {
  const ranked = rankPrograms([
    { career: career("a", ["Physics", "Mathematics", "Medicine"]), similarity: 0.9 },
    { career: career("b", ["Mathematics", "Chemistry"]), similarity: 0.5 },
    { career: career("c", ["Chemistry", "Art"]), similarity: 0.3 },
  ]);
  assert.deepEqual(
    ranked.map((p) => p.program),
    ["Mathematics", "Physics", "Chemistry", "Art"],
  );
  assert.equal(ranked[0].weight, 1.4);
  assert.equal(ranked[0].careers, 2);
});

test("with the real career data, no suggested program for any one-type profile is a graduate program", () => {
  for (const top of RIASEC) {
    const scores = Object.fromEntries(RIASEC.map((t) => [t, t === top ? 100 : 25])) as Record<RiasecType, number>;
    const programs = rankPrograms(matchCareers(scores, INTEREST_CAREERS, 12).slice(0, 8), 8);
    assert.ok(programs.length > 0, top);
    for (const p of programs) assert.ok(isUndergraduateProgram(p.program), `${top}: ${p.program}`);
  }
});
