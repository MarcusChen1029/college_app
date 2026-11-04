import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DONE_LIMITS,
  byTopic,
  cardDue,
  dueState,
  streamOf,
  todoBuckets,
  todoGroup,
  todoTab,
  upcoming,
  validateDone,
  type WorkItem,
} from "./classwork.ts";

const today = "2026-11-04";

const w = (o: Partial<WorkItem> & { id: string }): WorkItem => ({
  title: o.id,
  dueOn: null,
  done: false,
  doneAt: null,
  topic: null,
  createdAt: "2026-10-01T00:00:00Z",
  ...o,
});

const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

test("DONE_LIMITS mirror the 500-character limits", () => {
  assert.deepEqual({ ...DONE_LIMITS }, { note: 500, link: 500 });
});

test("validateDone trims and turns empty into null", () => {
  assert.deepEqual(validateDone({ note: "  hi " }), { ok: true, note: "hi", link: null });
  assert.deepEqual(validateDone({ note: "", link: "" }), { ok: true, note: null, link: null });
  assert.deepEqual(validateDone({ note: "   ", link: "  " }), { ok: true, note: null, link: null });
  assert.deepEqual(validateDone({}), { ok: true, note: null, link: null });
  assert.deepEqual(validateDone({ note: null, link: undefined }), { ok: true, note: null, link: null });
});

test("validateDone note limit is 500 characters after trimming", () => {
  assert.deepEqual(validateDone({ note: "a".repeat(501) }), { ok: false, error: "note" });
  assert.deepEqual(validateDone({ note: "a".repeat(500) }), { ok: true, note: "a".repeat(500), link: null });
  assert.deepEqual(validateDone({ note: ` ${"a".repeat(500)} ` }), { ok: true, note: "a".repeat(500), link: null });
});

test("validateDone link must be one http(s) address within 500 characters", () => {
  assert.deepEqual(validateDone({ link: "javascript:x" }), { ok: false, error: "link" });
  assert.deepEqual(validateDone({ link: "not a url" }), { ok: false, error: "link" });
  assert.deepEqual(validateDone({ link: "ftp://a.org/x" }), { ok: false, error: "link" });
  assert.deepEqual(validateDone({ link: "https://a.org/x" }), { ok: true, note: null, link: "https://a.org/x" });
  assert.deepEqual(validateDone({ link: "  https://a.org/x " }), { ok: true, note: null, link: "https://a.org/x" });
  const long = `https://a.org/${"x".repeat(500)}`;
  assert.deepEqual(validateDone({ link: long }), { ok: false, error: "link" });
});

test("validateDone rejects non-string values", () => {
  assert.deepEqual(validateDone({ note: 5 }), { ok: false, error: "note" });
  assert.deepEqual(validateDone({ link: 5 }), { ok: false, error: "link" });
});

test("dueState", () => {
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-11-04" }), today), { kind: "due", days: 0 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-11-10" }), today), { kind: "due", days: 6 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-11-03" }), today), { kind: "missing", daysLate: 1 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-10-01" }), today), { kind: "missing", daysLate: 34 });
  assert.deepEqual(dueState(w({ id: "a" }), today), { kind: "none" });
  assert.deepEqual(
    dueState(w({ id: "a", dueOn: "2026-10-01", done: true, doneAt: "2026-10-02T09:00:00Z" }), today),
    { kind: "done", at: "2026-10-02T09:00:00Z" },
  );
  assert.equal(dueState(w({ id: "a", done: true, doneAt: "2026-11-01T00:00:00Z" }), today).kind, "done");
});

test("dueState counts calendar days across month and year ends", () => {
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2027-01-01" }), "2026-12-31"), { kind: "due", days: 1 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-12-31" }), "2027-01-01"), { kind: "missing", daysLate: 1 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2026-03-01" }), "2026-02-28"), { kind: "due", days: 1 });
  assert.deepEqual(dueState(w({ id: "a", dueOn: "2028-03-01" }), "2028-02-28"), { kind: "due", days: 2 });
});

