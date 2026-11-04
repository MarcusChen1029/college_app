import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  buildStudentDigest,
  CHECKLIST as EDGE_CHECKLIST,
  deadlinesFor as edgeDeadlinesFor,
  isDone as edgeIsDone,
  latestAccess,
  missingLabels as edgeMissingLabels,
  progress as edgeProgress,
  renderStudentDigest,
  replyByDeadline as edgeReplyByDeadline,
  REPLY_BY_LABEL as EDGE_REPLY_BY_LABEL,
  type StudentDigest,
} from "../../supabase/functions/_shared/student-digest.ts";
import { collegeSteps, contextFor, courseFor, progressFor } from "./application-steps.ts";
import { checklistItems, CHECKLIST, isDone, itemLabel, progress as webProgress, type Checklist, type CollegeContext } from "./checklist.ts";
import { deadlinesForEntry } from "./course-deadlines.ts";
import { lastChecked } from "./freshness.ts";
import { AU_FIXTURE_CONTEXT, CA_FIXTURE_CONTEXT, GB_FIXTURE_CONTEXT, NO_COURSES_CONTEXT, PARITY_SLUGS, parityChecklists } from "./progress-fixtures.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";
import { replyByDeadline, REPLY_BY_LABEL } from "./uk-offers.ts";
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
  const SLUG_POOL = ["ucl", "ubc", "melbourne", "harvard", "oxford", "unsw", "c0", "c1"]; // UK, Canada, Australia, US and unknown
  const replyDates = [iso(0), iso(5), iso(9), iso(13), iso(5), iso(-3), iso(14), iso(20), "2026-02-30", "soon", 5, null];
  const tally = { updated: 0, dueSoon: 0, overdue: 0, dataRefreshed: 0, intl: 0, replyBy: 0 };
  for (let n = 0; n < 600; n++) {
    const count = 1 + Math.floor(rand() * 4);
    const list: Entry[] = [];
    const deadlines: Deadline[] = [];
    const lastCheckedBySlug: Record<string, string | null | undefined> = {};
    const slugs = [...SLUG_POOL].sort(() => rand() - 0.5).slice(0, count);
    for (let k = 0; k < count; k++) {
      const slug = slugs[k];
      const courses = collegeSteps(slug)?.courses ?? [];
      const base = pick(checklists);
      list.push(
        entry(slug, {
          name: pick(names),
          plan: pick(plans),
          // UK colleges are often admitted, so the reply-by rule is exercised in many cases
          status: ["ucl", "oxford"].includes(slug) && rand() < 0.3 ? "admitted" : pick(statuses),
          checklist: {
            ...base,
            ...(rand() < 0.7 ? { course: pick([...courses.map((c) => c.slug), null, "no-such-course"]) } : {}),
            ...(rand() < 0.7 ? { intake: pick(["s1", "s2", null, "s3"]) as Checklist["intake"] } : {}),
            ...(rand() < 0.5 ? { ucas_ps: rand() < 0.5, ucas_reference: rand() < 0.5, admissions_test: rand() < 0.5 } : {}),
            ...(rand() < 0.4 ? { extra_steps: pick([{}, { ok: true }, { aif: true, casper: false }, { ok: "yes" }]) as Record<string, boolean> } : {}),
            // UCAS reply: a typed reply-by date (good and bad) and a reply (good and not one of the allowed values)
            ...(rand() < 0.8 ? { uk_reply_by: pick(replyDates) as string } : {}),
            ...(rand() < 0.3 ? { uk_reply: pick([undefined, null, "firm", "insurance", "decline", "FIRM"]) as Checklist["uk_reply"] } : {}),
          },
          updatedAt: rand() < 0.2 ? undefined : new Date(todayMs + (Math.floor(rand() * 14) - 11) * DAY + Math.floor(rand() * DAY)).toISOString().replace("Z", "+00:00"),
        }),
      );
      const rounds = Math.floor(rand() * 5);
      for (let r = 0; r < rounds; r++) {
        const row = dl(`i-${slug}`, rand() < 0.12 ? null : iso(Math.floor(rand() * 61) - 30), pick(kinds), pick(plans), pick(labels));
        // some rows belong to a course of the college (or of no known one) or to an Australian intake
        if (rand() < 0.5) (row as Deadline).program_id = pick([...courses.map((c) => c.id), "foreign-course-id"]);
        if (rand() < 0.4) (row as Deadline).intake = pick(["s1", "s2"]) as "s1" | "s2";
        deadlines.push(row);
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
    if (r.dueSoon.some((d) => d.label === REPLY_BY_LABEL)) tally.replyBy++;
    if (r.overdue.length) tally.overdue++;
    if (r.dataRefreshed.length) tally.dataRefreshed++;
    if (international) tally.intl++;
  }
  for (const [part, cases] of Object.entries(tally)) assert.ok(cases >= 30, `only ${cases} random cases had ${part}`);
});

