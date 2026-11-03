import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStudentDigest,
  CHECKLIST as EDGE_CHECKLIST,
  isDone as edgeIsDone,
  latestAccess,
  type StudentDigest,
} from "../../supabase/functions/_shared/student-digest.ts";
import { CHECKLIST, isDone, type Checklist } from "./checklist.ts";
import { lastChecked } from "./freshness.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";
import { buildWeeklyChanges } from "./weekly-changes.ts";

// The weekly student email (supabase/functions/_shared/student-digest.ts, runs in Deno and can't import from web/) must pick
// the same things as the private AI tool get_weekly_changes (lib/weekly-changes.ts buildWeeklyChanges). They are written
// separately; this keeps them in step. Every fixture goes through both and the results must be deeply equal.
// lastCheckedBySlug is an INPUT to both. The email derives it from database sources only (latestAccess); get_weekly_changes also
// counts supplement sources (mcp/tools.ts), so what each says is "re-checked" can differ in production by design (not a parity bug).

const TODAY = "2026-11-02";

type Entry = ListEntry & { name: string };
type Input = {
  today: string;
  days?: number;
  list: Entry[];
  deadlines: Deadline[];
  international?: boolean;
  lastCheckedBySlug: Record<string, string | null | undefined>;
};

const entry = (slug: string, over: Partial<Entry> = {}): Entry => ({
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
const dl = (institution: string, due: string | null, kind = "application", plan: string | null = null, label: string | null = null): Deadline =>
  ({ id: `${institution}-${due}-${kind}-${plan}-${label}`, institution_id: institution, cycle: "2026-27", kind, plan_key: plan, label, due_date: due }) as Deadline;

/** Runs one input through the web builder and the Deno twin and asserts the parts the email uses are deeply equal. */
function both(input: Input): StudentDigest {
  const web = buildWeeklyChanges({ ...input, log: [] });
  const edge = buildStudentDigest(input);
  // The email lists no site-update titles, so that one part of the web result has no twin.
  assert.deepEqual(edge, { since: web.since, today: web.today, updated: web.updated, dueSoon: web.dueSoon, overdue: web.overdue, dataRefreshed: web.dataRefreshed });
  return edge;
}

const base = (over: Partial<Input> = {}): Input => ({ today: TODAY, list: [], deadlines: [], lastCheckedBySlug: {}, ...over });

test("Taipei days: a timestamp is turned into its Taipei date before it is compared with the window start", () => {
  const list = [
    entry("edge-in", { updatedAt: "2026-10-25T16:30:00+00:00" }), // 2026-10-26 00:30 in Taipei: first minute of the window
    entry("edge-out", { updatedAt: "2026-10-25T23:59:59+08:00" }), // last second before the window
    entry("edge-out-utc", { updatedAt: "2026-10-25T15:59:59+00:00" }), // same instant, written in UTC
    entry("recent", { updatedAt: "2026-11-01T09:15:30.123456+00:00" }), // Postgres microseconds
    entry("no-stamp"),
    entry("junk", { updatedAt: "not a date" }),
  ];
  const r = both(base({ list }));
  assert.deepEqual(r.updated.map((u) => u.slug), ["recent", "edge-in"]);
  assert.equal(r.updated[1].updatedOn, "2026-10-26");
  assert.equal(r.since, "2026-10-26");
});

test("the UTC date is not the Taipei date near the day boundary (16:00 UTC is already the next Taipei day)", () => {
  // 2026-11-02 17:00 UTC is 2026-11-03 01:00 in Taipei: updatedOn must read 2026-11-03.
  const list = [entry("late", { updatedAt: "2026-11-02T17:00:00+00:00" }), entry("early", { updatedAt: "2026-11-02T15:59:00+00:00" })];
  const r = both(base({ list }));
  assert.deepEqual(r.updated.map((u) => [u.slug, u.updatedOn]), [["late", "2026-11-03"], ["early", "2026-11-02"]]);
});

test("updated is newest first, ties keep the list order, and carries status, plan and checklist progress", () => {
  const list = [
    entry("a", { updatedAt: "2026-10-28T01:00:00+00:00", plan: "ED", status: "submitted", checklist: { recommendations: true, transcript: true } }),
    entry("b", { updatedAt: "2026-11-02T01:00:00+00:00" }),
    entry("c", { updatedAt: "2026-10-30T01:00:00+00:00", plan: "RD" }),
    entry("d", { updatedAt: "2026-10-30T01:00:00+00:00" }), // same instant as c
  ];
  const r = both(base({ list }));
  assert.deepEqual(r.updated.map((u) => u.slug), ["b", "c", "d", "a"]);
  assert.deepEqual(r.updated[3], { slug: "a", name: "A", status: "submitted", plan: "ED", updatedOn: "2026-10-28", checklistDone: 2, checklistTotal: 5 });
});

test("dueSoon: the 14-day window, the plan filter, today included, soonest first, ties in list order", () => {
  const list = [entry("rice", { plan: "ED" }), entry("mit", { plan: null }), entry("yale")];
  const deadlines = [
    dl("i-rice", "2026-11-10", "application", "ED"),
    dl("i-rice", "2026-11-10", "application", "RD"), // not the student's plan
    dl("i-mit", "2026-11-16", "application", "EA"), // day 14: in
    dl("i-mit", "2026-11-17", "application", "RD"), // day 15: out
    dl("i-mit", "2026-11-01", "application", "EA"), // yesterday: out
    dl("i-yale", TODAY, "application", "RD"), // today: in
    dl("i-yale", "2026-11-10", "financial_aid", null, "Aid"), // same date as rice: list order decides
    dl("i-other", "2026-11-05"), // not on the list
  ];
  const r = both(base({ list, deadlines }));
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.due_date, d.days]), [["yale", TODAY, 0], ["rice", "2026-11-10", 8], ["yale", "2026-11-10", 8], ["mit", "2026-11-16", 14]]);
});