test("todoTab", () => {
  assert.equal(todoTab(w({ id: "a", dueOn: "2026-11-04" }), today), "assigned");
  assert.equal(todoTab(w({ id: "a" }), today), "assigned");
  assert.equal(todoTab(w({ id: "a", dueOn: "2026-11-03" }), today), "missing");
  assert.equal(todoTab(w({ id: "a", dueOn: "2026-11-03", done: true, doneAt: "2026-11-02T00:00:00Z" }), today), "done");
  assert.equal(todoTab(w({ id: "a", done: true, doneAt: "2026-11-02T00:00:00Z" }), today), "done");
});

test("todoGroup: this week is 0-6 days, next week 7-13, later 14+, no date", () => {
  const g = (dueOn: string | null) => todoGroup(w({ id: "a", dueOn }), today);
  assert.equal(g("2026-11-04"), "this_week");
  assert.equal(g("2026-11-10"), "this_week");
  assert.equal(g("2026-11-11"), "next_week");
  assert.equal(g("2026-11-17"), "next_week");
  assert.equal(g("2026-11-18"), "later");
  assert.equal(g("2027-06-01"), "later");
  assert.equal(g(null), "no_date");
});

test("todoBuckets groups items and orders each list", () => {
  const items = [
    w({ id: "today", dueOn: "2026-11-04" }),
    w({ id: "d6", dueOn: "2026-11-10" }),
    w({ id: "d7", dueOn: "2026-11-11" }),
    w({ id: "d13", dueOn: "2026-11-17" }),
    w({ id: "d14", dueOn: "2026-11-18" }),
    w({ id: "nodate-b", title: "B undated" }),
    w({ id: "nodate-a", title: "A undated" }),
    w({ id: "late1", dueOn: "2026-11-03" }),
    w({ id: "late5", dueOn: "2026-10-30" }),
    w({ id: "late2", dueOn: "2026-11-02" }),
    w({ id: "done-old", dueOn: "2026-10-01", done: true, doneAt: "2026-10-02T00:00:00Z" }),
    w({ id: "done-new", dueOn: "2026-12-01", done: true, doneAt: "2026-11-03T00:00:00Z" }),
  ];
  const b = todoBuckets(items, today);
  assert.deepEqual(ids(b.assigned.this_week), ["today", "d6"]);
  assert.deepEqual(ids(b.assigned.next_week), ["d7", "d13"]);
  assert.deepEqual(ids(b.assigned.later), ["d14"]);
  assert.deepEqual(ids(b.assigned.no_date), ["nodate-a", "nodate-b"]);
  assert.deepEqual(ids(b.missing), ["late1", "late2", "late5"]);
  assert.deepEqual(ids(b.done), ["done-new", "done-old"]);
});

test("todoBuckets: same due date sorts by title; input is not mutated; empty input gives empty lists", () => {
  const items = [
    w({ id: "z", title: "Zeta", dueOn: "2026-11-05" }),
    w({ id: "a", title: "Alpha", dueOn: "2026-11-05" }),
    w({ id: "e", title: "Early", dueOn: "2026-11-04" }),
  ];
  const before = ids(items);
  const b = todoBuckets(items, today);
  assert.deepEqual(ids(b.assigned.this_week), ["e", "a", "z"]);
  assert.deepEqual(ids(items), before);
  const empty = todoBuckets([], today);
  assert.deepEqual(empty, { assigned: { this_week: [], next_week: [], later: [], no_date: [] }, missing: [], done: [] });
});

test("todoBuckets keeps the caller's item type", () => {
  const items = [{ ...w({ id: "a", dueOn: "2026-11-05" }), className: "Seniors" }];
  const b = todoBuckets(items, today);
  assert.equal(b.assigned.this_week[0].className, "Seniors");
});

test("upcoming excludes done, missing and undated; nearest first; max 3", () => {
  const items = [
    w({ id: "d9", dueOn: "2026-11-13" }),
    w({ id: "late", dueOn: "2026-11-03" }),
    w({ id: "done", dueOn: "2026-11-05", done: true, doneAt: "2026-11-01T00:00:00Z" }),
    w({ id: "none" }),
    w({ id: "d0", dueOn: "2026-11-04" }),
    w({ id: "d2", dueOn: "2026-11-06" }),
    w({ id: "d5", dueOn: "2026-11-09" }),
  ];
  assert.deepEqual(ids(upcoming(items, today)), ["d0", "d2", "d5"]);
  assert.deepEqual(ids(upcoming(items, today, 10)), ["d0", "d2", "d5", "d9"]);
  assert.deepEqual(ids(upcoming(items, today, 1)), ["d0"]);
  assert.deepEqual(upcoming([], today), []);
});

