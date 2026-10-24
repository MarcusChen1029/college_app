import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRows } from "./roster-view.ts";
import { ROSTER_CSV_HEADER, rosterCsv, rosterCsvFilename } from "./roster-export.ts";
import type { RosterStudent } from "./roster.ts";

const NOW = new Date(2026, 9, 24, 15, 0);
const sam: RosterStudent = {
  studentId: "s1",
  displayName: "Sam Rivera",
  email: "sam@example.com",
  linkedAt: "2026-10-01T00:00:00Z",
  classIds: ["c1", "gone"],
  satTotal: 1420,
  actComposite: null,
  gpaUnweighted: 3.85,
  isInternational: true,
  lastActive: "2026-10-22T10:30:00Z",
  colleges: [{ slug: "mit", name: "MIT", status: "in_progress", plan: "ea", checklist: { recommendations: true }, nextDeadline: "2026-10-30" }],
};
const lines = (csv: string) => csv.split("\r\n");

test("header row, then one row per student", () => {
  const out = lines(rosterCsv(buildRows([sam], NOW), new Map([["c1", "AP Seniors"]])));
  assert.equal(out[0], ROSTER_CSV_HEADER.join(","));
  assert.equal(out.length, 2);
});

test("a row carries scores, counts, next deadline, flag labels and the last-active date", () => {
  const out = lines(rosterCsv(buildRows([sam], NOW), new Map([["c1", "AP Seniors"]])));
  assert.equal(out[1], "Sam Rivera,sam@example.com,AP Seniors,1420,,3.85,Yes,1,1,1,5,2026-10-30,MIT,Deadline soon; Essay not started,2026-10-22");
});

test("student-controlled text that starts like a formula is neutralised", () => {
  const evil = { ...sam, displayName: "=cmd|' /C calc'!A0", email: "x@example.com" };
  const row = lines(rosterCsv(buildRows([evil], NOW), new Map()))[1];
  assert.ok(row.startsWith("'=cmd|"));
});

test("every student-controlled text column is neutralised, not just the name", () => {
  const evil = { ...sam, email: "=a@b.com", colleges: [{ ...sam.colleges[0], name: "@Evil U" }] };
  const row = lines(rosterCsv(buildRows([evil], NOW), new Map([["c1", "+Class"]])))[1];
  assert.ok(row.includes(",'=a@b.com,"));
  assert.ok(row.includes(",'+Class,"));
  assert.ok(row.includes(",'@Evil U,"));
});

test("a student with nothing yet gives empty cells, not 'null'", () => {
  const empty = { ...sam, classIds: [], satTotal: null, gpaUnweighted: null, lastActive: null, colleges: [], isInternational: false };
  const row = lines(rosterCsv(buildRows([empty], NOW), new Map()))[1];
  assert.ok(!row.includes("null") && !row.includes("undefined"));
  assert.ok(row.startsWith("Sam Rivera,sam@example.com,,,,,No,0,0,0,0,,,"));
});

test("no secret-bearing column is ever in the header", () => {
  const h = ROSTER_CSV_HEADER.join(" ").toLowerCase();
  for (const word of ["password", "portal", "note", "essay", "resume"]) assert.ok(!h.includes(word), word);
});

test("filename uses the local date", () => {
  assert.equal(rosterCsvFilename(NOW), "students-2026-10-24.csv");
});
