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

// `due` null = a rolling round with no date (La Salle's ROLLING row).
const dl = (institution: string, due: string | null, kind = "application", plan: string | null = null): Deadline =>
  ({ id: `${institution}-${due}-${kind}-${plan}`, institution_id: institution, cycle: "2026-27", kind, plan_key: plan, label: null, due_date: due }) as Deadline;

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

test("a deadline due today is due soon (0 days) and not overdue", () => {
  const list = [entry("rice", { plan: "ED" })];
  const r = build({ list, deadlines: [dl("i-rice", TODAY, "application", "ED")] });
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.due_date, d.days]), [["rice", TODAY, 0]]);
  assert.deepEqual(r.overdue, []);
});

test("an application deadline from yesterday is overdue for an in-progress college, but not for a submitted one", () => {
  const list = [entry("open"), entry("sent", { status: "submitted" }), entry("admitted", { status: "admitted" })];
  const deadlines = [dl("i-open", "2026-11-01"), dl("i-sent", "2026-11-01"), dl("i-admitted", "2026-11-01")];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.college, d.due_date, d.daysOverdue, d.kind]), [["open", "OPEN", "2026-11-01", 1, "application"]]);
  assert.deepEqual(r.dueSoon, [], "yesterday is not due soon");
});

test("overdue counts days back from the given Taipei today and lists the longest overdue first", () => {
  // a and b have no plan and every round has gone by; c is undecided too but its 2026-11-09 round is still ahead.
  const list = [entry("a"), entry("b"), entry("c")];
  const deadlines = [dl("i-b", "2026-10-30"), dl("i-a", "2026-09-02"), dl("i-c", "2026-09-02"), dl("i-c", "2026-11-09", "application", "RD")];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.daysOverdue]), [["a", 61], ["b", 3]]);
});

test("overdue uses the student's plan, and only application deadlines count", () => {
  const list = [entry("rice", { plan: "ED" }), entry("mit", { plan: null })];
  const deadlines = [
    dl("i-rice", "2026-10-15", "application", "ED"), // the student's plan: overdue
    dl("i-rice", "2026-10-20", "application", "RD"), // not their plan: not overdue
    dl("i-rice", "2026-10-10", "financial_aid"), // not an application deadline: not overdue
    dl("i-mit", "2026-10-25", "application", "EA"), // undecided and no round left: overdue
  ];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.plan_key, d.due_date]), [["rice", "ED", "2026-10-15"], ["mit", "EA", "2026-10-25"]]);
});

test("an undecided college with an early round passed and a later round ahead is not overdue", () => {
  const list = [entry("mit", { plan: null })];
  const ea = dl("i-mit", "2026-10-25", "application", "EA"); // passed
  assert.deepEqual(build({ list, deadlines: [ea, dl("i-mit", "2026-11-20", "application", "RD")] }).overdue, [], "RD is still ahead");
  assert.deepEqual(build({ list, deadlines: [ea, dl("i-mit", TODAY, "application", "RD")] }).overdue, [], "a round due today is still ahead");
  // ...but once every round has gone by it is overdue.
  assert.deepEqual(build({ list, deadlines: [ea, dl("i-mit", "2026-11-01", "application", "RD")] }).overdue.map((d) => d.plan_key), ["RD"]);
});

test("an undecided college with a passed round and an undated rolling round is not overdue (it can still apply)", () => {
  // La Salle in the live data: EA was due 2026-11-01 and a ROLLING round has no date.
  const list = [entry("la-salle", { plan: null })];
  const ea = dl("i-la-salle", "2026-11-01", "application", "EA");
  const rolling = dl("i-la-salle", null, "application", "ROLLING");
  assert.deepEqual(build({ list: [entry("la-salle")], deadlines: [ea, rolling] }).overdue, [], "the rolling round is still open");
  assert.deepEqual(build({ list, deadlines: [rolling, ea] }).overdue, [], "order does not matter");
  // The same dates without the rolling round: nothing is left, so it is overdue.
  assert.deepEqual(build({ list, deadlines: [ea] }).overdue.map((d) => d.plan_key), ["EA"]);
});

