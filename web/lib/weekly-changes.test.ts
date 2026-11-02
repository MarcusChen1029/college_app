import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { CHECKLIST } from "./checklist.ts";
import { REFRESH_LOG, type RefreshEntry } from "./refresh-log.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";
import { buildWeeklyChanges } from "./weekly-changes.ts";

const TODAY = "2026-11-02";

const entry = (slug: string, over: Partial<ListEntry> & { updatedAt?: string } = {}): ListEntry & { name: string } => ({
  slug,
  name: slug.toUpperCase(),
  institutionId: `i-${slug}`,
  plan: null,
  status: "in_progress",
  notes: "",
  checklist: {},
  portal: { url: "", username: "" },
  addedAt: "2026-09-01T00:00:00+00:00",
  ...over,
});

const dl = (institution: string, due: string, kind = "application", plan: string | null = null): Deadline =>
  ({ id: `${institution}-${due}-${kind}`, institution_id: institution, cycle: "2026-27", kind, plan_key: plan, label: null, due_date: due }) as Deadline;

const build = (over: Partial<Parameters<typeof buildWeeklyChanges>[0]> = {}) =>
  buildWeeklyChanges({ today: TODAY, list: [], deadlines: [], lastCheckedBySlug: {}, log: [], ...over });

const log = (date: string, title: string): RefreshEntry => ({ date, en: { title, summary: `${title} summary` }, zh: { title: `${title} (zh)`, summary: "摘要" } });

test("since is 7 days back by default, and `days` moves it (across a month end too)", () => {
  assert.equal(build().since, "2026-10-26");
  assert.equal(build().today, TODAY);
  assert.equal(build({ days: 3 }).since, "2026-10-30");
  assert.equal(build({ today: "2026-03-02" }).since, "2026-02-23");
});

test("includes a college updated on the boundary day and excludes one updated just before it (days are Taipei days, not UTC)", () => {
  const list = [
    // 2026-10-26 00:30 in Taipei, but still 2026-10-25 in UTC: the first Taipei minute of the window counts.
    entry("edge-in", { updatedAt: "2026-10-25T16:30:00+00:00" }),
    // 2026-10-25 23:59:59 in Taipei: the last second before the window.
    entry("edge-out", { updatedAt: "2026-10-25T23:59:59+08:00" }),
    // Same instant written in UTC, to prove the offset form does not matter.
    entry("edge-out-utc", { updatedAt: "2026-10-25T15:59:59+00:00" }),
    // Plain recent update, also timestamps Postgres writes with microseconds.
    entry("recent", { updatedAt: "2026-11-01T09:15:30.123456+00:00" }),
    // No timestamp at all (a list entry from somewhere that doesn't carry one) is never "updated this week".
    entry("no-stamp"),
  ];
  const r = build({ list });
  assert.deepEqual(r.updated.map((u) => u.slug), ["recent", "edge-in"]);
  assert.equal(r.updated[1].updatedOn, "2026-10-26");
  assert.equal(r.updated[0].updatedOn, "2026-11-01");
});

test("updated is newest first and carries name, status and plan", () => {
  const list = [
    entry("a", { updatedAt: "2026-10-28T01:00:00+00:00", plan: "ED", status: "submitted" }),
    entry("b", { updatedAt: "2026-11-02T01:00:00+00:00" }),
    entry("c", { updatedAt: "2026-10-30T01:00:00+00:00", plan: "RD" }),
  ];
  const r = build({ list });
  assert.deepEqual(r.updated.map((u) => u.slug), ["b", "c", "a"]);
  assert.deepEqual(r.updated[2], { slug: "a", name: "A", status: "submitted", plan: "ED", updatedOn: "2026-10-28", checklistDone: 0, checklistTotal: CHECKLIST.length });
});

test("counts checklist progress the way the app does (recommendations and transcript ticked = 2 of the app's items)", () => {
  const list = [entry("a", { updatedAt: "2026-10-30T01:00:00+00:00", checklist: { recommendations: true, transcript: true } })];
  const [u] = build({ list }).updated;
  assert.equal(u.checklistDone, 2);
  assert.equal(u.checklistTotal, CHECKLIST.length);
});