test("FAFSA-only dates are hidden from an international student, others (CSS Profile, scholarship, international) stay", () => {
  const list = [entry("mit")];
  const labels = ["FAFSA", "FAFSA priority filing date", "WASFA", "TASFA", "ORSAA", "CADAA", "Dream Act application", "CSS Profile / FAFSA (RD)", "FAFSA scholarship deadline", "International student aid", "IDOC", null];
  const deadlines = labels.map((label, i) => dl("i-mit", `2026-11-0${3 + (i % 5)}`, "financial_aid", null, label));
  const domestic = both(base({ list, deadlines, international: false }));
  const intl = both(base({ list, deadlines, international: true }));
  assert.equal(domestic.dueSoon.length, labels.length);
  assert.deepEqual(intl.dueSoon.map((d) => d.label), ["IDOC", null, "CSS Profile / FAFSA (RD)", "FAFSA scholarship deadline", "International student aid"]);
  // An application deadline is never filtered by the FAFSA rule.
  const app = both(base({ list, deadlines: [dl("i-mit", "2026-11-04", "application", "RD", "FAFSA")], international: true }));
  assert.equal(app.dueSoon.length, 1);
});

test("overdue: an in-progress college only, with the student's plan, and the longest overdue first", () => {
  const list = [entry("open"), entry("sent", { status: "submitted" }), entry("admitted", { status: "admitted" }), entry("rice", { plan: "ED" }), entry("mit", { plan: null }), entry("b-tie", { plan: "RD" }), entry("a-tie", { plan: "RD" })];
  const deadlines = [
    dl("i-open", "2026-11-01"),
    dl("i-sent", "2026-11-01"),
    dl("i-admitted", "2026-11-01"),
    dl("i-rice", "2026-10-15", "application", "ED"), // the plan: overdue
    dl("i-rice", "2026-10-20", "application", "RD"), // not the plan
    dl("i-rice", "2026-10-10", "financial_aid"), // not an application deadline
    dl("i-mit", "2026-10-25", "application", "EA"), // undecided, no round left: overdue
    dl("i-b-tie", "2026-10-30", "application", "RD"),
    dl("i-a-tie", "2026-10-30", "application", "RD"), // same date as b-tie: sorted by college name
  ];
  const r = both(base({ list, deadlines }));
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.due_date, d.daysOverdue]), [["rice", "2026-10-15", 18], ["mit", "2026-10-25", 8], ["a-tie", "2026-10-30", 3], ["b-tie", "2026-10-30", 3], ["open", "2026-11-01", 1]]);
});

