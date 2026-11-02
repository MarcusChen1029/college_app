import assert from "node:assert/strict";
import { test } from "node:test";
import { entriesSince, groupByDate, REFRESH_LOG, type RefreshEntry } from "./refresh-log.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

test("entries are newest first with ISO dates", () => {
  assert.ok(REFRESH_LOG.length > 0);
  for (const e of REFRESH_LOG) {
    assert.match(e.date, ISO, e.date);
    // A real calendar day, not 2026-13-45.
    assert.equal(new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10), e.date, e.date);
  }
  for (let i = 1; i < REFRESH_LOG.length; i++) {
    assert.ok(REFRESH_LOG[i - 1].date >= REFRESH_LOG[i].date, `${REFRESH_LOG[i - 1].date} should not come before ${REFRESH_LOG[i].date}`);
  }
});

test("every entry has a non-empty en and zh title and summary", () => {
  for (const e of REFRESH_LOG) {
    for (const lang of ["en", "zh"] as const) {
      for (const field of ["title", "summary"] as const) {
        assert.ok(typeof e[lang][field] === "string" && e[lang][field].trim() !== "", `${e.date} ${lang}.${field}`);
      }
    }
    assert.ok(e.count === undefined || (Number.isInteger(e.count) && e.count > 0), `${e.date} count`);
  }
});

test("the English and Chinese texts of an entry agree on its numbers", () => {
  const numbers = (s: string) => (s.match(/\d+/g) ?? []).sort();
  for (const e of REFRESH_LOG) {
    assert.deepEqual(numbers(`${e.zh.title} ${e.zh.summary}`), numbers(`${e.en.title} ${e.en.summary}`), e.date);
  }
});

test("groupByDate shows each day once and keeps every entry in order", () => {
  const e = (date: string, n: string): RefreshEntry => ({ date, en: { title: n, summary: n }, zh: { title: n, summary: n } });
  const log = [e("2026-10-27", "c"), e("2026-10-27", "b"), e("2026-10-22", "a")];
  assert.deepEqual(
    groupByDate(log).map((g) => [g.date, g.entries.map((x) => x.en.title)]),
    [["2026-10-27", ["c", "b"]], ["2026-10-22", ["a"]]],
  );
  assert.deepEqual(groupByDate([]), []);
  const days = groupByDate().map((g) => g.date);
  assert.equal(new Set(days).size, days.length, "a day appears in two groups");
  assert.equal(groupByDate().reduce((n, g) => n + g.entries.length, 0), REFRESH_LOG.length);
});

test("entriesSince keeps only entries dated on or after the day", () => {
  const log: RefreshEntry[] = [
    { date: "2026-10-28", en: { title: "c", summary: "c" }, zh: { title: "c", summary: "c" } },
    { date: "2026-10-27", en: { title: "b", summary: "b" }, zh: { title: "b", summary: "b" } },
    { date: "2026-10-26", en: { title: "a", summary: "a" }, zh: { title: "a", summary: "a" } },
  ];
  assert.deepEqual(entriesSince("2026-10-27", log).map((e) => e.date), ["2026-10-28", "2026-10-27"]);
  assert.deepEqual(entriesSince("2026-10-29", log), []);
  assert.deepEqual(entriesSince("2026-01-01", log).length, 3);
  // The shipped log, from a day that is in it.
  const from = "2026-10-27";
  const some = entriesSince(from);
  assert.ok(some.length > 0);
  assert.ok(some.every((e) => e.date >= from));
  assert.equal(some.length, REFRESH_LOG.filter((e) => e.date >= from).length);
});