test("a decided EA plan with the EA round passed is overdue even though an undated rolling round exists", () => {
  const list = [entry("la-salle", { plan: "EA" })];
  const deadlines = [dl("i-la-salle", "2026-11-01", "application", "EA"), dl("i-la-salle", null, "application", "ROLLING")];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.plan_key, d.due_date, d.daysOverdue]), [["la-salle", "EA", "2026-11-01", 1]]);
});

test("an undated aid row does not keep an undecided college open (only application rounds count)", () => {
  const list = [entry("mit", { plan: null })];
  const deadlines = [dl("i-mit", "2026-10-25", "application", "EA"), dl("i-mit", null, "financial_aid")];
  assert.deepEqual(build({ list, deadlines }).overdue.map((d) => d.plan_key), ["EA"]);
});

test("an undecided college whose rounds have all passed is overdue once, for the latest round", () => {
  const list = [entry("mit", { plan: null })];
  const deadlines = [
    dl("i-mit", "2026-10-28", "application", "RD"), // latest passed, listed first on purpose
    dl("i-mit", "2026-10-01", "application", "ED"),
    dl("i-mit", "2026-10-15", "application", "EA"),
  ];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.plan_key, d.due_date, d.daysOverdue]), [["mit", "RD", "2026-10-28", 5]]);
});

test("a decided plan is overdue when its own round passed, even with a later round ahead", () => {
  const list = [entry("rice", { plan: "ED" })];
  const deadlines = [dl("i-rice", "2026-10-15", "application", "ED"), dl("i-rice", "2026-11-20", "application", "RD")];
  const r = build({ list, deadlines });
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.plan_key, d.due_date, d.daysOverdue]), [["rice", "ED", "2026-10-15", 18]]);
  assert.deepEqual(r.dueSoon, [], "the RD round is not theirs and 18 days out");
});

test("each dueSoon and overdue item lists what is still missing (a college with 2 of 5 done)", () => {
  const list = [
    entry("half", { plan: "ED", checklist: { recommendations: true, transcript: true } }),
    entry("full", { checklist: { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" } }),
  ];
  // half: a decided plan, so its passed ED round is overdue; its aid date next week is due soon.
  const deadlines = [dl("i-half", "2026-11-05", "financial_aid"), dl("i-half", "2026-10-30", "application", "ED"), dl("i-full", "2026-11-06")];
  const r = build({ list, deadlines });
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.missing]), [["half", ["Essays", "Test scores", "English test"]], ["full", []]]);
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.missing]), [["half", ["Essays", "Test scores", "English test"]]]);
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
  const end = tools.indexOf("server.registerTool(", start);
  assert.ok(end > start, "the block must end at the next registerTool (a -1 here would silently slice to the end of the file)");
  const block = tools.slice(start, end);
  assert.match(block, /annotations: READ\b/);
  assert.match(block, /guarded\(/);
  // Today is the Taipei date, never the server clock's UTC date.
  assert.match(block, /taipeiToday\(\)/);
  assert.doesNotMatch(block, /new Date\(/);
  assert.match(block, /days: z\.number\(\)\.int\(\)\.min\(1\)\.max\(31\)\.default\(7\)/);
  assert.match(block, /readList\(s\)/);
  assert.match(block, /buildWeeklyChanges\(/);
  assert.doesNotMatch(block, /\.(insert|update|delete|upsert|rpc)\(/);
  assert.doesNotMatch(block, /from\(/, "reads go through readList, which uses the ai_student_colleges view");
  // The description must say the tool has no history, so an AI doesn't invent "it used to be ...".
  assert.match(block, /keeps no history/);
  // ...and that it also covers overdue items and what is missing.
  assert.match(block, /overdue/i);
  assert.match(block, /missing/i);
});

test("an empty list gives empty arrays, not an error", () => {
  const r = build();
  assert.deepEqual(r, { since: "2026-10-26", today: TODAY, updated: [], dueSoon: [], overdue: [], dataRefreshed: [], siteUpdates: [] });
});