test("undecided plan: a later round still ahead, a round due today, or an undated rolling round keeps the college out of overdue", () => {
  const ea = dl("i-mit", "2026-10-25", "application", "EA");
  const list = [entry("mit")];
  assert.deepEqual(both(base({ list, deadlines: [ea, dl("i-mit", "2026-11-20", "application", "RD")] })).overdue, []);
  assert.deepEqual(both(base({ list, deadlines: [ea, dl("i-mit", TODAY, "application", "RD")] })).overdue, []);
  assert.deepEqual(both(base({ list, deadlines: [ea, dl("i-mit", "2026-11-01", "application", "RD")] })).overdue.map((d) => d.plan_key), ["RD"]);
  // La Salle in the live data: EA was due 2026-11-01 and a ROLLING round has no date. Order must not matter.
  const ls = dl("i-la-salle", "2026-11-01", "application", "EA");
  const rolling = dl("i-la-salle", null, "application", "ROLLING");
  assert.deepEqual(both(base({ list: [entry("la-salle")], deadlines: [ls, rolling] })).overdue, []);
  assert.deepEqual(both(base({ list: [entry("la-salle")], deadlines: [rolling, ls] })).overdue, []);
  assert.deepEqual(both(base({ list: [entry("la-salle")], deadlines: [ls] })).overdue.map((d) => d.plan_key), ["EA"]);
  // A decided EA plan is overdue whatever the rolling row says.
  assert.deepEqual(both(base({ list: [entry("la-salle", { plan: "EA" })], deadlines: [ls, rolling] })).overdue.map((d) => [d.plan_key, d.daysOverdue]), [["EA", 1]]);
  // An undated aid row does not keep an undecided college open; once every round passed it is reported once, for the latest.
  const three = [dl("i-mit", "2026-10-28", "application", "RD"), dl("i-mit", "2026-10-01", "application", "ED"), dl("i-mit", "2026-10-15", "application", "EA"), dl("i-mit", null, "financial_aid")];
  assert.deepEqual(both(base({ list, deadlines: three })).overdue.map((d) => [d.plan_key, d.daysOverdue]), [["RD", 5]]);
});

test("each dueSoon and overdue item lists the checklist labels still open (essays, scores and English test included)", () => {
  const list = [
    entry("half", { plan: "ED", checklist: { recommendations: true, transcript: true } }),
    entry("full", { checklist: { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" } }),
    entry("essays", { checklist: { essay_list: [{ id: "1", title: "t", url: "", status: "final" }], test_plan: "sat", test_scores: true, english_plan: "toefl", english_test: false } }),
  ];
  const deadlines = [dl("i-half", "2026-11-05", "financial_aid"), dl("i-half", "2026-10-30", "application", "ED"), dl("i-full", "2026-11-06"), dl("i-essays", "2026-11-07")];
  const r = both(base({ list, deadlines }));
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.missing]), [["half", ["Essays", "Test scores", "English test"]], ["full", []], ["essays", ["Recommendations", "Transcript sent", "English test"]]]);
  assert.deepEqual(r.overdue.map((d) => [d.slug, d.missing]), [["half", ["Essays", "Test scores", "English test"]]]);
});

