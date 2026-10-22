import assert from "node:assert/strict";
import { test } from "node:test";
import { CA_LIMITS, UC_LIMITS, type ActivityData } from "./activities.ts";
import {
  addActivity,
  addEssay,
  applyProfilePatch,
  applyResumePatch,
  checkAddCollege,
  checkPlanKey,
  checkSetInterested,
  checkStatusChange,
  deleteActivity,
  edWarnings,
  isSenior,
  patchChecklist,
  updateActivity,
  updateEssay,
  upcomingDeadlines,
} from "./mcp/rules.ts";
import type { Checklist } from "./checklist.ts";
import type { Deadline } from "./types.ts";

const complete: Checklist = { recommendations: true, transcript: true, no_essays: true, test_plan: "optional", english_plan: "not_required" };

test("only the senior plan passes the gate", () => {
  assert.equal(isSenior("senior"), true);
  assert.equal(isSenior("junior"), false);
  assert.equal(isSenior("free"), false);
  assert.equal(isSenior(undefined), false);
});

test("add college: duplicate, plan limit and offered plans", () => {
  const base = { studentPlan: "senior", listedSlugs: ["rice"], offeredPlans: ["ED", "RD"] };
  assert.equal(checkAddCollege({ ...base, slug: "rice" }).ok, false);
  const added = checkAddCollege({ ...base, slug: "brown", plan: "ED" });
  assert.deepEqual(added.ok && added.value, { plan: "ED" });
  const noPlan = checkAddCollege({ ...base, slug: "brown" });
  assert.deepEqual(noPlan.ok && noPlan.value, { plan: null });
  const full = checkAddCollege({ ...base, studentPlan: "free", listedSlugs: ["a", "b", "c"], slug: "brown" });
  assert.equal(full.ok, false);
  assert.match(!full.ok ? full.error : "", /full/);
  const bad = checkAddCollege({ ...base, slug: "brown", plan: "EA" });
  assert.equal(bad.ok, false);
  assert.match(!bad.ok ? bad.error : "", /doesn't offer "EA"/);
});

test("plan key must be one the college offers; null clears it", () => {
  assert.equal(checkPlanKey("EA", ["ED", "RD"]).ok, false);
  assert.equal(checkPlanKey("EA", null).ok, false);
  assert.equal(checkPlanKey("RD", ["ED", "RD"]).ok, true);
  const cleared = checkPlanKey(null, []);
  assert.deepEqual(cleared.ok && cleared.value, null);
});

test("interested: cannot mark a listed college, removing is always fine", () => {
  assert.equal(checkSetInterested({ interested: [], listedSlugs: ["rice"], slug: "rice", value: true }).ok, false);
  const add = checkSetInterested({ interested: ["a"], listedSlugs: [], slug: "b", value: true });
  assert.deepEqual(add.ok && add.value, ["a", "b"]);
  const again = checkSetInterested({ interested: ["a"], listedSlugs: [], slug: "a", value: true });
  assert.deepEqual(again.ok && again.value, ["a"]);
  const rm = checkSetInterested({ interested: ["a", "b"], listedSlugs: [], slug: "a", value: false });
  assert.deepEqual(rm.ok && rm.value, ["b"]);
});

test("status: submitted only with a complete checklist", () => {
  const blocked = checkStatusChange("in_progress", "submitted", { transcript: true });
  assert.equal(blocked.ok, false);
  assert.match(!blocked.ok ? blocked.error : "", /Essays/);
  assert.equal(checkStatusChange("in_progress", "submitted", complete).ok, true);
});

test("status: decisions only after submission", () => {
  assert.equal(checkStatusChange("in_progress", "admitted", complete).ok, false);
  assert.equal(checkStatusChange("in_progress", "withdrawn", complete).ok, false);
  assert.equal(checkStatusChange("submitted", "admitted", {}).ok, true);
  assert.equal(checkStatusChange("admitted", "enrolled", {}).ok, true);
  assert.equal(checkStatusChange("admitted", "submitted", {}).ok, true);
});

test("status: cannot go back to in progress once a decision is recorded", () => {
  assert.equal(checkStatusChange("rejected", "in_progress", {}).ok, false);
  assert.equal(checkStatusChange("submitted", "in_progress", {}).ok, true);
});

test("ED at two colleges produces a warning", () => {
  const entries = [
    { slug: "rice", plan: "ED" },
    { slug: "brown", plan: "ED" },
    { slug: "yale", plan: "EA" },
  ];
  assert.equal(edWarnings(entries, "brown").length, 1);
  assert.match(edWarnings(entries, "brown")[0], /rice/);
  assert.deepEqual(edWarnings(entries, "yale"), []);
  assert.deepEqual(edWarnings([{ slug: "rice", plan: "ED" }, { slug: "yale", plan: "RD" }], "rice"), []);
  assert.equal(edWarnings([{ slug: "a", plan: "ED2" }, { slug: "b", plan: "ED" }], "a").length, 1);
});

test("checklist patch validates keys and values", () => {
  const ok = patchChecklist({}, { recommendations: true, test_plan: "sat", english_plan: null });
  assert.deepEqual(ok.ok && ok.value, { recommendations: true, test_plan: "sat", english_plan: null });
  assert.equal(patchChecklist({}, { recommendations: "yes" }).ok, false);
  assert.equal(patchChecklist({}, { test_plan: "gre" }).ok, false);
  assert.equal(patchChecklist({}, { essay_list: [] }).ok, false);
});

test("essays: add and update, urls must be http(s), status must be known", () => {
  const added = addEssay({ no_essays: true }, { title: "Why Rice", url: "https://docs.google.com/d/1", status: "drafting" });
  assert.ok(added.ok);
  assert.equal(added.value.checklist.no_essays, false);
  assert.equal(added.value.checklist.essay_list?.length, 1);
  assert.equal(added.value.essay.url, "https://docs.google.com/d/1");

  assert.equal(addEssay({}, { title: "x", url: "javascript:alert(1)" }).ok, false);
  assert.equal(addEssay({}, { title: "x", status: "done" }).ok, false);
  assert.equal(addEssay({}, { title: "  " }).ok, false);
  assert.equal(addEssay({}, {}).ok, false);

  const id = added.value.essay.id;
  const upd = updateEssay(added.value.checklist, id, { status: "final" });
  assert.ok(upd.ok);
  assert.equal(upd.value.checklist.essay_list?.[0].status, "final");
  assert.equal(upd.value.checklist.essay_list?.[0].title, "Why Rice");
  assert.equal(updateEssay(added.value.checklist, id, { url: "ftp://x" }).ok, false);
  assert.equal(updateEssay(added.value.checklist, "nope", { status: "final" }).ok, false);
  // Like the website, an existing essay can go back to untitled (adding one still needs a title).
  const cleared = updateEssay(added.value.checklist, id, { title: "  " });
  assert.ok(cleared.ok);
  assert.equal(cleared.value.essay.title, "");
});

test("essays cannot be removed: updating never shrinks the list and the module has no delete", async () => {
  const mod = await import("./mcp/rules.ts");
  assert.equal(Object.keys(mod).some((k) => /deleteEssay|removeEssay/i.test(k)), false);
  const added = addEssay({}, { title: "A" });
  assert.ok(added.ok);
  const upd = updateEssay(added.value.checklist, added.value.essay.id, { title: "B" });
  assert.ok(upd.ok);
  assert.equal(upd.value.checklist.essay_list?.length, 1);
});

test("activities: add, update, delete a Common App activity", () => {
  const added = addActivity(undefined, "common_app_activity", { type: "Robotics", position: "Captain", organization: "FRC 1234", description: "Led 20 students.", grades: ["10", "11"], hoursPerWeek: 12 });
  assert.ok(added.ok);
  assert.equal(added.value.data.commonApp.activities.length, 1);
  const id = added.value.item.id;

  const upd = updateActivity(added.value.data, "common_app_activity", id, { hoursPerWeek: 15, weeksPerYear: 40 });
  assert.ok(upd.ok);
  assert.equal(upd.value.data.commonApp.activities[0].hoursPerWeek, 15);
  assert.equal(upd.value.data.commonApp.activities[0].position, "Captain");

  const del = deleteActivity(upd.value.data, "common_app_activity", id);
  assert.ok(del.ok);
  assert.equal(del.value.data.commonApp.activities.length, 0);
  assert.equal(deleteActivity(del.value.data, "common_app_activity", id).ok, false);
});

test("activities: counts are limited per kind", () => {
  let data: ActivityData | undefined;
  for (let i = 0; i < CA_LIMITS.activities; i++) {
    const r = addActivity(data, "common_app_activity", { organization: `Club ${i}` });
    assert.ok(r.ok);
    data = r.value.data;
  }
  assert.equal(addActivity(data, "common_app_activity", { organization: "One more" }).ok, false);

  data = undefined;
  for (let i = 0; i < CA_LIMITS.honors; i++) {
    const r = addActivity(data, "common_app_honor", { title: `Honor ${i}` });
    assert.ok(r.ok);
    data = r.value.data;
  }
  assert.equal(addActivity(data, "common_app_honor", { title: "One more" }).ok, false);

  data = undefined;
  for (let i = 0; i < UC_LIMITS.entries; i++) {
    const r = addActivity(data, "uc_entry", { category: "extracurricular", name: `Thing ${i}` });
    assert.ok(r.ok);
    data = r.value.data;
  }
  assert.equal(addActivity(data, "uc_entry", { category: "work", name: "One more" }).ok, false);
});

test("activities: field length limits and unknown fields are rejected", () => {
  const long = addActivity(undefined, "common_app_activity", { organization: "x", description: "y".repeat(CA_LIMITS.description + 1) });
  assert.equal(long.ok, false);
  assert.match(!long.ok ? long.error : "", /150/);
  assert.equal(addActivity(undefined, "common_app_activity", { organization: "x", position: "p".repeat(CA_LIMITS.position + 1) }).ok, false);
  assert.equal(addActivity(undefined, "uc_entry", { category: "award", name: "n", description: "d".repeat(UC_LIMITS.description + 1) }).ok, false);
  assert.equal(addActivity(undefined, "common_app_activity", { organization: "x", hours: 3 }).ok, false);
  assert.equal(addActivity(undefined, "common_app_activity", { organization: "x", grades: ["13"] }).ok, false);
  assert.equal(addActivity(undefined, "uc_entry", { name: "no category" }).ok, false);
  assert.equal(addActivity(undefined, "common_app_honor", {}).ok, false);
});

test("profile patch: validates scores with the website's scales", () => {
  const r = applyProfilePatch({}, { gpa: 3.9, sat: 1500, act: 34, international: true, targetRegions: ["US", "GB", "US"] });
  assert.ok(r.ok);
  assert.deepEqual([r.value.gpa, r.value.sat, r.value.act, r.value.international, r.value.targetRegions], [3.9, 1500, 34, true, ["US", "GB"]]);

  assert.equal(applyProfilePatch({}, { sat: 1605 }).ok, false);
  assert.equal(applyProfilePatch({}, { sat: 1505 }).ok, false); // off the 10-point step
  assert.equal(applyProfilePatch({}, { act: 37 }).ok, false);
  assert.equal(applyProfilePatch({}, { gpa: 4.5 }).ok, false);
  assert.equal(applyProfilePatch({}, { targetRegions: ["FR"] }).ok, false);
  assert.equal(applyProfilePatch({}, { satSections: { math: 900 } }).ok, false);
  assert.equal(applyProfilePatch({}, { satSections: { verbal: 700 } }).ok, false);
});

test("profile patch: both SAT sections fill in the total; English tests merge and can be removed", () => {
  const sat = applyProfilePatch({ sat: 1200 }, { satSections: { ebrw: 750, math: 780 } });
  assert.ok(sat.ok);
  assert.equal(sat.value.sat, 1530);
  assert.deepEqual(sat.value.tests?.sat, { ebrw: 750, math: 780 });
  const explicit = applyProfilePatch({}, { sat: 1500, satSections: { ebrw: 750, math: 780 } });
  assert.ok(explicit.ok);
  assert.equal(explicit.value.sat, 1500);

  const en = applyProfilePatch({}, { english: { ielts: { total: 7.5, sections: { reading: 8 }, date: "2026-09-01" } } });
  assert.ok(en.ok);
  assert.deepEqual(en.value.tests?.english?.ielts, { total: 7.5, sections: { reading: 8 }, date: "2026-09-01" });
  assert.equal(applyProfilePatch({}, { english: { ielts: { total: 7.3 } } }).ok, false);
  assert.equal(applyProfilePatch({}, { english: { gre: { total: 300 } } }).ok, false);
  const removed = applyProfilePatch(en.value, { english: { ielts: null } });
  assert.ok(removed.ok);
  assert.equal(removed.value.tests?.english?.ielts, undefined);
});

test("profile patch: plan, reminder emails and portals are rejected", () => {
  for (const key of ["plan", "reminderEmails", "portals"]) {
    const r = applyProfilePatch({ plan: "senior" }, { gpa: 3.5, [key]: key === "plan" ? "free" : key === "portals" ? {} : false });
    assert.equal(r.ok, false, key);
  }
  const plan = applyProfilePatch({ plan: "senior" }, { plan: "free" });
  assert.match(!plan.ok ? plan.error : "", /Pricing/);
  // Unknown or unrelated keys are rejected too.
  assert.equal(applyProfilePatch({}, { interested: ["rice"] }).ok, false);
});

test("resume patch merges header and options and rejects unknown keys", () => {
  const r = applyResumePatch({ header: { fullName: "Old" } }, { header: { email: " a@b.co " }, options: { source: "uc", showHours: false } });
  assert.ok(r.ok);
  assert.deepEqual(r.value.header, { fullName: "Old", email: "a@b.co" });
  assert.deepEqual(r.value.options, { source: "uc", showHours: false });
  assert.equal(applyResumePatch(undefined, { header: { ssn: "1" } }).ok, false);
  assert.equal(applyResumePatch(undefined, { options: { source: "all" } }).ok, false);
  assert.equal(applyResumePatch(undefined, { header: { fullName: "x".repeat(201) } }).ok, false);
});

test("upcoming deadlines respect the chosen plan and the window", () => {
  const d = (id: string, due: string, kind: string, plan: string | null): Deadline => ({ id, institution_id: "i1", cycle: "2026-27", kind, plan_key: plan, label: null, due_date: due } as Deadline);
  const deadlines = [d("1", "2026-11-01", "application", "ED"), d("2", "2027-01-05", "application", "RD"), d("3", "2026-10-30", "financial_aid", null), d("4", "2026-10-01", "application", "ED")];
  const today = new Date(2026, 9, 22); // 22 Oct 2026
  const edOnly = upcomingDeadlines([{ slug: "rice", name: "Rice", id: "i1", plan: "ED" }], deadlines, 30, today);
  assert.deepEqual(edOnly.map((x) => x.due_date), ["2026-10-30", "2026-11-01"]); // RD hidden, past ED hidden, Jan outside 30 days
  const undecided = upcomingDeadlines([{ slug: "rice", name: "Rice", id: "i1", plan: null }], deadlines, undefined, today);
  assert.equal(undecided.length, 3);
  assert.equal(undecided[0].days, 8);
});

test("token claims: needs sub and an OAuth client_id", async () => {
  const { authFromClaims } = await import("./mcp/claims.ts");
  const auth = authFromClaims("tok", { sub: "u1", client_id: "c1", scope: "openid email", exp: 123 }, "https://x.test");
  assert.deepEqual(auth, { token: "tok", clientId: "c1", scopes: ["openid", "email"], expiresAt: 123, extra: { userId: "u1", origin: "https://x.test" } });
  assert.equal(authFromClaims("tok", { sub: "u1" }, "https://x.test"), undefined); // a website session token
  assert.equal(authFromClaims("tok", { client_id: "c1" }, "https://x.test"), undefined);
  assert.equal(authFromClaims("tok", null, "https://x.test"), undefined);
});

test("optimistic save: retries on conflict, re-applying the rule to fresh data", async () => {
  const { modifyWithRetry, CONFLICT_MESSAGE } = await import("./mcp/concurrency.ts");
  let version = 1;
  let reads = 0;
  const written: unknown[] = [];
  const out = await modifyWithRetry(
    async () => ({ version: version++, reads: ++reads }),
    (cur) => ({ columns: { v: cur.version }, value: cur.version }),
    async (cur, cols) => {
      if (cur.reads === 1) return false; // someone else saved between our read and write
      written.push(cols);
      return true;
    },
  );
  assert.deepEqual(out, { ok: true, value: 2 });
  assert.deepEqual(written, [{ v: 2 }]);

  const never = await modifyWithRetry(async () => 0, () => ({ columns: { a: 1 }, value: 1 }), async () => false);
  assert.deepEqual(never, { ok: false, error: CONFLICT_MESSAGE });
  assert.equal(CONFLICT_MESSAGE, "Your data changed while saving; try again.");

  let attempts = 0;
  await modifyWithRetry(async () => ++attempts, () => ({ columns: { a: 1 }, value: 1 }), async () => false);
  assert.equal(attempts, 3);

  // A rule that says no stops at once, and an empty change writes nothing.
  assert.deepEqual(await modifyWithRetry(async () => 0, () => ({ error: "no" }), async () => true), { ok: false, error: "no" });
  let wrote = false;
  const noop = await modifyWithRetry(async () => 0, () => ({ columns: {}, value: "same" }), async () => ((wrote = true), true));
  assert.deepEqual(noop, { ok: true, value: "same" });
  assert.equal(wrote, false);
});

test("stale tab refresh: throttled to 30 s, skipped while saving or loading or signed out", async () => {
  const { shouldRefresh } = await import("./student-rows.ts");
  const base = { signedIn: true, now: 100_000, lastLoad: 60_000, savesInFlight: 0, loading: false };
  assert.equal(shouldRefresh(base), true);
  assert.equal(shouldRefresh({ ...base, lastLoad: 80_000 }), false);
  assert.equal(shouldRefresh({ ...base, savesInFlight: 1 }), false);
  assert.equal(shouldRefresh({ ...base, loading: true }), false);
  assert.equal(shouldRefresh({ ...base, signedIn: false }), false);
});

test("authorization id must be a URL-safe token; redirect host is shown", async () => {
  const { isAuthorizationId, redirectHost } = await import("./connect-ai.ts");
  assert.equal(isAuthorizationId("123e4567-e89b-12d3-a456-426614174000"), true);
  assert.equal(isAuthorizationId("Xk3_9fQ-2bLmZp7aR"), true);
  for (const bad of ["abc", "", null, undefined, "123e4567/../x", "../../user", "a%2F..%2Fuser", "javascript:1", "a".repeat(257)]) assert.equal(isAuthorizationId(bad), false, String(bad));
  assert.equal(redirectHost("https://claude.ai/api/mcp/auth_callback"), "claude.ai");
  assert.equal(redirectHost("not a url"), null);
});
