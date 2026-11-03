// A Free student who approves an AI on the consent page may have no student_profiles row (nothing else creates one for a new
// account), and the Connect AI tools refuse an account without one. ensureStudentProfile makes the row just before the approval.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { ENSURE_PROFILE_OPTIONS, ensureProfileRow, ensureStudentProfile } from "./student-rows.ts";

type Call = { row: { user_id: string }; options: { onConflict: string; ignoreDuplicates: boolean } };
const recorder = (result: { error: { message: string } | null } | Error = { error: null }) => {
  const calls: Call[] = [];
  const upsert = async (row: Call["row"], options: Call["options"]) => {
    calls.push({ row, options });
    if (result instanceof Error) throw result;
    return result;
  };
  return { calls, upsert };
};

test("a student gets one upsert of user_id alone that ignores duplicates (writes nothing when the row exists)", async () => {
  const { calls, upsert } = recorder();
  assert.deepEqual(await ensureStudentProfile("student", "u1", upsert), { ok: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].row, { user_id: "u1" });
  assert.deepEqual(calls[0].options, { onConflict: "user_id", ignoreDuplicates: true });
  assert.deepEqual(ensureProfileRow("u2"), { user_id: "u2" });
  assert.equal(ENSURE_PROFILE_OPTIONS.ignoreDuplicates, true);
});

test("a teacher, an account with no role and a role still loading never get a student profile", async () => {
  for (const role of ["teacher", null, undefined, ""]) {
    const { calls, upsert } = recorder();
    assert.deepEqual(await ensureStudentProfile(role, "u1", upsert), { ok: true });
    assert.equal(calls.length, 0, `role ${String(role)}`);
  }
});

test("a failed write comes back as its message, whether the client returned the error or threw", async () => {
  const returned = recorder({ error: { message: "permission denied for table student_profiles" } });
  assert.deepEqual(await ensureStudentProfile("student", "u1", returned.upsert), { ok: false, message: "permission denied for table student_profiles" });
  const thrown = recorder(new Error("Failed to fetch"));
  assert.deepEqual(await ensureStudentProfile("student", "u1", thrown.upsert), { ok: false, message: "Failed to fetch" });
});

test("the consent page makes the row first and only then approves; a failure shows the page's error and approves nothing", () => {
  const src = readFileSync(new URL("../components/OAuthConsent.tsx", import.meta.url), "utf8");
  const decide = src.slice(src.indexOf("const decide"), src.indexOf("const toConnect"));
  assert.ok(decide.length > 200, "decide() not found");
  const ensure = decide.indexOf("ensureStudentProfile(student.role, student.auth.userId,");
  const approve = decide.indexOf("oauth.approveAuthorization(");
  assert.ok(ensure > 0 && approve > ensure, "the profile row must be ensured before approveAuthorization");
  // Only an approval writes it (a denial never does), and the table written is the student's own profile.
  assert.match(decide, /if \(approve && student\.auth\) \{/);
  assert.match(decide, /from\("student_profiles"\)\.upsert\(row, options\)/);
  // A failed write ends decide() in the page's error state before anything is approved.
  assert.match(decide, /if \(!ensured\.ok\) \{\s*setBusy\(null\);\s*setLoad\(\{ state: "error", message: ensured\.message \}\);\s*return;\s*\}/);
});
