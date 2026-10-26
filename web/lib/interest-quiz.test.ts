import assert from "node:assert/strict";
import { test } from "node:test";
import { INTEREST_CAREERS } from "./interest-careers.ts";
import {
  QUESTIONS,
  RIASEC,
  emptyAnswers,
  interestCode,
  matchCareers,
  parseStored,
  scoreAnswers,
  suggestPrograms,
  type Answers,
} from "./interest-quiz.ts";

function answersFor(levels: Partial<Record<(typeof RIASEC)[number], number>>): Answers {
  return QUESTIONS.map((q) => levels[q.type] ?? 3);
}

test("30 questions, 5 per type, unique ids", () => {
  assert.equal(QUESTIONS.length, 30);
  for (const t of RIASEC) assert.equal(QUESTIONS.filter((q) => q.type === t).length, 5);
  assert.equal(new Set(QUESTIONS.map((q) => q.id)).size, 30);
});

test("scoring maps 1..5 to 0..100 per type", () => {
  const s = scoreAnswers(answersFor({ R: 5, I: 1, A: 3 }));
  assert.equal(s.R, 100);
  assert.equal(s.I, 0);
  assert.equal(s.A, 50);
  assert.equal(scoreAnswers(emptyAnswers()).R, null);
});

test("partial answers score only answered items", () => {
  const a = emptyAnswers();
  a[0] = 5; // R1
  assert.equal(scoreAnswers(a).R, 100);
  assert.equal(scoreAnswers(a).I, null);
});

test("code is top three, highest first", () => {
  const s = scoreAnswers(answersFor({ S: 5, A: 4, I: 2, R: 1, E: 1, C: 1 }));
  assert.deepEqual(interestCode(s), ["S", "A", "I"]);
});

test("ties fall back to R, I, A, S, E, C order", () => {
  const s = scoreAnswers(answersFor({}));
  assert.deepEqual(interestCode(s), ["R", "I", "A"]);
  const s2 = scoreAnswers(answersFor({ C: 5, E: 5, S: 5 }));
  assert.deepEqual(interestCode(s2), ["S", "E", "C"]);
});

test("dataset is sane", () => {
  assert.ok(INTEREST_CAREERS.length >= 60);
  for (const c of INTEREST_CAREERS) {
    assert.match(c.code, /^\d\d-\d{4}\.00$/);
    assert.equal(c.scores.length, 6);
    assert.ok(c.scores.every((v) => v >= 1 && v <= 7));
    assert.ok(c.programs.length > 0);
  }
});

test("matching ranks a known profile sensibly", () => {
  const investigative = matchCareers(scoreAnswers(answersFor({ I: 5, R: 4, A: 1, S: 1, E: 1, C: 2 })), INTEREST_CAREERS, 15);
  assert.equal(investigative.length, 15);
  const top = investigative.map((m) => m.career);
  const iScore = (c: (typeof top)[number]) => c.scores[1];
  const avgTopI = top.reduce((s, c) => s + iScore(c), 0) / top.length;
  const avgAllI = INTEREST_CAREERS.reduce((s, c) => s + iScore(c), 0) / INTEREST_CAREERS.length;
  assert.ok(avgTopI > avgAllI + 1, `top Investigative avg ${avgTopI} vs overall ${avgAllI}`);
  assert.ok(investigative[0].similarity >= investigative[14].similarity);

  const social = matchCareers(scoreAnswers(answersFor({ S: 5, A: 4, E: 2, I: 1, R: 1, C: 1 })), INTEREST_CAREERS, 10);
  assert.ok(social.some((m) => /teacher|counsel|social|therap|nurse|educat/i.test(m.career.title)));
});

test("flat or incomplete profile yields no matches", () => {
  assert.deepEqual(matchCareers(scoreAnswers(answersFor({})), INTEREST_CAREERS), []);
  assert.deepEqual(matchCareers(scoreAnswers(emptyAnswers()), INTEREST_CAREERS), []);
});

test("suggestPrograms counts and orders", () => {
  const matches = matchCareers(scoreAnswers(answersFor({ I: 5, R: 4, A: 1, S: 1, E: 1, C: 2 })), INTEREST_CAREERS, 10);
  const p = suggestPrograms(matches, 5);
  assert.ok(p.length > 0 && p.length <= 5);
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].count >= p[i].count);
});

test("parseStored rejects junk and keeps valid answers", () => {
  assert.equal(parseStored(null), null);
  assert.equal(parseStored("nope"), null);
  assert.equal(parseStored("[1,2]"), null);
  const ok = parseStored(JSON.stringify([...Array(29).fill(5), 9]));
  assert.ok(ok);
  assert.equal(ok[0], 5);
  assert.equal(ok[29], null);
});
