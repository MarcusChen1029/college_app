import assert from "node:assert/strict";
import { test } from "node:test";
import { studentHref } from "./anchors.ts";
import { themeFor } from "./class-theme.ts";
import { classHasUnread, classPath, homeCards, initialOf, oneOnOnePath, oneOnOneHasUnread, taskPath } from "./classes-home.ts";
import type { Conversation, StudentPost } from "./classroom.ts";
import type { MyTeacher } from "./links-api.ts";
import type { StudentTask } from "./tasks.ts";

const today = "2026-11-04";

const teacher = (o: Partial<MyTeacher> & { teacherId: string }): MyTeacher => ({
  displayName: "Ms. Lin",
  school: null,
  linkedAt: "2026-09-01T00:00:00Z",
  shareEssays: false,
  classNames: [],
  classIds: [],
  classThemes: [],
  classYears: [],
  classArchived: [],
  ...o,
});

const withClass = (teacherId: string, id: string, name: string, extra: { theme?: string | null; year?: string | null; archived?: boolean } = {}): MyTeacher =>
  teacher({ teacherId, classNames: [name], classIds: [id], classThemes: [extra.theme ?? null], classYears: [extra.year ?? null], classArchived: [extra.archived ?? false] });

const task = (o: Partial<StudentTask> & { id: string }): StudentTask => ({
  teacherId: "t1",
  teacherName: "Ms. Lin",
  classId: null,
  className: null,
  title: o.id,
  details: "",
  dueOn: null,
  done: false,
  doneAt: null,
  about: null,
  createdAt: "2026-10-01T00:00:00Z",
  topic: null,
  note: null,
  link: null,
  ...o,
});

const post = (o: Partial<StudentPost> & { id: string }): StudentPost => ({
  teacherId: "t1",
  classId: null,
  className: null,
  title: o.id,
  body: "",
  link: null,
  pinned: false,
  createdAt: "2026-10-01T00:00:00Z",
  read: true,
  ...o,
});

const conv = (o: Partial<Conversation> & { id: string }): Conversation => ({
  otherId: "t1",
  otherName: "Ms. Lin",
  about: { anchor: { kind: "general", ref: null }, label: null, available: true },
  status: "open",
  startedBy: "student",
  lastMessageAt: "2026-10-01T00:00:00Z",
  lastAuthor: "student",
  lastBody: "hi",
  unread: 0,
  ...o,
});

const none = { posts: [], tasks: [], conversations: [] };
const keys = (cards: { key: string }[]) => cards.map((c) => c.key);

test("a class and a teacher give a class card and a 1-on-1 card", () => {
  const cards = homeCards({ ...none, teachers: [withClass("t1", "c1", "Senior A", { theme: "mint", year: "2026-27" })] }, today);
  assert.deepEqual(keys(cards).sort(), ["class:c1", "one:t1"]);
  const c = cards.find((x) => x.kind === "class");
  assert.ok(c && c.kind === "class");
  assert.equal(c.name, "Senior A");
  assert.equal(c.year, "2026-27");
  assert.equal(c.theme, "mint");
  assert.equal(c.classId, "c1");
});

test("a class without a stored (or with an invalid) theme gets the stable one from its id; a 1-on-1 card's comes from the teacher id", () => {
  for (const theme of [null, "pink"]) {
    const cards = homeCards({ ...none, teachers: [withClass("t1", "c1", "Senior A", { theme })] }, today);
    assert.equal(cards.find((x) => x.kind === "class")?.theme, themeFor("c1"));
    assert.equal(cards.find((x) => x.kind === "oneOnOne")?.theme, themeFor("t1"));
  }
});

test("an archived class has no card, but the teacher keeps the 1-on-1 card", () => {
  const cards = homeCards({ ...none, teachers: [withClass("t1", "c1", "Old class", { archived: true })] }, today);
  assert.deepEqual(keys(cards), ["one:t1"]);
});

test("a teacher with no classes has only the 1-on-1 card", () => {
  assert.deepEqual(keys(homeCards({ ...none, teachers: [teacher({ teacherId: "t1" })] }, today)), ["one:t1"]);
});

