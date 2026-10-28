// node --test scripts/check_activities_sql.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { compare, functionSql, jsonDiff, parseResults } from "./check_activities_sql.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT = join(ROOT, "scripts", "check_activities_sql.mjs");
const v1 = JSON.parse(readFileSync(join(ROOT, "web/lib/fixtures/activities-v1.json"), "utf8"));
const v2 = JSON.parse(readFileSync(join(ROOT, "web/lib/fixtures/activities-v2.json"), "utf8"));
const lf = (s) => s.replace(/\r\n/g, "\n");
const migration = lf(readFileSync(join(ROOT, "supabase/migrations/0038_activities_v2.sql"), "utf8"));
const dir = mkdtempSync(join(tmpdir(), "activities-sql-"));

/** The rows execute_sql would return if the SQL matched the fixture exactly. */
const perfectRows = () => v2.map((s) => ({ k: s.student, v2: structuredClone(s.activities) }));

function run(args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: "utf8" });
  return { code: r.status, out: r.stdout + r.stderr };
}

function runOn(rows, name, wrap = (s) => s) {
  const file = join(dir, name);
  writeFileSync(file, wrap(JSON.stringify(rows)));
  return run([file]);
}

/** Rebuilds every object with its keys reversed (jsonb does not keep key order). */
const reverseKeys = (v) =>
  Array.isArray(v) ? v.map(reverseKeys) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).reverse().map((k) => [k, reverseKeys(v[k])])) : v;

test("the v2 fixture compared with itself passes (exit 0)", () => {
  const r = runOn(perfectRows(), "same.json");
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /parity OK: 8\/8/);
});

test("key order, MCP wrapper text and v2 as a JSON string do not matter", () => {
  const rows = perfectRows().map((row, i) => ({ k: row.k, v2: i % 2 ? JSON.stringify(reverseKeys(row.v2)) : reverseKeys(row.v2) }));
  const r = runOn(rows, "wrapped.json", (s) => `Below is the result of the SQL query.\n<untrusted-data-1>\n${s}\n</untrusted-data-1>`);
  assert.equal(r.code, 0, r.out);
});

test("a changed value fails (exit 1) and the diff names the student and path", () => {
  const rows = perfectRows();
  rows.find((r) => r.k === "edge-rules").v2.uc[5].legacy = "From your earlier version: 7.50 hours/week, 12 weeks/year";
  const r = runOn(rows, "mutated.json");
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /edge-rules: \$\.uc\[5\]\.legacy: expected "From your earlier version: 7\.5 hours\/week, 12 weeks\/year"/);
});

test("null versus a missing key, an extra key, a missing student and a wrong count all fail", () => {
  const nullVsMissing = perfectRows();
  nullVsMissing[0].v2.commonApp.activities[0].legacy = null;
  assert.equal(runOn(nullVsMissing, "null.json").code, 1);

  const missingKey = perfectRows();
  delete missingKey[3].v2.uc[0].fromId;
  const r = runOn(missingKey, "missing-key.json");
  assert.equal(r.code, 1);
  assert.match(r.out, /uc-categories: \$\.uc\[0\]\.fromId: missing/);

  const missingStudent = perfectRows().slice(1);
  assert.match(runOn(missingStudent, "missing-student.json").out, /types-1-10: no row returned/);

  const extraItem = perfectRows();
  extraItem[7].v2.uc.push({});
  assert.match(runOn(extraItem, "extra-item.json").out, /empty-profile: \$\.uc: expected 0 items, got 1/);

  const numberAsString = perfectRows();
  numberAsString[0].v2.commonApp.activities[0].hoursPerWeek = "5.5";
  assert.equal(runOn(numberAsString, "string-number.json").code, 1);
});

test("jsonDiff and compare agree on equal values; parseResults reads the MCP's text", () => {
  assert.deepEqual(jsonDiff({ a: [1, { b: null }] }, { a: [1, { b: null }] }), []);
  assert.deepEqual(compare(perfectRows(), v2), []);
  assert.deepEqual(parseResults('noise [{"k":"x","v2":"{\\"version\\":2}"}] noise'), [{ k: "x", v2: { version: 2 } }]);
});

test("--generate writes the migration's function into pg_temp plus one row per v1 student", () => {
  const out = join(dir, "parity.sql");
  const r = run(["--generate", out]);
  assert.equal(r.code, 0, r.out);
  const sql = readFileSync(out, "utf8");
  assert.ok(sql.includes("create or replace function pg_temp.activities_v2(p jsonb)"));
  assert.ok(!sql.includes("public.activities_v2("));
  // The function body is the migration's, character for character.
  assert.ok(sql.includes(functionSql(migration).replace("public.activities_v2(", "pg_temp.activities_v2(")));
  for (const s of v1) assert.ok(sql.includes(`'${s.student}', '${JSON.stringify(s.activities).replace(/'/g, "''")}'::jsonb`), s.student);
  assert.equal((sql.slice(sql.indexOf("from (values")).match(/::jsonb\)(,|\n\))/g) ?? []).length, v1.length);
  // The committed patch is up to date.
  assert.equal(lf(readFileSync(join(ROOT, "supabase/patches/2026-10-28-activities-v2-parity.sql"), "utf8")), sql);
});