// ?? UK / Canada / Australia: the same items, labels and course deadlines as the web ??

const COUNTRY_SLUGS = ["ucl", "ubc", "melbourne", "harvard"] as const;

test("digest progress equals web progressFor (ucl, ubc, melbourne, harvard; full and partial checklists)", () => {
  assert.deepEqual([...PARITY_SLUGS], [...COUNTRY_SLUGS]);
  for (const slug of PARITY_SLUGS) {
    for (const c of parityChecklists(slug)) {
      assert.deepEqual(edgeProgress(c, slug), progressFor(slug, c), `${slug} ${JSON.stringify(c)}`);
    }
    // no course picked, and a course slug that does not exist
    for (const c of [{}, { course: "no-such-course" }, { course: null, ucas_ps: true }] as Checklist[]) {
      assert.deepEqual(edgeProgress(c, slug), progressFor(slug, c), `${slug} ${JSON.stringify(c)}`);
    }
  }
  // the country is really used: a UK college is not the US five
  assert.notEqual(edgeProgress({}, "ucl").total, 5);
  assert.equal(edgeProgress({}, "harvard").total, 5);
});

test("digest missing labels equal web itemLabel for the open items (steps, admissions test and every country included)", () => {
  const web = (slug: string, ctx: CollegeContext, c: Checklist) => checklistItems(c, ctx).filter((i) => !i.done).map((i) => itemLabel(i, ctx.country));
  for (const slug of PARITY_SLUGS) {
    for (const c of parityChecklists(slug)) assert.deepEqual(edgeMissingLabels(c, slug), web(slug, contextFor(slug, c), c), `${slug}`);
  }
  // Hand-built contexts, injected as the college data: GB with an admissions test and steps, CA with a test step, AU, GB without courses.
  const asData = (ctx: CollegeContext) => ({ x: { country: ctx.country as "GB" | "CA" | "AU", researched: ctx.researched, admissionsUrl: ctx.admissionsUrl ?? "", steps: ctx.steps, courses: ctx.course ? [ctx.course] : [] } });
  const checklists: Checklist[] = [
    {},
    { ucas_ps: true, ucas_reference: true, admissions_test: true, transcript: true, english_plan: "ielts", english_test: true, test_plan: "sat", test_scores: true, extra_steps: { ok: true, aif: true, casper: true }, course: "fixture-course" },
    { extra_steps: { ok: true, aif: "yes" } as unknown as Record<string, boolean>, course: "fixture-course", transcript: true },
    { ucas_reference: true, course: "fixture-course", test_plan: "optional", english_plan: "not_required" },
  ];
  for (const ctx of [GB_FIXTURE_CONTEXT, CA_FIXTURE_CONTEXT, AU_FIXTURE_CONTEXT, NO_COURSES_CONTEXT]) {
    const data = asData(ctx);
    for (const c of checklists) {
      const cc = ctx.course ? c : { ...c, course: null };
      // the injected college lists one course; web's ctx already has it chosen when the checklist names it
      const webCtx: CollegeContext = { ...ctx, course: ctx.course && cc.course === ctx.course.slug ? ctx.course : null };
      assert.deepEqual(edgeProgress(cc, "x", data), webProgress(cc, { ...webCtx, steps: webCtx.steps }), `${ctx.country} ${JSON.stringify(cc)}`);
      assert.deepEqual(edgeMissingLabels(cc, "x", data), web("x", webCtx, cc), `${ctx.country} ${JSON.stringify(cc)}`);
    }
  }
  // The Canadian SAT/ACT test item names its test step on both sides; a test that is not the SAT/ACT is a plain step.
  const caMissing = edgeMissingLabels({ course: "fixture-course" }, "x", asData(CA_FIXTURE_CONTEXT));
  assert.ok(caMissing.includes("Test scores (Fixture SAT/ACT disclosure)"), JSON.stringify(caMissing));
  assert.ok(caMissing.includes("Fixture Casper test"), JSON.stringify(caMissing));
  assert.ok(!caMissing.some((l) => l.includes("Test scores (Fixture Casper")), JSON.stringify(caMissing));
  assert.deepEqual(edgeProgress({ course: "fixture-course", extra_steps: { casper: true } }, "x", asData(CA_FIXTURE_CONTEXT)).done, 2);
  assert.ok(edgeMissingLabels({}, "harvard").includes("Test scores"));
});

