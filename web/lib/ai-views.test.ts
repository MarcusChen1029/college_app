// The Connect AI tools reach the profile and the list only through the views of migration 0041 section 1e (later
// migrations may redefine them, e.g. 0044 adds plan_windows). These checks keep the TypeScript column lists, the SQL
// views (as last defined) and the pre-request hook in step, and keep logins out of the views.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { AI_COLLEGE_COLUMNS, AI_PROFILE_COLUMNS, fromAiCollegeRow } from "./student-rows.ts";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const m0043 = read("../../supabase/migrations/0043_forbid_new_plaintext.sql");
const tools = read("./mcp/tools.ts");

/** Every numbered migration file, oldest first (by number, not by name). */
const migrations = readdirSync(new URL("../../supabase/migrations/", import.meta.url))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
const migration = (file: string) => read(`../../supabase/migrations/${file}`);

const list = (s: string) => s.split(",").map((c) => c.trim()).filter(Boolean);
const viewStart = (name: string) => `create\\s+(?:or\\s+replace\\s+)?view\\s+public\\.${name}\\b`;
/** The migration files that (re)define view public.<name>, oldest first. */
const definingFiles = (name: string) => migrations.filter((f) => new RegExp(viewStart(name), "i").test(migration(f)));
/** The output column names of the last `create [or replace] view public.<name> ... as select <list> from` in one file. */
function columnsIn(file: string, name: string): string[] {
  // Up to the FROM of the base table (the slug subquery has a FROM of its own).
  const re = new RegExp(`${viewStart(name)}[^]*?\\bas\\s+select\\s+([^]*?)\\s+from\\s+public\\.student_(?:profiles|colleges)\\b`, "gi");
  const all = [...migration(file).matchAll(re)];
  assert.ok(all.length > 0, `${file} has no parsable definition of view ${name}`);
  return list(all[all.length - 1][1]).map((item) => /\bas\s+(\w+)$/i.exec(item)?.[1] ?? item.replace(/^\w+\./, ""));
}
/** The output columns of view public.<name> as the LAST migration (by number) that defines it leaves it. */
function viewColumns(name: string): string[] {
  const files = definingFiles(name);
  assert.ok(files.length > 0, `no migration defines view ${name}`);
  return columnsIn(files[files.length - 1], name);
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

test("a redefined AI view only appends columns (CREATE OR REPLACE VIEW keeps the old ones, in order)", () => {
  for (const v of ["ai_student_profiles", "ai_student_colleges"]) {
    const defs = definingFiles(v).map((f) => columnsIn(f, v));
    for (let i = 1; i < defs.length; i++) assert.deepEqual(defs[i].slice(0, defs[i - 1].length), defs[i - 1], `${v}: definition ${i + 1} reorders or drops columns`);
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
