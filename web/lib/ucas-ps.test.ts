import assert from "node:assert/strict";
import test from "node:test";
import { UCAS_PS_MIN, UCAS_PS_QUESTIONS, UCAS_PS_TOTAL } from "./personal-essays.ts";
import { checkUcasPs, countChars, parseUcasDraft, serializeUcasDraft } from "./ucas-ps.ts";

test("countChars", () => {
  assert.equal(countChars("a\r\nb"), 3);
  assert.equal(countChars("😀"), 1);
  assert.equal(countChars(""), 0);
  assert.equal(countChars("a b"), 3);
});

test("350 minimum", () => {
  assert.deepEqual(checkUcasPs(["a".repeat(349), "a".repeat(350), ""]).short, [true, false, true]);
});

test("4000 total", () => {
  assert.equal(checkUcasPs(["a".repeat(2000), "a".repeat(2000), ""]).overBy, 0);
  assert.equal(checkUcasPs(["a".repeat(2000), "a".repeat(2001), ""]).overBy, 1);
  assert.equal(checkUcasPs(["a".repeat(10), "b".repeat(20), "c"]).total, 31);
});

test("limits are the official numbers", () => {
  assert.equal(UCAS_PS_TOTAL, 4000);
  assert.equal(UCAS_PS_MIN, 350);
});

test("parseUcasDraft tolerates junk", () => {
  for (const raw of [null, "{", '{"a":[1,2,3]}', "[]"]) assert.deepEqual(parseUcasDraft(raw), ["", "", ""]);
  assert.deepEqual(parseUcasDraft('{"a":["x"]}'), ["x", "", ""]);
  assert.deepEqual(parseUcasDraft(serializeUcasDraft(["p", "q", "r"])), ["p", "q", "r"]);
});

// Literal wording from docs/superpowers/research/2026-11-04-uk-ucas-process.md lines 80-82.
test("questions are the official three", () =>
  assert.deepEqual(UCAS_PS_QUESTIONS, [
    "Why do you want to study this course or subject?",
    "How have your qualifications and studies helped you to prepare for this course or subject?",
    "What else have you done to prepare outside of education, and why are these experiences useful?",
  ]));
