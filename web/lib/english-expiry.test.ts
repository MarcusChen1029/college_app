import assert from "node:assert/strict";
import { test } from "node:test";

import { countryOf } from "./application-steps.ts";
import { VALIDITY, addMonths, englishExpiry, relevantEnglishDate } from "./english-expiry.ts";
import { isIsoDate } from "./tasks.ts";

const V = {
  tests: { toefl: { months: 24 }, ielts: { months: 24 }, cambridge: { months: null } },
  universities: { ucl: { measured_at: "course_start" }, cambridge: { cambridge_max_months: 24 } },
};
const DL = { date: "2027-01-13", basis: "deadline" } as const;
const eng = (o: object) => o as Parameters<typeof englishExpiry>[0];

test("warns when the result expires before the deadline", () => {
  const w = englishExpiry(eng({ toefl: { total: 100, sections: {}, date: "2025-01-10" } }), "toefl", "harvard", DL, V);
  assert.deepEqual([w?.expiresOn, w?.test, w?.takenOn], ["2027-01-10", "toefl", "2025-01-10"]);
  assert.equal(englishExpiry(eng({ toefl: { total: 100, sections: {}, date: "2025-01-20" } }), "toefl", "harvard", DL, V), null);
});

test("toefl plan covers toefl_band and takes the newest", () => {
  const e = eng({
    toefl: { total: 100, sections: {}, date: "2025-01-10" },
    toefl_band: { total: 5, sections: {}, date: "2025-06-01" },
    ielts: { total: 7, sections: {}, date: "2026-12-01" },
  });
  const w = englishExpiry(e, "toefl", "harvard", { date: "2027-09-01", basis: "deadline" }, V);
  assert.deepEqual([w?.test, w?.takenOn, w?.expiresOn], ["toefl_band", "2025-06-01", "2027-06-01"]);
});

test("plan unset uses the newest dated result of any test", () => {
  const e = eng({ toefl: { total: 100, sections: {}, date: "2024-01-10" }, ielts: { total: 7, sections: {}, date: "2025-03-05" } });
  assert.equal(englishExpiry(e, null, "harvard", { date: "2028-01-01", basis: "deadline" }, V)?.test, "ielts");
  assert.equal(englishExpiry(e, undefined, "harvard", { date: "2028-01-01", basis: "deadline" }, V)?.test, "ielts");
});

test("no warning without a usable date", () => {
  assert.equal(englishExpiry(eng({ toefl: { total: 100, sections: {} } }), "toefl", "harvard", DL, V), null);
  assert.equal(englishExpiry(eng({ toefl: { total: 100, sections: {}, date: "2025-13-40" } }), "toefl", "harvard", DL, V), null);
  const ok = eng({ toefl: { total: 100, sections: {}, date: "2025-01-10" } });
  assert.equal(englishExpiry(ok, "not_required", "harvard", DL, V), null);
  assert.equal(englishExpiry(eng({ pte: { total: 70, sections: {}, date: "2020-01-10" } }), "pte", "harvard", DL, V), null);
  assert.equal(englishExpiry(ok, "toefl", "harvard", null, V), null);
  assert.equal(englishExpiry(undefined, "toefl", "harvard", DL, V), null);
  // another test's date does not count when the plan names a test
  assert.equal(englishExpiry(eng({ ielts: { total: 7, sections: {}, date: "2020-01-10" } }), "toefl", "harvard", DL, V), null);
});

test("Cambridge only with a university rule", () => {
  const e = eng({ cambridge: { total: 190, sections: {}, date: "2024-01-01" } });
  const rel = { date: "2027-01-01", basis: "course_start" } as const;
  assert.equal(englishExpiry(e, "cambridge", "ucl", rel, V), null);
  const w = englishExpiry(e, "cambridge", "cambridge", rel, V);
  assert.deepEqual([w?.test, w?.expiresOn], ["cambridge", "2026-01-01"]);
});

const row = (label: string, due: string, extra: object = {}) => ({
  id: label, institution_id: "i", cycle: "c", kind: "application", plan_key: null, label, due_date: due,
  notification_date: null, notification_note: null, notes: null, source_id: null, program_id: null, intake: null, ...extra,
});
const rows = [row("A", "2026-10-01", { plan_key: "RD" }), row("B", "2027-01-13", { plan_key: "RD" }), row("C", "2026-12-01", { plan_key: "ED" })];

