import assert from "node:assert/strict";
import { test } from "node:test";
import type { DueState } from "./classwork.ts";
import { dueLabel, dueWhen } from "./due-label.ts";
import { makeT } from "./i18n/index.ts";

const en = makeT("en");
const zh = makeT("zh-TW");
// 2026-11-04 is a Wednesday.
const today = "2026-11-04";
const due = (days: number): DueState => ({ kind: "due", days });

test("dueLabel: no due date", () => {
  assert.equal(dueLabel(en, { kind: "none" }, "en", today), "No due date");
  assert.equal(dueLabel(zh, { kind: "none" }, "zh-TW", today), "沒有到期日");
});

test("dueLabel: today and tomorrow are words, not dates", () => {
  assert.equal(dueLabel(en, due(0), "en", today), "Due today");
  assert.equal(dueLabel(en, due(1), "en", today), "Due tomorrow");
  assert.equal(dueLabel(zh, due(0), "zh-TW", today), "今天到期");
  assert.equal(dueLabel(zh, due(1), "zh-TW", today), "明天到期");
});

test("dueLabel: two to six days ahead is the weekday", () => {
  assert.equal(dueLabel(en, due(2), "en", today), "Due Friday");
  assert.equal(dueLabel(en, due(6), "en", today), "Due Tuesday");
  assert.equal(dueLabel(zh, due(2), "zh-TW", today), "星期五到期");
  assert.equal(dueLabel(zh, due(6), "zh-TW", today), "星期二到期");
});

test("dueLabel: a week or more ahead is the date", () => {
  assert.equal(dueLabel(en, due(7), "en", today), "Due Nov 11");
  assert.equal(dueLabel(en, due(11), "en", today), "Due Nov 15");
  assert.equal(dueLabel(zh, due(7), "zh-TW", today), "11月11日到期");
});

test("dueLabel: counts across month and year ends, and names the year when it is not this one", () => {
  assert.equal(dueLabel(en, due(2), "en", "2026-12-30"), "Due Friday"); // 2027-01-01
  assert.equal(dueLabel(en, due(10), "en", "2026-12-30"), "Due Jan 9, 2027");
  assert.equal(dueLabel(en, due(10), "en", "2026-11-25"), "Due Dec 5");
  assert.equal(dueLabel(en, due(2), "en", "2028-02-27"), "Due Tuesday"); // 2028-02-29 exists (a Tuesday)
  assert.equal(dueWhen(en, 7, "2028-02-27", "en"), "Mar 5");
});

test("dueLabel: missing says how late, singular for one day", () => {
  assert.equal(dueLabel(en, { kind: "missing", daysLate: 1 }, "en", today), "Missing · 1 day late");
  assert.equal(dueLabel(en, { kind: "missing", daysLate: 3 }, "en", today), "Missing · 3 days late");
  assert.equal(dueLabel(zh, { kind: "missing", daysLate: 3 }, "zh-TW", today), "未完成 · 已逾期 3 天");
});

test("dueLabel: done shows the date, or just Done when there is none", () => {
  const at = "2026-10-30T12:00:00Z"; // noon UTC: the same calendar day in every time zone from UTC-11 to UTC+11
  assert.equal(dueLabel(en, { kind: "done", at }, "en", today), "Done Oct 30");
  assert.equal(dueLabel(zh, { kind: "done", at }, "zh-TW", today), "10月30日 完成");
  assert.equal(dueLabel(en, { kind: "done", at: "" }, "en", today), "Done");
  assert.equal(dueLabel(en, { kind: "done", at: "not a time" }, "en", today), "Done");
  assert.equal(dueLabel(zh, { kind: "done", at: "" }, "zh-TW", today), "已完成");
});

test("dueLabel: an unreadable today falls back to No due date, never to an empty or broken label", () => {
  assert.equal(dueLabel(en, due(3), "en", ""), "No due date");
  assert.equal(dueLabel(en, due(0), "en", ""), "Due today");
});