type DlRow = { id: string; kind: string; program_id?: string | null; intake?: "s1" | "s2" | null };

test("digest deadlines equal web deadlinesForEntry (GB with and without a course; AU intakes s1, s2, none and s3)", () => {
  const gbCourse = collegeSteps("ucl")!.courses[0];
  const otherGb = collegeSteps("ucl")!.courses[1];
  const auCourse = collegeSteps("melbourne")!.courses[0];
  const gb: DlRow[] = [
    { id: "U13", kind: "application", program_id: null },
    { id: "U15", kind: "application", program_id: null },
    { id: "S", kind: "scholarship", program_id: null },
    { id: "CX", kind: "application", program_id: gbCourse.id },
    { id: "CY", kind: "application", program_id: otherGb.id },
    { id: "FOREIGN", kind: "application", program_id: "not-a-course-of-this-college" },
    // a course's row of another kind (UCL's "LNAT must be taken by" is Law's): only that course sees it
    { id: "OY", kind: "other", program_id: otherGb.id },
  ];
  const au: DlRow[] = [
    { id: "A1", kind: "application", program_id: null, intake: "s1" },
    { id: "A2", kind: "application", program_id: null, intake: "s2" },
    { id: "A0", kind: "application", program_id: null },
    { id: "AS", kind: "scholarship", program_id: null, intake: "s1" },
    { id: "K1", kind: "application", program_id: auCourse.id, intake: "s1" },
    { id: "K0", kind: "application", program_id: auCourse.id },
  ];
  const cases: { slug: string; rows: DlRow[]; c: Checklist }[] = [];
  for (const course of [null, gbCourse.slug, otherGb.slug, "no-such-course"]) cases.push({ slug: "ucl", rows: gb, c: { course } });
  for (const course of [null, auCourse.slug]) for (const intake of [undefined, null, "s1", "s2", "s3", ""]) cases.push({ slug: "melbourne", rows: au, c: { course, intake: intake as Checklist["intake"] } });
  cases.push({ slug: "harvard", rows: [...gb, ...au], c: { course: gbCourse.slug } }); // US: no course data, rows with a program never show
  for (const { slug, rows, c } of cases) {
    const want = deadlinesForEntry(rows, { course: courseFor(slug, c.course), intake: c.intake }).map((r) => r.id);
    assert.deepEqual(edgeDeadlinesFor(rows, slug, c).map((r) => r.id), want, `${slug} ${JSON.stringify(c)}`);
  }
  // the rules are really applied (not a pass-through)
  assert.deepEqual(edgeDeadlinesFor(gb, "ucl", { course: gbCourse.slug }).map((r) => r.id), ["S", "CX"]);
  assert.deepEqual(edgeDeadlinesFor(gb, "ucl", { course: otherGb.slug }).map((r) => r.id), ["S", "CY", "OY"]);
  assert.deepEqual(edgeDeadlinesFor(gb, "ucl", {}).map((r) => r.id), ["U13", "U15", "S"]);
  assert.deepEqual(edgeDeadlinesFor(au, "melbourne", { course: auCourse.slug, intake: "s1" }).map((r) => r.id), ["AS", "K1", "K0"]);
});

