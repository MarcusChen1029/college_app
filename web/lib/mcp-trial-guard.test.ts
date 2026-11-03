// The Connect AI free trial (migration 0051) lets a Free account call every tool declared a read and spend three changes on
// the rest. A write tool declared a read would give Free unlimited changes, so the split is checked against the source:
// tools.ts can't be loaded by node --test (server-only, Next's cached data layer), so, like ai-views.test.ts, it is read as text.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const tools = read("./mcp/tools.ts");
const sql = read("../../supabase/migrations/0051_ai_trial_and_weekly.sql");

/** Every `server.registerTool(` block: its name, its annotations constant and whether guarded() declares it a read. */
const blocks = tools
  .split("server.registerTool(")
  .slice(1)
  .map((b) => ({
    name: /^\s*"([a-z_]+)"/.exec(b)?.[1] ?? "?",
    annotations: /annotations:\s*(READ|WRITE|DESTROY)\b/.exec(b)?.[1],
    guarded: (b.match(/\bguarded\(/g) ?? []).length,
    declaredRead: /\{\s*read:\s*true\s*\}\s*\)/.test(b),
    body: b,
  }));

const READS = ["get_profile", "get_applications", "get_upcoming_deadlines", "get_weekly_changes", "get_activities", "get_resume_settings", "search_colleges", "get_college", "get_context_pack", "get_transcript_format", "get_transcript"];
const WRITES = [
  "update_profile",
  "add_college",
  "set_interested",
  "update_application",
  "update_checklist",
  "add_essay",
  "update_essay",
  "add_activity",
  "update_activity",
  "delete_activity",
  "update_resume_settings",
  "add_transcript_courses",
  "update_transcript_course",
  "delete_transcript_course",
];

test("every tool goes through guarded() exactly once", () => {
  assert.equal(blocks.length, READS.length + WRITES.length);
  for (const b of blocks) assert.equal(b.guarded, 1, `${b.name} must be wrapped in guarded() once`);
});

test("exactly the read-only tools declare { read: true }; every other tool is a write (fail closed)", () => {
  assert.deepEqual(blocks.filter((b) => b.declaredRead).map((b) => b.name).sort(), [...READS].sort());
  assert.deepEqual(blocks.filter((b) => !b.declaredRead).map((b) => b.name).sort(), [...WRITES].sort());
});

test("the { read: true } declaration agrees with the tool's own annotation", () => {
  for (const b of blocks) {
    if (b.declaredRead) assert.equal(b.annotations, "READ", `${b.name} is declared a read but annotated ${b.annotations}`);
    else assert.ok(b.annotations === "WRITE" || b.annotations === "DESTROY", `${b.name} is a write but annotated ${b.annotations}`);
  }
});

test("a tool declared a read never changes anything", () => {
  for (const b of blocks.filter((x) => x.declaredRead)) {
    assert.doesNotMatch(b.body, /\b(changeProfile|changeEntry)\(/, `${b.name} is a read but calls a change helper`);
    assert.doesNotMatch(b.body, /\.(insert|update|delete|upsert|rpc)\(/, `${b.name} is a read but writes or calls an rpc`);
  }
});

test("guarded() reads the counter and spends a change through exactly the two functions migration 0051 lets an AI token call", () => {
  assert.deepEqual([...tools.matchAll(/\.rpc\(\s*"([a-z_]+)"/g)].map((m) => m[1]).sort(), ["ai_trial_writes_left", "consume_ai_trial_write"]);
  const guard = /if p in \(([^)]*)\)/.exec(sql.replace(/--.*$/gm, ""))?.[1] ?? "";
  const allowed = guard.split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.ok(allowed.includes("rpc/ai_trial_writes_left") && allowed.includes("rpc/consume_ai_trial_write"));
  assert.equal(allowed.filter((p) => p.startsWith("rpc/")).length, 2, "an AI token may call these two functions and no other");
});
