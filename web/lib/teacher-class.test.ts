import assert from "node:assert/strict";
import { test } from "node:test";
import type { TeacherPost } from "./classroom.ts";
import { dueState, streamOf } from "./classwork.ts";
import type { LinkedStudent } from "./links-api.ts";
import { makeT } from "./i18n/index.ts";
import { classFeedPosts, classWork, isForAllStudents, nextDueTask, studentsIn, teacherClassPath, teacherDueLabel, teacherWorkLabel } from "./teacher-class.ts";
import type { TeacherTask } from "./tasks.ts";

const task = (o: Partial<TeacherTask> & { id: string }): TeacherTask => ({
  classId: "c1",
  className: "Grade 12",
  classArchived: false,
  studentId: null,
  studentName: null,
  title: o.id,
  details: "",
  dueOn: null,
  archived: false,
  createdAt: "2026-10-01T00:00:00Z",
  doneCount: 0,
  totalCount: 0,
  about: null,
  topic: null,
  ...o,
});

const post = (o: Partial<TeacherPost> & { id: string }): TeacherPost => ({
  classId: "c1",
  className: "Grade 12",
  title: o.id,
  body: "",
  link: null,
  pinned: false,
  archived: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  audience: 3,
  readCount: 1,
  ...o,
});

const student = (id: string, classIds: string[]): LinkedStudent => ({ studentId: id, displayName: id, email: `${id}@x.org`, linkedAt: "2026-09-01T00:00:00Z", classIds });

test("teacherClassPath encodes the id", () => {
  assert.equal(teacherClassPath("abc-123"), "/teacher/classes/abc-123");
  assert.equal(teacherClassPath("a/b?c"), "/teacher/classes/a%2Fb%3Fc");
});

test("classWork keeps this class's live tasks only, as classwork items", () => {
  const all = [
    task({ id: "mine" }),
    task({ id: "other-class", classId: "c2" }),
    task({ id: "private", classId: null, studentId: "s1", className: null }),
    task({ id: "archived", archived: true }),
  ];
  const work = classWork(all, "c1");
  assert.deepEqual(
    work.map((w) => w.id),
    ["mine"],
  );
  assert.equal(work[0].done, false);
  assert.equal(work[0].doneAt, null);
  assert.equal(work[0].doneCount, 0); // the teacher's own fields are kept
  assert.equal(all[0].id, "mine"); // input untouched
  assert.ok(!("done" in all[0]));
});

test("classWork items are never done: they read as due, past due or undated", () => {
  const work = classWork([task({ id: "late", dueOn: "2026-10-01" }), task({ id: "soon", dueOn: "2026-11-10" }), task({ id: "none" })], "c1");
  const kinds = Object.fromEntries(work.map((w) => [w.id, dueState(w, "2026-11-04").kind]));
  assert.deepEqual(kinds, { late: "missing", soon: "due", none: "none" });
});

test("classFeedPosts: this class's live posts plus the teacher's posts to all students; not other classes, not archived", () => {
  const posts = [
    post({ id: "mine" }),
    post({ id: "all", classId: null, className: null }),
    post({ id: "other", classId: "c2", className: "Other" }),
    post({ id: "gone", archived: true }),
    post({ id: "all-gone", classId: null, className: null, archived: true }),
  ];
  assert.deepEqual(
    classFeedPosts(posts, "c1").map((p) => p.id),
    ["mine", "all"],
  );
  assert.equal(isForAllStudents(posts[1]), true);
  assert.equal(isForAllStudents(posts[0]), false);
});