test("class names that do not line up with their ids give no class card (nothing to link to)", () => {
  const t = teacher({ teacherId: "t1", classNames: ["A", "B"], classIds: ["c1"], classThemes: [null], classYears: [null], classArchived: [false] });
  assert.deepEqual(keys(homeCards({ ...none, teachers: [t] }, today)), ["one:t1"]);
});

test("no teachers, no cards", () => {
  assert.deepEqual(homeCards({ ...none, teachers: [] }, today), []);
});

test("a class card shows that class's open tasks only, two at most: missed first, then the nearest due", () => {
  const tasks = [
    task({ id: "soon", classId: "c1", dueOn: "2026-11-06" }),
    task({ id: "late", classId: "c1", dueOn: "2026-11-01" }),
    task({ id: "later", classId: "c1", dueOn: "2026-11-20" }),
    task({ id: "done", classId: "c1", dueOn: "2026-11-05", done: true, doneAt: "2026-11-03T00:00:00Z" }),
    task({ id: "undated", classId: "c1" }),
    task({ id: "other class", classId: "c2", dueOn: "2026-11-05" }),
    task({ id: "private", classId: null, dueOn: "2026-11-05" }),
  ];
  const c = homeCards({ ...none, tasks, teachers: [withClass("t1", "c1", "Senior A")] }, today).find((x) => x.kind === "class");
  assert.deepEqual(c?.due.map((x) => x.id), ["late", "soon"]);
});

test("a 1-on-1 card shows the private tasks only", () => {
  const tasks = [task({ id: "p1", dueOn: "2026-11-05" }), task({ id: "p2", dueOn: "2026-11-09" }), task({ id: "p3", dueOn: "2026-11-10" }), task({ id: "class", classId: "c1", dueOn: "2026-11-05" })];
  const c = homeCards({ ...none, tasks, teachers: [withClass("t1", "c1", "Senior A")] }, today).find((x) => x.kind === "oneOnOne");
  assert.deepEqual(c?.due.map((x) => x.id), ["p1", "p2"]);
});

test("another teacher's tasks, posts and conversations never reach this teacher's cards", () => {
  const i = {
    teachers: [withClass("t1", "c1", "Senior A"), teacher({ teacherId: "t2", displayName: "Mr. Wu" })],
    tasks: [task({ id: "wu", teacherId: "t2", dueOn: "2026-11-05" })],
    posts: [post({ id: "wu-post", teacherId: "t2", read: false })],
    conversations: [conv({ id: "wu-conv", otherId: "t2", unread: 2 })],
  };
  const cards = homeCards(i, today);
  assert.deepEqual(cards.find((x) => x.key === "one:t1")?.due, []);
  assert.equal(cards.find((x) => x.key === "one:t1")?.unread, false);
  assert.equal(cards.find((x) => x.key === "class:c1")?.unread, false);
  assert.equal(cards.find((x) => x.key === "one:t2")?.unread, true);
  assert.deepEqual(cards.find((x) => x.key === "one:t2")?.due.map((x) => x.id), ["wu"]);
});

// ---- dots ----

test("a class card's dot is an unread announcement to that class", () => {
  assert.equal(classHasUnread([post({ id: "a", classId: "c1", read: false })], "c1"), true);
  assert.equal(classHasUnread([post({ id: "a", classId: "c1", read: true })], "c1"), false);
  assert.equal(classHasUnread([post({ id: "a", classId: "c2", read: false })], "c1"), false);
});

test("an announcement to all students lights the 1-on-1 card only, never a class card", () => {
  const i = { ...none, teachers: [withClass("t1", "c1", "Senior A"), withClass("t1b", "c9", "Other")], posts: [post({ id: "all", classId: null, read: false })] };
  const cards = homeCards(i, today);
  assert.equal(cards.find((x) => x.key === "one:t1")?.unread, true);
  assert.equal(cards.find((x) => x.key === "class:c1")?.unread, false);
  assert.equal(cards.find((x) => x.key === "class:c9")?.unread, false);
  assert.equal(cards.find((x) => x.key === "one:t1b")?.unread, false);
});

test("a class announcement lights its class card, not the 1-on-1 card", () => {
  const cards = homeCards({ ...none, teachers: [withClass("t1", "c1", "Senior A")], posts: [post({ id: "a", classId: "c1", read: false })] }, today);
  assert.equal(cards.find((x) => x.key === "class:c1")?.unread, true);
  assert.equal(cards.find((x) => x.key === "one:t1")?.unread, false);
});

