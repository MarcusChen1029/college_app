import assert from "node:assert/strict";
import { test } from "node:test";
import { awardedTotal, emptyScholarship, scholarshipTone, sortScholarships, validateScholarship, SCHOLARSHIP_LIMITS, type Scholarship } from "./scholarships.ts";

const today = new Date(2026, 9, 25); // 2026-10-25, local

const sch = (o: Partial<Scholarship>): Scholarship => ({ id: "x", createdAt: "2026-10-01T00:00:00Z", ...emptyScholarship(), name: "Gates", ...o });

test("validateScholarship trims and defaults", () => {
  const r = validateScholarship({ ...emptyScholarship(), name: "  Coca-Cola Scholars ", provider: " Coca-Cola ", url: " https://example.org/apply ", amountUsd: "$20,000" });
  assert.deepEqual(r, {
    ok: true,
    value: { name: "Coca-Cola Scholars", provider: "Coca-Cola", amountUsd: 20000, deadline: null, url: "https://example.org/apply", status: "considering", notes: "" },
  });
});

test("validateScholarship mirrors the DB checks", () => {
  const base = { ...emptyScholarship(), name: "A" };
  assert.equal(validateScholarship({ ...base, name: "   " }).ok, false);
  assert.equal(validateScholarship({ ...base, name: "a".repeat(SCHOLARSHIP_LIMITS.name + 1) }).ok, false);
  assert.equal(validateScholarship({ ...base, provider: "p".repeat(SCHOLARSHIP_LIMITS.provider + 1) }).ok, false);
  assert.equal(validateScholarship({ ...base, notes: "n".repeat(SCHOLARSHIP_LIMITS.notes + 1) }).ok, false);
  assert.equal(validateScholarship({ ...base, status: "won" }).ok, false);
  assert.equal(validateScholarship({ ...base, deadline: "2026-02-30" }).ok, false);
  // amount: whole dollars, 0..limit
  assert.equal(validateScholarship({ ...base, amountUsd: -1 }).ok, false);
  assert.equal(validateScholarship({ ...base, amountUsd: 10.5 }).ok, false);
  assert.equal(validateScholarship({ ...base, amountUsd: "abc" }).ok, false);
  assert.equal(validateScholarship({ ...base, amountUsd: SCHOLARSHIP_LIMITS.amount + 1 }).ok, false);
  assert.equal(validateScholarship({ ...base, amountUsd: 0 }).ok, true);
  assert.equal(validateScholarship({ ...base, amountUsd: "" }).ok, true);
  // url: http/https only, no spaces
  assert.equal(validateScholarship({ ...base, url: "javascript:alert(1)" }).ok, false);
  assert.equal(validateScholarship({ ...base, url: "ftp://x.org" }).ok, false);
  assert.equal(validateScholarship({ ...base, url: "https://x.org/a b" }).ok, false);
  assert.equal(validateScholarship({ ...base, url: `https://x.org/${"a".repeat(SCHOLARSHIP_LIMITS.url)}` }).ok, false);
  assert.equal(validateScholarship({ ...base, url: "HTTP://x.org" }).ok, true);
});

test("tone: open and within 7 days (or passed) is urgent, within 21 soon", () => {
  assert.equal(scholarshipTone(sch({ status: "considering", deadline: "2026-11-01" }), today), "urgent"); // 7 days
  assert.equal(scholarshipTone(sch({ status: "applying", deadline: "2026-10-20" }), today), "urgent"); // passed
  assert.equal(scholarshipTone(sch({ status: "applying", deadline: "2026-11-02" }), today), "soon"); // 8 days
  assert.equal(scholarshipTone(sch({ status: "applying", deadline: "2026-11-15" }), today), "soon"); // 21 days
  assert.equal(scholarshipTone(sch({ status: "applying", deadline: "2026-11-16" }), today), "progress"); // 22 days
  assert.equal(scholarshipTone(sch({ status: "considering", deadline: "2027-01-01" }), today), "neutral");
});

test("tone: finished ones ignore the deadline", () => {
  assert.equal(scholarshipTone(sch({ status: "submitted", deadline: "2026-10-26" }), today), "done");
  assert.equal(scholarshipTone(sch({ status: "awarded", deadline: "2026-10-26" }), today), "done");
  assert.equal(scholarshipTone(sch({ status: "declined", deadline: "2026-10-26" }), today), "neutral");
});

test("sort: open by deadline (none last), finished at the bottom", () => {
  const items = [
    sch({ name: "Won", status: "awarded", deadline: "2026-10-01" }),
    sch({ name: "NoDate", status: "applying" }),
    sch({ name: "Later", status: "considering", deadline: "2026-12-01" }),
    sch({ name: "Soon", status: "considering", deadline: "2026-11-01" }),
    sch({ name: "Sent", status: "submitted" }),
    sch({ name: "No", status: "declined" }),
  ];
  assert.deepEqual(sortScholarships(items).map((s) => s.name), ["Soon", "Later", "NoDate", "Sent", "Won", "No"]);
  assert.equal(items[0].name, "Won", "input is not mutated");
});

test("awardedTotal counts awarded amounts only", () => {
  assert.equal(awardedTotal([sch({ status: "awarded", amountUsd: 1000 }), sch({ status: "awarded", amountUsd: null }), sch({ status: "submitted", amountUsd: 5000 })]), 1000);
});