test("dueSoon is the 14-day window counted from the given today, with the plan filter of get_upcoming_deadlines", () => {
  const list = [entry("rice", { plan: "ED" }), entry("mit", { plan: null })];
  const deadlines = [
    dl("i-rice", "2026-11-10", "application", "ED"), // 8 days: in
    dl("i-rice", "2026-11-10", "application", "RD"), // not the student's plan: out
    dl("i-mit", "2026-11-16", "application", "EA"), // 14 days: in (undecided plan shows every plan)
    dl("i-mit", "2026-11-17", "application", "RD"), // 15 days: out
    dl("i-mit", "2026-11-01", "application", "EA"), // yesterday: out
    dl("i-other", "2026-11-05"), // not on the list: out
  ];
  const r = build({ list, deadlines });
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.due_date, d.days]), [["rice", "2026-11-10", 8], ["mit", "2026-11-16", 14]]);
  assert.equal(r.dueSoon[0].college, "RICE");
});

test("dueSoon hides FAFSA-only items from an international student, like get_upcoming_deadlines", () => {
  const fafsa = { ...dl("i-mit", "2026-11-05", "financial_aid"), label: "FAFSA" } as Deadline;
  const list = [entry("mit")];
  assert.equal(build({ list, deadlines: [fafsa] }).dueSoon.length, 1);
  assert.equal(build({ list, deadlines: [fafsa], international: true }).dueSoon.length, 0);
});

test("dataRefreshed lists only listed colleges checked in the window", () => {
  const list = [entry("a"), entry("b"), entry("c"), entry("d"), entry("e")];
  const lastCheckedBySlug = {
    a: "2026-10-30", // in
    b: "2026-10-26", // boundary day: in
    c: "2026-10-25", // before: out
    d: null, // never dated: out
    // e: absent: out
    stranger: "2026-11-01", // not on the list: out
  };
  const r = build({ list, lastCheckedBySlug });
  assert.deepEqual(r.dataRefreshed, [
    { slug: "a", name: "A", lastChecked: "2026-10-30" },
    { slug: "b", name: "B", lastChecked: "2026-10-26" },
  ]);
});

test("siteUpdates come from the log: only entries on or after since, English titles", () => {
  const entries = [log("2026-10-30", "Fresh load"), log("2026-10-25", "Old load")];
  assert.deepEqual(build({ log: entries }).siteUpdates, [{ date: "2026-10-30", title: "Fresh load" }]);
  assert.deepEqual(build({ log: entries, today: "2026-10-31", days: 7 }).siteUpdates.map((s) => s.title), ["Fresh load", "Old load"]);
});

test("siteUpdates default to the real refresh log (newest first, English titles)", () => {
  const all = buildWeeklyChanges({ today: "2000-01-01", list: [], deadlines: [], lastCheckedBySlug: {} });
  assert.deepEqual(all.siteUpdates, REFRESH_LOG.map((e) => ({ date: e.date, title: e.en.title })));
  const none = buildWeeklyChanges({ today: "2099-01-01", list: [], deadlines: [], lastCheckedBySlug: {} });
  assert.deepEqual(none.siteUpdates, []);
});

// tools.ts can't be loaded by node --test (server-only, Next's cached data layer), so, like ai-views.test.ts, read it as text.
test("get_weekly_changes is registered as a read-only, guarded tool that only reads through the AI view helpers", () => {
  const tools = readFileSync(new URL("./mcp/tools.ts", import.meta.url), "utf8");
  const start = tools.indexOf('"get_weekly_changes"');
  assert.ok(start > 0, "tool not registered");
  const block = tools.slice(start, tools.indexOf("server.registerTool(", start));
  assert.match(block, /annotations: READ\b/);
  assert.match(block, /guarded\(/);
  assert.match(block, /days: z\.number\(\)\.int\(\)\.min\(1\)\.max\(31\)\.default\(7\)/);
  assert.match(block, /readList\(s\)/);
  assert.match(block, /buildWeeklyChanges\(/);
  assert.doesNotMatch(block, /\.(insert|update|delete|upsert|rpc)\(/);
  assert.doesNotMatch(block, /from\(/, "reads go through readList, which uses the ai_student_colleges view");
  // The description must say the tool has no history, so an AI doesn't invent "it used to be ...".
  assert.match(block, /keeps no history/);
});

test("an empty list gives empty arrays, not an error", () => {
  const r = build();
  assert.deepEqual(r, { since: "2026-10-26", today: TODAY, updated: [], dueSoon: [], dataRefreshed: [], siteUpdates: [] });
});
