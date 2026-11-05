import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CURRENCIES,
  emptyScholarship,
  formatMoney,
  readStoredScholarship,
  scholarshipTone,
  sortScholarships,
  totalsByCurrency,
  validateScholarship,
  SCHOLARSHIP_LIMITS,
  type Scholarship,
} from "./scholarships.ts";
import { fromScholarship, readScholarshipRows, SCHOLARSHIP_COLUMNS, SCHOLARSHIP_COLUMNS_BEFORE_CURRENCY, scholarshipColumns, toScholarship } from "./student-rows.ts";
import { parseLocal } from "./student-local.ts";

const today = new Date(2026, 9, 25); // 2026-10-25, local

const sch = (o: Partial<Scholarship>): Scholarship => ({ id: "x", createdAt: "2026-10-01T00:00:00Z", ...emptyScholarship(), name: "Gates", ...o });

test("validateScholarship trims and defaults", () => {
  const r = validateScholarship({ ...emptyScholarship(), name: "  Coca-Cola Scholars ", provider: " Coca-Cola ", url: " https://example.org/apply ", amount: "$20,000" });
  assert.deepEqual(r, {
    ok: true,
    value: { name: "Coca-Cola Scholars", provider: "Coca-Cola", amount: 20000, currency: "USD", deadline: null, url: "https://example.org/apply", status: "considering", notes: "" },
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
  // amount: whole number, 0..limit
  assert.equal(validateScholarship({ ...base, amount: -1 }).ok, false);
  assert.equal(validateScholarship({ ...base, amount: 10.5 }).ok, false);
  assert.equal(validateScholarship({ ...base, amount: "abc" }).ok, false);
  assert.equal(validateScholarship({ ...base, amount: SCHOLARSHIP_LIMITS.amount + 1 }).ok, false);
  assert.equal(validateScholarship({ ...base, amount: 0 }).ok, true);
  assert.equal(validateScholarship({ ...base, amount: "" }).ok, true);
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

test("totalsByCurrency never mixes currencies", () =>
  assert.deepEqual(
    totalsByCurrency([{ amount: 1000, currency: "USD" }, { amount: 500, currency: "GBP" }, { amount: null, currency: "CAD" }, { amount: 250, currency: "USD" }]),
    [{ currency: "USD", total: 1250 }, { currency: "GBP", total: 500 }],
  ));

test("totalsByCurrency follows CURRENCIES order and keeps a real zero", () => {
  assert.deepEqual(totalsByCurrency([{ amount: 5, currency: "AUD" }, { amount: 0, currency: "GBP" }]), [{ currency: "GBP", total: 0 }, { currency: "AUD", total: 5 }]);
  assert.deepEqual(totalsByCurrency([]), []);
  assert.deepEqual(totalsByCurrency([{ amount: null, currency: "USD" }]), []);
});

test("old rows read as USD", () => {
  const row = { id: "x", name: "A", provider: null, amount_usd: 900, deadline: null, url: null, status: "considering" as const, notes: null, created_at: "2026-10-01T00:00:00Z" };
  assert.equal(toScholarship(row).currency, "USD", "no currency column");
  assert.equal(toScholarship({ ...row, currency: null }).currency, "USD");
  assert.equal(toScholarship({ ...row, currency: "EUR" }).currency, "USD");
  assert.equal(toScholarship({ ...row, currency: "GBP" }).currency, "GBP");
  assert.equal(toScholarship(row).amount, 900);
  // A copy saved in this browser by an older build: amountUsd becomes amount, no currency becomes USD.
  const old = readStoredScholarship({ id: "y", name: "B", amountUsd: 750 });
  assert.equal(old.amount, 750);
  assert.equal(old.currency, "USD");
  assert.ok(!("amountUsd" in old));
  assert.equal(readStoredScholarship({ id: "z", amount: 5, currency: "CAD" }).currency, "CAD");
  const local = parseLocal(JSON.stringify({ scholarships: [{ id: "y", name: "B", amountUsd: 750 }] }));
  assert.deepEqual([local.data.scholarships[0].amount, local.data.scholarships[0].currency], [750, "USD"]);
});

test("validator rejects other currencies", () => {
  const base = { ...emptyScholarship(), name: "A" };
  for (const bad of ["EUR", "usd", "$", 5]) assert.equal(validateScholarship({ ...base, currency: bad }).ok, false, String(bad));
  for (const c of CURRENCIES) assert.equal(validateScholarship({ ...base, currency: c }).ok, true, c);
  const r = validateScholarship({ ...base, amount: "1,500", currency: "GBP" });
  assert.ok(r.ok && r.value.currency === "GBP" && r.value.amount === 1500);
  const none = validateScholarship({ name: "A", status: "considering" });
  assert.ok(none.ok && none.value.currency === "USD");
});

test("formatMoney", () => {
  const gbp = formatMoney(5000, "GBP", "en");
  assert.ok(gbp.includes("£") && gbp.includes("5,000"), gbp);
  assert.ok(!gbp.includes("."), "no decimals");
  const [usd, cad, aud] = [formatMoney(5000, "USD", "en"), formatMoney(5000, "CAD", "en"), formatMoney(5000, "AUD", "en")];
  assert.equal(new Set([usd, cad, aud, gbp]).size, 4, `${usd} ${cad} ${aud} ${gbp}`);
  assert.ok(formatMoney(5000, "GBP", "zh-TW").includes("5,000"));
});

test("changing GBP back to USD is written", () => {
  const gbp = sch({ amount: 500, currency: "GBP" });
  const edited = { ...gbp, currency: "USD" as const };
  assert.equal(scholarshipColumns(edited).currency, "USD", "an update row always carries the currency");
  assert.equal(fromScholarship("u1", gbp).currency, "GBP", "an insert carries its currency");
  assert.equal(fromScholarship("u1", gbp).amount_usd, 500, "the column keeps its name");
});

test("with the column missing neither row has a currency key, and the select drops it", async () => {
  const s = sch({ currency: "GBP" });
  assert.ok(!("currency" in scholarshipColumns(s, { currencyColumn: false })));
  assert.ok(!("currency" in fromScholarship("u1", s, { currencyColumn: false })));
  assert.equal(scholarshipColumns(s, { currencyColumn: true }).currency, "GBP");
  assert.deepEqual(SCHOLARSHIP_COLUMNS_BEFORE_CURRENCY.split(", "), SCHOLARSHIP_COLUMNS.split(", ").filter((c) => c !== "currency"));
  const asked: string[] = [];
  const r = await readScholarshipRows(async (columns) => {
    asked.push(columns);
    return columns.includes("currency") ? { data: null as unknown, error: { code: "42703" } } : { data: [] as unknown, error: null };
  });
  assert.equal(r.currencyColumn, false);
  assert.equal(r.result.error, null);
  assert.deepEqual(asked, [SCHOLARSHIP_COLUMNS, SCHOLARSHIP_COLUMNS_BEFORE_CURRENCY]);
  const ok = await readScholarshipRows(async () => ({ data: [] as unknown, error: null }));
  assert.equal(ok.currencyColumn, true);
  // Another error is not a missing column: no second read.
  let calls = 0;
  const other = await readScholarshipRows(async () => (calls++, { data: null as unknown, error: { code: "42P01" } }));
  assert.equal(calls, 1);
  assert.equal(other.currencyColumn, true);
});
