// The Free plan's college limit is enforced twice: by the web app (FREE_LIMIT in plans.ts) and by the database
// (migration 0046, trigger plan_limit on student_colleges). These checks keep the SQL's number, message and date rule
// in step with the TypeScript, so changing one without the other fails here.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { FREE_LIMIT } from "./plans.ts";

const sql = readFileSync(new URL("../../supabase/migrations/0046_plan_limit.sql", import.meta.url), "utf8");
// Code without comments: a number or a name in a comment must not satisfy a check.
const code = sql.replace(/--.*$/gm, "");

test("the trigger refuses at FREE_LIMIT colleges (the one number after >=)", () => {
  const found = [...code.matchAll(/>=\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.deepEqual(found, [FREE_LIMIT]);
});

test("the error message names the same limit, with errcode P0001 and hint plan_limit", () => {
  const messages = [...code.matchAll(/'Plan limit reached: the Free plan holds (\d+) colleges\.'/g)].map((m) => Number(m[1]));
  assert.deepEqual(messages, [FREE_LIMIT]);
  assert.match(code, /errcode\s*=\s*'P0001'/);
  assert.match(code, /hint\s*=\s*'plan_limit'/);
});

test("a pass is active on the Taipei calendar, from and until both inclusive (same rule as activeWindow)", () => {
  assert.match(code, /now\(\)\s+at\s+time\s+zone\s+'Asia\/Taipei'/i);
  assert.match(code, /\(w\s*->>\s*'from'\)::date\s*<=\s*today\s+and\s+today\s*<=\s*\(w\s*->>\s*'until'\)::date/);
  assert.doesNotMatch(code, /\bplan\s*=\s*'senior'/, "the flag column must not decide; the windows do");
});

test("the trigger fires before every insert into student_colleges, under the owner's advisory lock", () => {
  assert.match(code, /create\s+trigger\s+plan_limit\s+before\s+insert\s+on\s+public\.student_colleges\s+for\s+each\s+row\s+execute\s+function\s+public\.enforce_plan_limit\(\)/i);
  assert.match(code, /pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('plan_limit:'\s*\|\|\s*new\.user_id::text,\s*0\)\s*\)/);
  assert.match(code, /count\(\*\)[^;]*from\s+public\.student_colleges\s+where\s+user_id\s*=\s*new\.user_id/i, "every row of the owner counts, custom colleges included");
});

test("the function is security definer with an empty search_path and nobody may execute it", () => {
  assert.match(code, /create\s+function\s+public\.enforce_plan_limit\(\)\s+returns\s+trigger\s+language\s+plpgsql\s+security\s+definer\s+set\s+search_path\s*=\s*''/i);
  assert.match(code, /revoke\s+all\s+on\s+function\s+public\.enforce_plan_limit\(\)\s+from\s+public,\s*anon,\s*authenticated/i);
});
