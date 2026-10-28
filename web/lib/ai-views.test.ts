// The Connect AI tools reach the profile and the list only through the views of migration 0041 section 1e. These checks
// keep the TypeScript column lists, the SQL views and the pre-request hook in step, and keep logins out of the views.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { AI_COLLEGE_COLUMNS, AI_PROFILE_COLUMNS, fromAiCollegeRow } from "./student-rows.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const m0041 = read("../../supabase/migrations/0041_security_hardening.sql");
const m0043 = read("../../supabase/migrations/0043_forbid_new_plaintext.sql");
const tools = read("./mcp/tools.ts");

const list = (s: string) => s.split(",").map((c) => c.trim()).filter(Boolean);
/** The output column names of `create view public.<name> ... as select <list> from`. */
function viewColumns(name: string): string[] {
  // Up to the FROM of the base table (the slug subquery has a FROM of its own).
  const m = new RegExp(`create view public\\.${name}\\b[^]*?\\bas\\s+select\\s+([^]*?)\\s+from\\s+public\\.student_(?:profiles|colleges)\\b`, "i").exec(m0041);
  assert.ok(m, `0041 has no view ${name}`);
  return list(m[1]).map((item) => /\bas\s+(\w+)$/i.exec(item)?.[1] ?? item.replace(/^\w+\./, ""));
}
const sorted = (a: string[]) => [...a].sort();

const NEVER = ["portals", "portal_url", "portal_username", "portal_password", "reminder_emails", "reminder_days", "essays", "app_essays", "aid_offer_usd", "custom", "display_name", "study_fields", "needs_aid"];

test("each AI view has exactly the columns its TypeScript list reads, plus user_id and updated_at", () => {
  assert.deepEqual(sorted(viewColumns("ai_student_profiles")), sorted([...list(AI_PROFILE_COLUMNS), "user_id", "updated_at"]));
  assert.deepEqual(sorted(viewColumns("ai_student_colleges")), sorted([...list(AI_COLLEGE_COLUMNS), "user_id", "updated_at"]));
});

test("no saved login, reminder, essay or aid column is in an AI view", () => {
  for (const v of ["ai_student_profiles", "ai_student_colleges"]) {
    const cols = viewColumns(v);
    for (const c of NEVER) assert.ok(!cols.includes(c), `${v} exposes ${c}`);
  }
});

test("the MCP tools never name the base student_profiles / student_colleges tables", () => {
  assert.doesNotMatch(tools, /["'`]student_(profiles|colleges)["'`]/);
  assert.match(tools, /from\("ai_student_profiles"\)/);
  assert.match(tools, /from\("ai_student_colleges"\)/);
});

test("after 0043 the pre-request hook lets an OAuth token reach only the two views and the transcript tables", () => {
  const guards = [...m0043.matchAll(/create or replace function public\.api_request_guard\(\)[^]*?if p in \(([^)]*)\)/g)];
  assert.equal(guards.length, 1);
  const allowed = list(guards[0][1]).map((s) => s.replace(/'/g, ""));
  assert.deepEqual(sorted(allowed), sorted(["ai_student_profiles", "ai_student_colleges", "transcript_schools", "transcript_courses"]));
});

test("an AI view row maps to a list entry with no login", () => {
  const e = fromAiCollegeRow({ institution_id: "i1", slug: "mit", plan_key: "EA", status: "in_progress", notes: null, checklist: null, created_at: "2026-10-29T00:00:00Z" });
  assert.deepEqual(e, { slug: "mit", institutionId: "i1", plan: "EA", status: "in_progress", notes: "", checklist: {}, portal: { url: "", username: "" }, addedAt: "2026-10-29T00:00:00Z" });
});