test("the Stream merge: pinned first, then posts and tasks newest first", () => {
  const posts = classFeedPosts(
    [post({ id: "old", createdAt: "2026-10-01T00:00:00Z" }), post({ id: "pin", pinned: true, createdAt: "2026-09-01T00:00:00Z" }), post({ id: "all", classId: null, createdAt: "2026-10-20T00:00:00Z" })],
    "c1",
  );
  const work = classWork([task({ id: "t-mid", createdAt: "2026-10-10T00:00:00Z" })], "c1");
  assert.deepEqual(
    streamOf(posts, work).map((e) => (e.kind === "post" ? e.post.id : e.task.id)),
    ["pin", "all", "t-mid", "old"],
  );
});

test("studentsIn lists the students of one class", () => {
  const list = [student("a", ["c1"]), student("b", ["c1", "c2"]), student("c", []), student("d", ["c2"])];
  assert.deepEqual(
    studentsIn(list, "c1").map((s) => s.studentId),
    ["a", "b"],
  );
  assert.deepEqual(studentsIn(list, "none"), []);
});

test("nextDueTask: the nearest task still ahead (today counts); undated and past ones are not it; null when none", () => {
  const today = "2026-11-04";
  const work = classWork(
    [task({ id: "past", dueOn: "2026-11-01" }), task({ id: "undated" }), task({ id: "later", dueOn: "2026-11-20" }), task({ id: "tomorrow", dueOn: "2026-11-05" })],
    "c1",
  );
  assert.equal(nextDueTask(work, today)?.id, "tomorrow");
  assert.equal(nextDueTask(classWork([task({ id: "today", dueOn: today })], "c1"), today)?.id, "today");
  assert.equal(nextDueTask(classWork([task({ id: "past", dueOn: "2026-11-01" }), task({ id: "undated" })], "c1"), today), null);
  assert.equal(nextDueTask([], today), null);
});

test("teacherDueLabel: future and undated read as for a student; a passed date shows the date, never Missing", () => {
  const en = makeT("en");
  const zh = makeT("zh-TW");
  const today = "2026-11-04"; // a Wednesday
  assert.equal(teacherDueLabel(en, null, today, "en"), "No due date");
  assert.equal(teacherDueLabel(en, "2026-11-04", today, "en"), "Due today");
  assert.equal(teacherDueLabel(en, "2026-11-06", today, "en"), "Due Friday");
  assert.equal(teacherDueLabel(en, "2026-11-20", today, "en"), "Due Nov 20");
  assert.equal(teacherDueLabel(en, "2026-11-03", today, "en"), "Due Nov 3"); // yesterday is a date, not "Tuesday"
  assert.equal(teacherDueLabel(en, "2026-10-28", today, "en"), "Due Oct 28");
  assert.equal(teacherDueLabel(en, "2025-12-31", today, "en"), "Due Dec 31, 2025");
  assert.equal(teacherDueLabel(zh, "2026-10-28", today, "zh-TW"), "10月28日到期");
  assert.ok(!teacherDueLabel(en, "2026-10-01", today, "en").includes("Missing"));
});

test("teacherWorkLabel: the due line then 'N of M done'; no count while nobody is assigned; a passed date is a date, not Missing", () => {
  const en = makeT("en");
  const zh = makeT("zh-TW");
  const today = "2026-11-04";
  assert.equal(teacherWorkLabel(en, { dueOn: "2026-11-06", doneCount: 3, totalCount: 12 }, today, "en"), "Due Friday · 3 of 12 done");
  assert.equal(teacherWorkLabel(en, { dueOn: null, doneCount: 0, totalCount: 5 }, today, "en"), "No due date · 0 of 5 done");
  assert.equal(teacherWorkLabel(en, { dueOn: "2026-10-28", doneCount: 12, totalCount: 12 }, today, "en"), "Due Oct 28 · 12 of 12 done");
  assert.equal(teacherWorkLabel(en, { dueOn: "2026-11-06", doneCount: 0, totalCount: 0 }, today, "en"), "Due Friday");
  assert.equal(teacherWorkLabel(zh, { dueOn: "2026-10-28", doneCount: 2, totalCount: 4 }, today, "zh-TW"), "10月28日到期 · 已完成 2/4");
});