test("a UK college's course deadline reaches both the due-soon and the overdue part, the same on both sides", () => {
  const gbCourse = collegeSteps("ucl")!.courses[0];
  const list = [entry("ucl", { checklist: { course: gbCourse.slug } }), entry("melbourne", { checklist: { course: collegeSteps("melbourne")!.courses[0].slug, intake: "s2" } })];
  const row = (inst: string, due: string, program: string | null, intake: "s1" | "s2" | null = null, label: string | null = null) => ({ ...dl(inst, due, "application", null, label), program_id: program, intake }) as Deadline;
  const deadlines = [
    row("i-ucl", "2026-11-05", null, null, "uni"),
    row("i-ucl", "2026-11-09", gbCourse.id, null, "course"),
    row("i-melbourne", "2026-11-04", null, "s1", "s1 uni"),
    row("i-melbourne", "2026-11-06", null, "s2", "s2 uni"),
    row("i-melbourne", "2026-11-10", collegeSteps("melbourne")!.courses[0].id, "s1", "s1 course"),
  ];
  const r = both(base({ list, deadlines }));
  assert.deepEqual(r.dueSoon.map((d) => d.label), ["s2 uni", "course"]);
  assert.deepEqual(r.dueSoon[0].missing.slice(0, 1), ["Documents sent"]);
  assert.ok(r.dueSoon[1].missing.includes("UCAS personal statement"));
  const late = both(base({ today: "2026-11-30", list, deadlines }));
  assert.deepEqual(late.overdue.map((d) => d.label), ["s2 uni", "course"]);
});

// ?? UCAS reply-by date: the Deno twin of replyByDeadline / withReplyBy ??

type ReplyCase = { slug: string; status: string; checklist: Record<string, unknown>; custom: { name: string } | null };
const rc = (slug: string, status: string, checklist: Record<string, unknown>, custom: ReplyCase["custom"] = null): ReplyCase => ({ slug, status, checklist, custom });

test("digest reply-by equals web replyByDeadline (the cases of uk-offers.test.ts)", () => {
  assert.equal(EDGE_REPLY_BY_LABEL, REPLY_BY_LABEL);
  const by = { uk_reply_by: "2027-05-05" };
  const cases: { entry: ReplyCase; list?: ReplyCase[]; today?: string }[] = [
    { entry: rc("ucl", "admitted", by) },
    { entry: rc("ucl", "admitted", { ...by, uk_reply: "firm" }) },
    { entry: rc("ucl", "submitted", by) },
    ...["2027-5-5", "2027-02-30", "not-a-date"].map((bad) => ({ entry: rc("ucl", "admitted", { uk_reply_by: bad }) })),
    { entry: rc("ucl", "admitted", { uk_reply_by: "2027-03-01" }) },
    { entry: rc("ucl", "admitted", { uk_reply_by: "2027-04-01" }) },
    { entry: rc("harvard", "admitted", by) },
    { entry: rc("ucl", "admitted", { ...by, uk_reply: "FIRM" }) },
    { entry: rc("ucl", "admitted", { ...by, uk_reply: "decline" }) },
    { entry: rc("ucl", "admitted", { ...by, uk_reply: "insurance" }) },
  ];
  // "no reply-by once any UK college is Firm"
  const l = [rc("ucl", "admitted", { ...by, uk_reply: "firm" }), rc("kings-college-london", "admitted", { ...by, uk_reply: "insurance" }), rc("bristol", "admitted", by), rc("warwick", "admitted", by)];
  for (const entry of l) cases.push({ entry, list: l });
  const open = [{ ...l[0], checklist: by }, l[1], l[2], l[3]];
  for (const entry of open) cases.push({ entry, list: open });
  const odd = [l[2], rc("ucl", "submitted", { uk_reply: "firm" })]; // a Firm on a non-admitted UK row still counts
  cases.push({ entry: odd[0], list: odd });
  const us = [l[2], rc("harvard", "admitted", { uk_reply: "firm" }), rc("ucl", "admitted", { uk_reply: "firm" }, { name: "X" })]; // a US or typed-in Firm does not
  cases.push({ entry: us[0], list: us });
  cases.push({ entry: rc("ucl", "admitted", by, { name: "X" }), list: [] }); // a typed-in college never gets one

  let rows = 0;
  for (const { entry, list = [entry], today = "2027-04-01" } of cases) {
    const web = replyByDeadline(entry as never, list as never, today);
    // A digest holds only the colleges from the site's data, never the ones the student typed in.
    const edgeList = list.filter((e) => !e.custom).map((e) => ({ ...e, institutionId: `i-${e.slug}` }));
    const edge = entry.custom ? null : edgeReplyByDeadline({ ...entry, institutionId: `i-${entry.slug}` } as never, edgeList as never, today);
    const msg = JSON.stringify({ entry, list, today });
    assert.equal(edge === null, web === null, msg);
    if (web && edge) {
      assert.deepEqual({ kind: edge.kind, label: edge.label, due_date: edge.due_date, plan_key: edge.plan_key, program_id: edge.program_id, intake: edge.intake }, { kind: web.kind, label: web.label, due_date: web.due_date, plan_key: web.plan_key, program_id: web.program_id, intake: web.intake }, msg);
      rows++;
    }
  }
  assert.ok(rows >= 5, `only ${rows} cases produced a row`);
});