test("an unread comment lights the 1-on-1 card; a read one does not", () => {
  assert.equal(oneOnOneHasUnread([], [conv({ id: "c", unread: 1 })], "t1"), true);
  assert.equal(oneOnOneHasUnread([], [conv({ id: "c", unread: 0 })], "t1"), false);
  assert.equal(oneOnOneHasUnread([], [conv({ id: "c", otherId: "t2", unread: 1 })], "t1"), false);
  assert.equal(oneOnOneHasUnread([post({ id: "all", classId: null, read: true })], [], "t1"), false);
});

// ---- order ----

test("cards are ordered by their newest activity", () => {
  const i = {
    teachers: [withClass("t1", "c1", "Senior A"), withClass("t2", "c2", "Senior B")],
    posts: [post({ id: "p", classId: "c1", createdAt: "2026-10-05T00:00:00Z" })],
    tasks: [task({ id: "x", teacherId: "t2", classId: "c2", createdAt: "2026-10-20T00:00:00Z" })],
    conversations: [conv({ id: "m", otherId: "t1", lastMessageAt: "2026-10-30T00:00:00Z" })],
  };
  // t1's 1-on-1 (a comment on Oct 30), then c2 (task Oct 20), then c1 (post Oct 5), then t2's 1-on-1 (only the link, Sep 1)
  assert.deepEqual(keys(homeCards(i, today)), ["one:t1", "class:c2", "class:c1", "one:t2"]);
});

test("a card is never older than the link, and the link time decides when nothing else is there", () => {
  const i = {
    ...none,
    teachers: [teacher({ teacherId: "t1", linkedAt: "2026-09-01T00:00:00Z" }), teacher({ teacherId: "t2", linkedAt: "2026-10-15T00:00:00Z" })],
    posts: [post({ id: "old", teacherId: "t1", classId: null, createdAt: "2026-01-01T00:00:00Z" })],
  };
  assert.deepEqual(keys(homeCards(i, today)), ["one:t2", "one:t1"]);
});

test("ties put class cards before 1-on-1 cards, and the order is the same whatever order the input came in", () => {
  const a = withClass("t1", "c1", "Senior A");
  const b = withClass("t2", "c2", "Senior B");
  const forward = keys(homeCards({ ...none, teachers: [a, b] }, today));
  const backward = keys(homeCards({ ...none, teachers: [b, a] }, today));
  assert.deepEqual(forward, backward);
  assert.deepEqual(forward, ["class:c1", "class:c2", "one:t1", "one:t2"]);
});

test("an unreadable timestamp counts as the oldest, not as NaN", () => {
  const i = {
    ...none,
    teachers: [teacher({ teacherId: "t1", linkedAt: "2026-09-01T00:00:00Z" }), teacher({ teacherId: "t2", linkedAt: "2026-09-02T00:00:00Z" })],
    conversations: [conv({ id: "m", otherId: "t1", lastMessageAt: "not a date" })],
  };
  assert.deepEqual(keys(homeCards(i, today)), ["one:t2", "one:t1"]);
});

test("homeCards does not change its input", () => {
  const teachers = [withClass("t1", "c1", "Senior A"), withClass("t2", "c2", "Senior B")];
  const before = JSON.stringify(teachers);
  homeCards({ ...none, teachers }, today);
  assert.equal(JSON.stringify(teachers), before);
});

// ---- addresses ----

test("the addresses encode their ids and match the task link the anchors use", () => {
  assert.equal(classPath("c1"), "/counselor/class/c1");
  assert.equal(oneOnOnePath("t 1/2"), "/counselor/teacher/t%201%2F2");
  assert.equal(taskPath("a?b"), "/counselor/task/a%3Fb");
  assert.equal(taskPath("x1"), studentHref({ kind: "task", ref: "x1" }));
});

// ---- avatar ----

test("initialOf is the first character, upper case", () => {
  assert.equal(initialOf("Ms. Lin"), "M");
  assert.equal(initialOf("  lin"), "L");
  assert.equal(initialOf("林老師"), "林");
  assert.equal(initialOf("😀 Wu"), "😀");
  assert.equal(initialOf("   "), "?");
  assert.equal(initialOf(""), "?");
});
