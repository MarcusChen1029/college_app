// Citizenship: the code list, the profile row mapping and fallback, and the places it must never reach.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CITIZENSHIP_OPTIONS, normalCitizenship } from "./citizenship.ts";
import { applyProfilePatch } from "./mcp/rules.ts";
import {
  AI_PROFILE_COLUMNS,
  fromProfile,
  PROFILE_COLUMN_FALLBACKS,
  PROFILE_COLUMNS,
  PROFILE_COLUMNS_BEFORE_CITIZENSHIP,
  readProfileRow,
  toProfile,
  UNDEFINED_COLUMN,
  type ProfileRow,
} from "./student-rows.ts";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const uid = "u1";
const profileRow: ProfileRow = {
  sat_total: null,
  act_composite: null,
  gpa_unweighted: null,
  is_international: true,
  target_regions: ["GB"],
  reminder_emails: true,
  plan: "free",
  test_details: null,
  interested: null,
  activities: null,
  resume: null,
  essays: null,
};
const profile = toProfile(profileRow);

test("normalCitizenship", () => {
  for (const ok of CITIZENSHIP_OPTIONS) assert.equal(normalCitizenship(ok), ok);
  for (const ok of ["TW", "GB", "ZZ"]) assert.equal(normalCitizenship(ok), ok);
  for (const bad of ["tw", "TWN", "", null, undefined, 7, "G1", "UK", "FR"]) assert.equal(normalCitizenship(bad), null); // only CITIZENSHIP_OPTIONS
});

test("profile round trip", () => {
  assert.equal(toProfile({ ...profileRow, citizenship: "TW" }).citizenship, "TW");
  assert.equal(toProfile({ ...profileRow, citizenship: "bad" }).citizenship, null);
  assert.equal(toProfile(profileRow).citizenship, null, "a row read without the column");
  assert.equal(fromProfile(uid, { ...profile, citizenship: "GB" }).citizenship, "GB");
  assert.equal(fromProfile(uid, { ...profile, citizenship: null }).citizenship, null, "cleared");
  assert.equal(fromProfile(uid, { ...profile, citizenship: "UK" }).citizenship, null, "never an unknown code");
  assert.ok(!("citizenship" in fromProfile(uid, { ...profile, citizenship: undefined })));
  // With the column-missing flag set (after a select that failed on citizenship): no citizenship key either, so a save still works.
  assert.ok(!("citizenship" in fromProfile(uid, { ...profile, citizenship: "GB" }, undefined, { citizenshipColumn: false })));
  assert.equal(fromProfile(uid, { ...profile, citizenship: "GB" }, undefined, { citizenshipColumn: true }).citizenship, "GB");
  assert.match(PROFILE_COLUMNS, /\bcitizenship\b/);
});

test("the select fallback drops only citizenship first, then follows the older chain", async () => {
  const all = PROFILE_COLUMNS.split(", ");
  assert.deepEqual(PROFILE_COLUMNS_BEFORE_CITIZENSHIP.split(", "), all.filter((c) => c !== "citizenship"));
  assert.equal(PROFILE_COLUMN_FALLBACKS[0], PROFILE_COLUMNS_BEFORE_CITIZENSHIP);
  // Only citizenship missing: the second read works and still has weekly_digest.
  const asked: string[] = [];
  const r = await readProfileRow(async (columns) => {
    asked.push(columns);
    return columns.split(", ").includes("citizenship") ? { data: null as unknown, error: { code: UNDEFINED_COLUMN } } : { data: {} as unknown, error: null };
  });
  assert.equal(r.error, null);
  assert.deepEqual(asked, [PROFILE_COLUMNS, PROFILE_COLUMNS_BEFORE_CITIZENSHIP]);
  assert.ok(PROFILE_COLUMNS_BEFORE_CITIZENSHIP.includes("weekly_digest"));
});

test("every profile save in the store passes the column-known flag", () => {
  const store = read("./student-store.ts");
  const saves = store.match(/fromProfile\([^)]*\)/g) ?? [];
  assert.equal(saves.length, 3);
  for (const call of saves) assert.match(call, /\{ citizenshipColumn \}/, call);
  assert.match(store, /citizenshipColumn = lastColumns\.split\(", "\)\.includes\(CITIZENSHIP_COLUMN\)/);
});

test("never in the AI columns", () => {
  assert.doesNotMatch(AI_PROFILE_COLUMNS, /citizenship/);
  for (const file of ["./ai-context.ts", "./mcp/tools.ts", "./mcp/prompts.ts", "../app/mcp/route.ts"]) {
    assert.doesNotMatch(read(file).replace(/\/\/.*$/gm, ""), /citizenship/i, file);
  }
});

test("MCP profile patch refuses citizenship", () => {
  const r = applyProfilePatch({}, { citizenship: "GB" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /citizenship/i);
  assert.equal(applyProfilePatch({}, { gpa: 3.5, citizenship: null }).ok, false);
  assert.equal((read("./mcp/rules.ts").match(/^\s*citizenship:/gm) ?? []).length, 1, "one entry in the refusal map");
});
