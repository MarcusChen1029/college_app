import assert from "node:assert/strict";
import { test } from "node:test";
import { codeErrorMessage, formatCode, isPlausibleCode, normalizeCode, parseCodeResult } from "./join-codes.ts";

test("normalizeCode uppercases and strips separators", () => {
  assert.equal(normalizeCode(" k7m4-qx2p "), "K7M4QX2P");
});

test("formatCode groups 8 characters and leaves anything else ungrouped", () => {
  assert.equal(formatCode("k7m4qx2p"), "K7M4-QX2P");
  assert.equal(formatCode("K7M4-QX2P"), "K7M4-QX2P");
  assert.equal(formatCode("K7M4"), "K7M4");
});

test("isPlausibleCode rejects wrong length and the characters codes never use", () => {
  assert.equal(isPlausibleCode("k7m4-qx2p"), true);
  assert.equal(isPlausibleCode("K7M4QX2"), false);
  assert.equal(isPlausibleCode("K7M4QX20"), false); // 0 is not in the alphabet
  assert.equal(isPlausibleCode("K7M4QX2I"), false); // neither is I
  assert.equal(isPlausibleCode(""), false);
});

test("parseCodeResult reads a good preview", () => {
  const r = parseCodeResult({ ok: true, kind: "class", teacher_name: "Ms Lee", school: "Lincoln", class_name: "AP Seniors", already_linked: false });
  assert.deepEqual(r, { ok: true, preview: { kind: "class", teacherName: "Ms Lee", school: "Lincoln", className: "AP Seniors", alreadyLinked: false } });
});

test("parseCodeResult: individual codes have no class and a missing school becomes null", () => {
  const r = parseCodeResult({ ok: true, kind: "individual", teacher_name: "Mr Wu", school: null, class_name: null, already_linked: true });
  assert.deepEqual(r, { ok: true, preview: { kind: "individual", teacherName: "Mr Wu", school: null, className: null, alreadyLinked: true } });
});

test("parseCodeResult maps the two failures and treats anything else as failed", () => {
  assert.deepEqual(parseCodeResult({ ok: false, error: "invalid" }), { ok: false, error: "invalid" });
  assert.deepEqual(parseCodeResult({ ok: false, error: "rate_limited" }), { ok: false, error: "rate_limited" });
  assert.deepEqual(parseCodeResult({ ok: false, error: "weird" }), { ok: false, error: "failed" });
  assert.deepEqual(parseCodeResult(null), { ok: false, error: "failed" });
  assert.deepEqual(parseCodeResult({ ok: true, kind: "admin", teacher_name: "x" }), { ok: false, error: "failed" });
});

test("every error has a student-facing message that never reveals why a code failed", () => {
  assert.match(codeErrorMessage("invalid"), /isn't valid/);
  assert.match(codeErrorMessage("rate_limited"), /wait/i);
  assert.ok(codeErrorMessage("failed").length > 0);
});