test("cardDue puts a missing item before a due one; max 2", () => {
  const items = [
    w({ id: "d1", dueOn: "2026-11-05" }),
    w({ id: "late", dueOn: "2026-11-03" }),
    w({ id: "d0", dueOn: "2026-11-04" }),
    w({ id: "done", dueOn: "2026-11-02", done: true, doneAt: "2026-11-01T00:00:00Z" }),
  ];
  assert.deepEqual(ids(cardDue(items, today)), ["late", "d0"]);
  assert.deepEqual(ids(cardDue(items, today, 3)), ["late", "d0", "d1"]);
  assert.deepEqual(ids(cardDue([w({ id: "d1", dueOn: "2026-11-05" })], today)), ["d1"]);
  assert.deepEqual(cardDue([], today), []);
});

test("cardDue lists most recently missed first, and skips undated items", () => {
  const items = [
    w({ id: "late5", dueOn: "2026-10-30" }),
    w({ id: "late1", dueOn: "2026-11-03" }),
    w({ id: "none" }),
  ];
  assert.deepEqual(ids(cardDue(items, today, 5)), ["late1", "late5"]);
});

test("byTopic: no-topic group first, then topics by newest createdAt; items newest first", () => {
  const items = [
    w({ id: "t-none", topic: null, createdAt: "2026-10-05T00:00:00Z" }),
    w({ id: "t-college-old", topic: "College list", createdAt: "2026-10-01T00:00:00Z" }),
    w({ id: "t-apps-1", topic: "Applications", createdAt: "2026-10-10T00:00:00Z" }),
    w({ id: "t-apps-2", topic: "Applications", createdAt: "2026-10-12T00:00:00Z" }),
  ];
  const groups = byTopic(items);
  assert.deepEqual(groups.map((g) => g.topic), [null, "Applications", "College list"]);
  assert.deepEqual(ids(groups[1].items), ["t-apps-2", "t-apps-1"]);
  assert.deepEqual(ids(groups[0].items), ["t-none"]);
  assert.deepEqual(byTopic([]), []);
});

test("byTopic: no null group when every item has a topic; a topic's newest item decides its place", () => {
  const items = [
    w({ id: "a1", topic: "A", createdAt: "2026-10-01T00:00:00Z" }),
    w({ id: "a2", topic: "A", createdAt: "2026-10-20T00:00:00Z" }),
    w({ id: "b1", topic: "B", createdAt: "2026-10-10T00:00:00Z" }),
  ];
  const groups = byTopic(items);
  assert.deepEqual(groups.map((g) => g.topic), ["A", "B"]);
});

test("streamOf: pinned posts first, everything else newest first", () => {
  const posts = [
    { id: "p-old-pinned", createdAt: "2026-10-01T00:00:00Z", pinned: true },
    { id: "p-new", createdAt: "2026-11-02T00:00:00Z", pinned: false },
    { id: "p-mid", createdAt: "2026-10-20T00:00:00Z", pinned: false },
    { id: "p-pinned-2", createdAt: "2026-10-15T00:00:00Z", pinned: true },
  ];
  const tasks = [
    w({ id: "t-newest", createdAt: "2026-11-03T00:00:00Z" }),
    w({ id: "t-between", createdAt: "2026-10-25T00:00:00Z" }),
  ];
  const s = streamOf(posts, tasks);
  assert.deepEqual(
    s.map((e) => (e.kind === "post" ? e.post.id : e.task.id)),
    ["p-pinned-2", "p-old-pinned", "t-newest", "p-new", "t-between", "p-mid"],
  );
  assert.deepEqual(s.map((e) => e.kind), ["post", "post", "task", "post", "task", "post"]);
  for (const e of s) assert.equal(e.at, e.kind === "post" ? e.post.createdAt : e.task.createdAt);
  assert.equal(s.filter((e) => e.pinned).length, 2);
  assert.ok(s.filter((e) => e.kind === "task").every((e) => e.pinned === false));
});

test("streamOf: empty inputs", () => {
  assert.deepEqual(streamOf([], []), []);
});