test("course start basis", () => {
  assert.deepEqual(relevantEnglishDate("ucl", "planning", {}, null, rows, "2026-11-05", V), { date: "2027-09-01", basis: "course_start" });
});

test("AU uses a sourced semester start, else falls through to the deadline", () => {
  const V2 = { tests: V.tests, universities: { sydney: { measured_at: "course_start", semester_starts: { s1: "2027-03-01", s2: "2027-07-26" } } } };
  assert.equal(relevantEnglishDate("sydney", "planning", { intake: "s2" }, null, [], "2026-11-05", V2)?.date, "2027-07-26");
  assert.equal(relevantEnglishDate("sydney", "planning", {}, null, [], "2026-11-05", V2)?.date, "2027-03-01");
  const V3 = { tests: V.tests, universities: { sydney: { measured_at: "course_start", semester_starts: null } } };
  assert.equal(relevantEnglishDate("sydney", "planning", {}, null, [], "2026-11-05", V3), null);
});

test("deadline basis: earliest upcoming row for the plan", () => {
  assert.deepEqual(relevantEnglishDate("harvard", "planning", {}, "RD", rows, "2026-11-05", V), { date: "2027-01-13", basis: "deadline" });
  assert.equal(relevantEnglishDate("harvard", "planning", {}, null, rows, "2026-11-05", V)?.date, "2026-12-01");
  assert.equal(relevantEnglishDate("harvard", "planning", {}, "RD", rows, "2028-01-01", V), null);
});

test("no deadline warning once the application is in", () => {
  assert.equal(relevantEnglishDate("harvard", "submitted", {}, "RD", rows, "2026-11-05", V), null);
  assert.equal(relevantEnglishDate("harvard", "admitted", {}, "RD", rows, "2026-11-05", V), null);
  assert.equal(relevantEnglishDate("harvard", "in_progress", {}, "RD", rows, "2026-11-05", V)?.date, "2027-01-13");
  assert.equal(relevantEnglishDate("ucl", "admitted", {}, null, rows, "2026-11-05", V)?.basis, "course_start");
  assert.equal(relevantEnglishDate("ucl", "rejected", {}, null, rows, "2026-11-05", V), null);
  assert.equal(relevantEnglishDate("ucl", "withdrawn", {}, null, rows, "2026-11-05", V), null);
});

test("deadline basis uses the course deadline", () => {
  // Bath is a real GB entry with a course; its own row is dropped for the course's row.
  const id = "68edeaf5-8ef7-58ed-a954-e93d6828716d";
  const gbRows = [row("U", "2027-01-14"), row("CX", "2026-12-20", { program_id: id }), row("CY", "2026-11-20", { program_id: "other" })];
  assert.equal(relevantEnglishDate("bath", "planning", { course: "computer-science-bsc" }, null, gbRows, "2026-11-05", { tests: V.tests, universities: {} })?.date, "2026-12-20");
  assert.equal(relevantEnglishDate("bath", "planning", {}, null, gbRows, "2026-11-05", { tests: V.tests, universities: {} })?.date, "2027-01-14");
});

test("addMonths clamps", () => {
  assert.equal(addMonths("2024-02-29", 24), "2026-02-28");
  assert.equal(addMonths("2025-01-31", 1), "2025-02-28");
});

const HOSTS: Record<string, string[]> = {
  toefl: ["ets.org"],
  ielts: ["ielts.org"],
  duolingo: ["duolingo.com", "testcenter.zendesk.com"],
  pte: ["pearsonpte.com", "pearson.com"],
  cambridge: ["cambridgeenglish.org"],
};

test("real validity file is well formed", () => {
  assert.deepEqual(Object.keys(VALIDITY.tests).sort(), Object.keys(HOSTS).sort());
  for (const [k, v] of Object.entries(VALIDITY.tests)) {
    const u = new URL(v.source_url);
    assert.equal(u.protocol, "https:", k);
    assert.ok(HOSTS[k].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`)), `${k} host ${u.hostname}`);
    assert.ok(isIsoDate(v.verified_on) && v.verified_on <= "2026-11-05", `${k} verified_on`);
    assert.ok(v.months === null || (Number.isInteger(v.months) && v.months > 0), `${k} months`);
  }
  for (const [slug, u] of Object.entries(VALIDITY.universities)) {
    assert.notEqual(countryOf(slug), "US", slug);
    assert.ok(isIsoDate(u.verified_on) && u.verified_on <= "2026-11-05", `${slug} verified_on`);
  }
});
