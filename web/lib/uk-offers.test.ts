import assert from "node:assert/strict";
import { test } from "node:test";
import { canSetReply, INSURANCE_RULE_SOURCE, replyByDeadline, REPLY_BY_LABEL, replyConflicts, withReplyBy, ukConditions, ukOfferType, ukReplyBy, ukReplyOf } from "./uk-offers.ts";
import { upcomingDeadlines } from "./mcp/rules.ts";
import type { Status } from "./student-rows.ts";

// Real slugs, because countryOf reads the static college file.
type E = { slug: string; status: Status; checklist: Record<string, unknown>; custom?: { name: string } | null };
const e = (slug: string, status: Status = "admitted", checklist: Record<string, unknown> = {}, custom: E["custom"] = null): E => ({ slug, status, checklist, custom });
const list = (): never[] =>
  [e("ucl", "admitted", { uk_reply: "firm" }), e("kings-college-london"), e("harvard"), e("custom-row-1", "admitted", { uk_reply: "insurance" }, { name: "Mine" })] as never[];

test("one Firm across UK colleges", () => {
  assert.equal(canSetReply(list(), "kings-college-london", "firm"), false);
  assert.equal(canSetReply(list(), "ucl", "firm"), true);
  assert.equal(canSetReply(list(), "kings-college-london", "insurance"), true, "a custom entry's Insurance doesn't count");
  assert.equal(canSetReply(list(), "kings-college-london", "decline"), true);
  assert.equal(canSetReply(list(), "harvard", "firm"), false);
  assert.equal(canSetReply(list(), "harvard", "decline"), false);
});

test("not admitted yet can't reply", () => {
  const l = [e("ucl", "admitted", { uk_reply: "firm" }), e("kings-college-london", "submitted")] as never[];
  assert.equal(canSetReply(l, "kings-college-london", "firm"), false);
  assert.equal(canSetReply(l, "kings-college-london", "insurance"), false);
  assert.equal(canSetReply(l, "kings-college-london", "decline"), true);
});

test("replyConflicts", () => {
  const two = [e("ucl", "admitted", { uk_reply: "firm" }), e("kings-college-london", "enrolled", { uk_reply: "firm" })] as never[];
  assert.deepEqual(replyConflicts(two), { firm: ["ucl", "kings-college-london"], insurance: [] });
  assert.deepEqual(replyConflicts(list()), { firm: [], insurance: [] });
});

test("invalid stored values read as unset", () => {
  const l = [e("ucl", "admitted", { uk_reply: "FIRM" }), e("kings-college-london")] as never[];
  assert.equal(canSetReply(l, "kings-college-london", "firm"), true);
  assert.deepEqual(replyConflicts(l), { firm: [], insurance: [] });
  assert.equal(ukReplyOf({ uk_reply: "FIRM" }), null);
  assert.equal(ukOfferType({ uk_offer: 3 } as never), null);
  assert.equal(ukReplyBy({ uk_reply_by: "2027-13-01" }), null);
  assert.equal(ukReplyBy({ uk_reply_by: "2027-05-05" }), "2027-05-05");
  assert.equal(ukConditions({ uk_conditions: 5 } as never), "");
  assert.equal(ukConditions({ uk_conditions: "  AAB  " }), "AAB");
  assert.equal(ukConditions({ uk_conditions: "x".repeat(600) }).length, 500);
});

test("unconditional Firm blocks Insurance", { skip: INSURANCE_RULE_SOURCE === null }, () => {
  const l = [e("ucl", "admitted", { uk_reply: "firm", uk_offer: "unconditional" }), e("kings-college-london")] as never[];
  assert.equal(canSetReply(l, "kings-college-london", "insurance"), false);
  const l2 = [e("ucl", "admitted", { uk_offer: "unconditional" }), e("kings-college-london", "admitted", { uk_reply: "insurance" })] as never[];
  assert.equal(canSetReply(l2, "ucl", "firm"), false);
});

const re = (status: string, checklist: Record<string, unknown>, slug = "ucl"): { slug: string; status: string; checklist: Record<string, unknown>; custom: { name: string } | null } => ({ slug, status, checklist, custom: null });
const rb = (x: ReturnType<typeof re>, l: ReturnType<typeof re>[] = [x]) => replyByDeadline(x as never, l as never, "2027-04-01");