test("the weekly email's due-soon list carries the reply-by row, and never the offer conditions", () => {
  const by = { uk_reply_by: "2026-11-09", uk_conditions: "AAB secret-grades-text" };
  const list = [entry("ucl", { status: "admitted", checklist: by as never }), entry("bristol", { status: "admitted", checklist: { uk_reply_by: "2026-11-12" } })];
  const r = both(base({ list }));
  assert.deepEqual(r.dueSoon.map((d) => [d.slug, d.label, d.due_date]), [["ucl", REPLY_BY_LABEL, "2026-11-09"], ["bristol", REPLY_BY_LABEL, "2026-11-12"]]);
  const mail = renderStudentDigest({ digest: r, appUrl: "https://example.test" });
  assert.ok(mail && mail.text.includes(REPLY_BY_LABEL));
  assert.ok(!mail.text.includes("secret-grades-text") && !mail.html.includes("secret-grades-text"));
  // a Firm on one UK college takes the other's reply-by row away, on both sides
  const firm = [entry("ucl", { status: "admitted", checklist: { uk_reply: "firm" } }), entry("bristol", { status: "admitted", checklist: { uk_reply_by: "2026-11-12" } })];
  assert.deepEqual(both(base({ list: firm })).dueSoon, []);
});

test("index.ts calls due_reply_reminders with the clamped day and logs sent reply reminders to reply_reminder_log", () => {
  const src = readFileSync(new URL("../../supabase/functions/deadline-reminders/index.ts", import.meta.url), "utf8");
  const reminders = /rpc\("due_reminders",\s*\{\s*(\w+)\s*\}\)/.exec(src);
  const replies = /rpc\("due_reply_reminders",\s*\{\s*(\w+)\s*\}\)/.exec(src);
  assert.ok(reminders, 'no rpc("due_reminders", { x }) found');
  assert.ok(replies, 'no rpc("due_reply_reminders", { x }) found');
  assert.equal(replies![1], reminders![1], "both RPCs must take the same today value");
  assert.match(src, new RegExp(`const ${reminders![1]} = clampToday\\(`));
  // The log row sits on the sent path: after the failed-send `continue`, in the same branch as the reminder_log write.
  const loop = src.indexOf("for (const [userId, {");
  const dry = src.indexOf("if (dryRun) {", loop);
  const failedFrom = src.indexOf("if (!res.ok)", dry);
  const failedContinue = src.indexOf("continue;", failedFrom);
  const sentFrom = failedContinue + "continue;".length;
  const sentTo = src.indexOf("results.push({ user: userId, count, status: logErrors.length", sentFrom);
  assert.ok(loop > 0 && dry > loop && failedFrom > dry && failedContinue > failedFrom && sentTo > sentFrom, "sent path not found");
  const sent = src.slice(sentFrom, sentTo);
  assert.ok(sent.includes('.from("reminder_log")'), "reminder_log write not on the sent path");
  assert.ok(sent.includes('.from("reply_reminder_log")'), 'from("reply_reminder_log") not on the sent path');
  assert.equal(src.split('from("reply_reminder_log")').length - 1, 1, "reply_reminder_log must be written only there");
});

test("the edge deadlines select names program_id and intake (and the six existing columns)", () => {
  const src = readFileSync(new URL("../../supabase/functions/deadline-reminders/index.ts", import.meta.url), "utf8");
  const m = /\.from\("deadlines"\)\s*\.select\("([^"]*)"\)/.exec(src);
  assert.ok(m, 'no .from("deadlines").select("...") found');
  const cols = m![1].split(",").map((s) => s.trim());
  for (const col of ["id", "institution_id", "kind", "plan_key", "label", "due_date", "program_id", "intake"]) assert.ok(cols.includes(col), `${col} missing from: ${cols.join(", ")}`);
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