test("dataRefreshed: only listed colleges whose newest source date is in the window", () => {
  const list = [entry("a"), entry("b"), entry("c"), entry("d"), entry("e"), entry("f")];
  const lastCheckedBySlug = { a: "2026-10-30", b: "2026-10-26", c: "2026-10-25", d: null, f: "2026-10-30", stranger: "2026-11-01" };
  const r = both(base({ list, lastCheckedBySlug }));
  assert.deepEqual(r.dataRefreshed, [
    { slug: "a", name: "A", lastChecked: "2026-10-30" },
    { slug: "f", name: "F", lastChecked: "2026-10-30" },
    { slug: "b", name: "B", lastChecked: "2026-10-26" },
  ]);
});

test("`days` moves the window, across a month end and a leap day too", () => {
  assert.equal(both(base()).since, "2026-10-26");
  assert.equal(both(base({ days: 3 })).since, "2026-10-30");
  assert.equal(both(base({ today: "2026-03-02" })).since, "2026-02-23");
  assert.equal(both(base({ today: "2028-03-01" })).since, "2028-02-23");
  assert.equal(both(base({ today: "2028-03-01", days: 1 })).since, "2028-02-29");
  assert.equal(both(base({ today: "2027-01-03" })).since, "2026-12-27");
  const list = [entry("a", { updatedAt: "2028-02-29T04:00:00+00:00" })];
  assert.equal(both(base({ today: "2028-03-01", list })).updated.length, 1);
  // A deadline window that crosses the year end.
  const r = both(base({ today: "2026-12-25", list: [entry("a")], deadlines: [dl("i-a", "2027-01-08"), dl("i-a", "2027-01-09")] }));
  assert.deepEqual(r.dueSoon.map((d) => [d.due_date, d.days]), [["2027-01-08", 14]]);
});

test("an empty list gives empty arrays on both sides", () => {
  assert.deepEqual(both(base()), { since: "2026-10-26", today: TODAY, updated: [], dueSoon: [], overdue: [], dataRefreshed: [] });
});

// A deterministic spread of random cases (a seeded generator, so a failure reproduces): the fixtures above name the rules, this
// looks for a combination nobody thought of.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