test("replyByDeadline", () => {
  const row = rb(re("admitted", { uk_reply_by: "2027-05-05" }));
  assert.deepEqual(row && { id: row.id, kind: row.kind, label: row.label, due: row.due_date, plan: row.plan_key, pid: row.program_id, intake: row.intake }, {
    id: "reply-by:ucl",
    kind: "other",
    label: REPLY_BY_LABEL,
    due: "2027-05-05",
    plan: null,
    pid: null,
    intake: null,
  });
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-05-05", uk_reply: "firm" })), null);
  assert.equal(rb(re("submitted", { uk_reply_by: "2027-05-05" })), null);
  for (const bad of ["2027-5-5", "2027-02-30", "not-a-date"]) assert.equal(rb(re("admitted", { uk_reply_by: bad })), null);
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-03-01" })), null);
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-04-01" }))?.due_date, "2027-04-01");
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-05-05" }, "harvard")), null);
  assert.equal(replyByDeadline({ ...re("admitted", { uk_reply_by: "2027-05-05" }), custom: { name: "X" } } as never, [], "2027-04-01"), null);
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-05-05", uk_reply: "FIRM" }))?.due_date, "2027-05-05");
  assert.equal(rb(re("admitted", { uk_reply_by: "2027-05-05", uk_reply: "decline" })), null);
});

test("no reply-by once any UK college is Firm", () => {
  const by = { uk_reply_by: "2027-05-05" };
  const l = [
    re("admitted", { ...by, uk_reply: "firm" }, "ucl"),
    re("admitted", { ...by, uk_reply: "insurance" }, "kings-college-london"),
    re("admitted", { ...by }, "bristol"),
    re("admitted", { ...by }, "warwick"),
  ];
  assert.equal(rb(l[2], l), null);
  assert.equal(rb(l[3], l), null);
  const open = [{ ...l[0], checklist: { ...by } }, l[1], l[2], l[3]];
  assert.equal(rb(open[0], open)?.due_date, "2027-05-05");
  assert.equal(rb(open[2], open)?.due_date, "2027-05-05");
  assert.equal(rb(open[3], open)?.due_date, "2027-05-05");
  // A Firm on a non-admitted row still counts; a Firm on a US or typed-in row does not.
  const odd = [l[2], re("submitted", { uk_reply: "firm" }, "ucl")];
  assert.equal(rb(odd[0], odd), null);
  const us = [l[2], re("admitted", { uk_reply: "firm" }, "harvard"), { ...re("admitted", { uk_reply: "firm" }, "ucl"), custom: { name: "X" } }];
  assert.equal(rb(us[0], us)?.due_date, "2027-05-05");
});

test("withReplyBy appends once", () => {
  const x = re("admitted", { uk_reply_by: "2027-05-05" });
  const base = [{ id: "a" }, { id: "b" }];
  const once = withReplyBy(base, x as never, [x] as never, "2027-04-01");
  assert.deepEqual(once.map((r) => r.id), ["a", "b", "reply-by:ucl"]);
  assert.deepEqual(withReplyBy(once, x as never, [x] as never, "2027-04-01").map((r) => r.id), ["a", "b", "reply-by:ucl"]);
  assert.equal(withReplyBy(base, re("admitted", {}) as never, [] as never, "2027-04-01"), base);
});

test("upcomingDeadlines (MCP and weekly changes) carries the reply-by row, unless a UK Firm exists", () => {
  const by = { uk_reply_by: "2027-04-10" };
  const mk = (slug: string, checklist: Record<string, unknown>) => ({ slug, name: slug, id: `id-${slug}`, plan: null, status: "admitted" as Status, checklist: checklist as never });
  const today = new Date(2027, 3, 1);
  const open = [mk("ucl", by), mk("bristol", by)];
  assert.deepEqual(upcomingDeadlines(open, [], 30, today).map((d) => [d.slug, d.label, d.due_date]), [["ucl", REPLY_BY_LABEL, "2027-04-10"], ["bristol", REPLY_BY_LABEL, "2027-04-10"]]);
  assert.deepEqual(upcomingDeadlines([mk("ucl", { ...by, uk_reply: "firm" }), mk("bristol", by)], [], 30, today), []);
  assert.deepEqual(upcomingDeadlines([{ slug: "ucl", name: "ucl", id: "x", plan: null }], [], 30, today), []);
});

test("a single-college call still sees a Firm held on another college", () => {
  const by = { uk_reply_by: "2027-04-10" };
  const bristol = { slug: "bristol", name: "bristol", id: "id-bristol", plan: null, status: "admitted" as Status, checklist: by as never };
  const today = new Date(2027, 3, 1);
  const all = [{ slug: "ucl", checklist: { uk_reply: "firm" } as never, custom: null }, { slug: "bristol", checklist: by as never, custom: null }];
  assert.equal(upcomingDeadlines([bristol], [], undefined, today, false)[0]?.label, REPLY_BY_LABEL);
  assert.equal(upcomingDeadlines([bristol], [], undefined, today, false, all)[0], undefined);
});
