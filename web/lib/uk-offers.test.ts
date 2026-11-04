import assert from "node:assert/strict";
import { test } from "node:test";
import { canSetReply, INSURANCE_RULE_SOURCE, replyConflicts, ukConditions, ukOfferType, ukReplyBy, ukReplyOf } from "./uk-offers.ts";
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