test("600 random cases agree (every part is non-empty in many of them, so this is not two empty results)", () => {
  const rand = rng(20261102);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
  const DAY = 86_400_000;
  const todayMs = Date.parse(`${TODAY}T00:00:00Z`);
  const iso = (offsetDays: number) => new Date(todayMs + offsetDays * DAY).toISOString().slice(0, 10);
  const plans = [null, null, "ED", "EA", "RD", "ROLLING"];
  const statuses = ["in_progress", "in_progress", "in_progress", "in_progress", "in_progress", "researching", "planning", "submitted", "interview", "admitted", "deferred", "waitlisted", "rejected", "withdrawn", "enrolled"] as const;
  const checklists: Checklist[] = [
    {},
    { recommendations: true },
    { recommendations: true, transcript: true, no_essays: true },
    { no_essays: true, recommendations: true, transcript: true, test_plan: "optional", english_plan: "not_required" },
    { essay_list: [{ id: "1", title: "a", url: "", status: "final" }, { id: "2", title: "b", url: "", status: "drafting" }] },
    { essay_list: [{ id: "1", title: "a", url: "", status: "final" }], test_plan: "sat", test_scores: true },
    { test_plan: "act", test_scores: false, english_plan: "ielts", english_test: true },
  ];
  const labels = [null, null, "FAFSA", "CSS Profile / FAFSA (RD)", "Scholarship deadline", "WASFA priority"];
  const kinds = ["application", "application", "application", "financial_aid", "scholarship", "priority"];
  const names = ["Alpha", "Bravo", "Alpha", "Charlie"]; // repeated on purpose: ties in the overdue name sort
  const tally = { updated: 0, dueSoon: 0, overdue: 0, dataRefreshed: 0, intl: 0 };
  for (let n = 0; n < 600; n++) {
    const count = 1 + Math.floor(rand() * 4);
    const list: Entry[] = [];
    const deadlines: Deadline[] = [];
    const lastCheckedBySlug: Record<string, string | null | undefined> = {};
    for (let k = 0; k < count; k++) {
      const slug = `c${k}`;
      list.push(
        entry(slug, {
          name: pick(names),
          plan: pick(plans),
          status: pick(statuses),
          checklist: pick(checklists),
          updatedAt: rand() < 0.2 ? undefined : new Date(todayMs + (Math.floor(rand() * 14) - 11) * DAY + Math.floor(rand() * DAY)).toISOString().replace("Z", "+00:00"),
        }),
      );
      const rounds = Math.floor(rand() * 5);
      for (let r = 0; r < rounds; r++) {
        deadlines.push(dl(`i-${slug}`, rand() < 0.12 ? null : iso(Math.floor(rand() * 61) - 30), pick(kinds), pick(plans), pick(labels)));
      }
      lastCheckedBySlug[slug] = rand() < 0.3 ? null : iso(Math.floor(rand() * 20) - 14);
    }
    for (let i = deadlines.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [deadlines[i], deadlines[j]] = [deadlines[j], deadlines[i]];
    }
    const international = rand() < 0.5;
    const r = both({ today: TODAY, list, deadlines, international, lastCheckedBySlug });
    if (r.updated.length) tally.updated++;
    if (r.dueSoon.length) tally.dueSoon++;
    if (r.overdue.length) tally.overdue++;
    if (r.dataRefreshed.length) tally.dataRefreshed++;
    if (international) tally.intl++;
  }
  for (const [part, cases] of Object.entries(tally)) assert.ok(cases >= 30, `only ${cases} random cases had ${part}`);
});

test("the checklist labels and the done rules are the web app's", () => {
  assert.deepEqual(EDGE_CHECKLIST, CHECKLIST);
  const cases: Checklist[] = [
    {},
    { no_essays: true },
    { essay_list: [] },
    { essay_list: [{ id: "1", title: "", url: "", status: "final" }] },
    { essay_list: [{ id: "1", title: "", url: "", status: "final" }, { id: "2", title: "", url: "", status: "revising" }] },
    { test_plan: "optional" },
    { test_plan: "sat" },
    { test_plan: "sat", test_scores: true },
    { test_plan: null, test_scores: true },
    { english_plan: "not_required" },
    { english_plan: "toefl" },
    { english_plan: "toefl", english_test: true },
    { english_plan: null, english_test: true },
    { recommendations: true, transcript: true },
  ];
  for (const c of cases) {
    for (const [key] of CHECKLIST) assert.equal(edgeIsDone(key, c), isDone(key, c), `${key} ${JSON.stringify(c)}`);
  }
});

test("the newest source date per college is the web's lastChecked (bad dates ignored, only the newest kept)", () => {
  const rows = [
    { institution_id: "i1", accessed_on: "2026-10-21" },
    { institution_id: "i1", accessed_on: "2026-10-27" },
    { institution_id: "i1", accessed_on: "2026-10-23" },
    { institution_id: "i2", accessed_on: "2026-10-30" },
    { institution_id: "i3", accessed_on: "soon" },
    { institution_id: "i3", accessed_on: "10/27/2026" },
    { institution_id: "i4", accessed_on: "" },
    { institution_id: "i4", accessed_on: "2026-10-22" },
    { institution_id: "i5", accessed_on: null as unknown as string },
  ];
  const edge = latestAccess(rows);
  for (const id of ["i1", "i2", "i3", "i4", "i5", "none"]) {
    assert.equal(edge[id] ?? null, lastChecked(rows.filter((r) => r.institution_id === id)), id);
  }
  assert.deepEqual(edge, { i1: "2026-10-27", i2: "2026-10-30", i4: "2026-10-22" });
});
