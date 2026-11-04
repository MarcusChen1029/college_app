import assert from "node:assert/strict";
import { test } from "node:test";
import { assignedCount, classView, findTask, isToAllStudents, taskBackTarget, TODO_GROUPS, TODO_TABS } from "./class-page.ts";
import type { StudentPost } from "./classroom.ts";
import { streamOf, todoBuckets } from "./classwork.ts";
import type { MyTeacher } from "./links-api.ts";
import type { StudentTask } from "./tasks.ts";

const teacher = (o: Partial<MyTeacher> & { teacherId: string }): MyTeacher => ({
  displayName: "Ms. Lin",
  school: "Taipei American School",
  linkedAt: "2026-09-01T00:00:00Z",
  shareEssays: false,
  classNames: [],
  classIds: [],
  classThemes: [],
  classYears: [],
  classArchived: [],
  ...o,
});

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

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

const two = teacher({
  teacherId: "t1",
  classNames: ["Senior A", "Senior B"],
  classIds: [A, B],
  classThemes: ["coral", null],
  classYears: ["2026-27", null],
  classArchived: [false, false],
});

test("classView: the class's name, year, theme and teacher", () => {
  const v = classView({ teachers: [two], posts: [], tasks: [] }, A);
  assert.ok(v);
  assert.equal(v.name, "Senior A");
  assert.equal(v.year, "2026-27");
  assert.equal(v.theme, "coral");
  assert.equal(v.teacher.teacherId, "t1");
  assert.equal(v.classId, A);
});

test("classView: a class without a stored theme or year gets the id-derived colour and no year", () => {
  const a = classView({ teachers: [two], posts: [], tasks: [] }, B);
  const b = classView({ teachers: [two], posts: [], tasks: [] }, B);
  assert.ok(a && b);
  assert.equal(a.year, null);
  assert.equal(a.theme, b.theme); // stable
});

test("classView: Stream posts are this class's plus the teacher's posts to all students, never another class's or another teacher's", () => {
  const posts = [
    post({ id: "mine", classId: A }),
    post({ id: "all", classId: null }),
    post({ id: "otherClass", classId: B }),
    post({ id: "otherTeacherAll", teacherId: "t2", classId: null }),
    post({ id: "otherTeacherSameClass", teacherId: "t2", classId: A }),
  ];
  const v = classView({ teachers: [two, teacher({ teacherId: "t2", displayName: "Mr. Wu" })], posts, tasks: [] }, A);
  assert.deepEqual(v?.posts.map((p) => p.id), ["mine", "all"]);
  assert.deepEqual(v?.posts.map(isToAllStudents), [false, true]);
});

test("classView: tasks are this class's only, not private tasks or another class's", () => {
  const tasks = [
    task({ id: "inA", classId: A }),
    task({ id: "inB", classId: B }),
    task({ id: "private", classId: null }),
    task({ id: "otherTeacher", teacherId: "t2", classId: A }),
  ];
  const v = classView({ teachers: [two], posts: [], tasks }, A);
  assert.deepEqual(v?.tasks.map((x) => x.id), ["inA"]);
});

test("classView: unknown, archived, other-case and misaligned class ids", () => {
  const archived = teacher({ teacherId: "t1", classNames: ["Old"], classIds: [A], classThemes: [null], classYears: [null], classArchived: [true] });
  assert.equal(classView({ teachers: [archived], posts: [], tasks: [] }, A), null);
  assert.equal(classView({ teachers: [two], posts: [], tasks: [] }, "cccccccc-0000-4000-8000-000000000003"), null);
  assert.equal(classView({ teachers: [], posts: [], tasks: [] }, A), null);
  assert.ok(classView({ teachers: [two], posts: [], tasks: [] }, A.toUpperCase())); // a typed-in upper-case id still finds it
  // names without ids (a database that predates class_ids) never match
  const noIds = teacher({ teacherId: "t1", classNames: ["Senior A"], classIds: [], classArchived: [] });
  assert.equal(classView({ teachers: [noIds], posts: [], tasks: [] }, A), null);
  // the other class of the same teacher is still there
  const half = teacher({ teacherId: "t1", classNames: ["Old", "New"], classIds: [A, B], classThemes: [null, null], classYears: [null, null], classArchived: [true, false] });
  assert.equal(classView({ teachers: [half], posts: [], tasks: [] }, A), null);
  assert.equal(classView({ teachers: [half], posts: [], tasks: [] }, B)?.name, "New");
});

test("classView: does not change its input", () => {
  const posts = [post({ id: "p", classId: A })];
  const tasks = [task({ id: "x", classId: A })];
  const before = JSON.stringify({ two, posts, tasks });
  classView({ teachers: [two], posts, tasks }, A);
  assert.equal(JSON.stringify({ two, posts, tasks }), before);
});

test("the class Stream: pinned first, then posts and new tasks together, newest first", () => {
  const v = classView(
    {
      teachers: [two],
      posts: [
        post({ id: "old", classId: A, createdAt: "2026-10-28T10:00:00Z" }),
        post({ id: "pinned", classId: A, createdAt: "2026-10-01T10:00:00Z", pinned: true }),
        post({ id: "all", classId: null, createdAt: "2026-11-02T10:00:00Z" }),
      ],
      tasks: [task({ id: "t", classId: A, createdAt: "2026-10-30T10:00:00Z" })],
    },
    A,
  );
  assert.ok(v);
  const ids = streamOf(v.posts, v.tasks).map((e) => (e.kind === "post" ? e.post.id : e.task.id));
  assert.deepEqual(ids, ["pinned", "all", "t", "old"]);
});

test("findTask: by id, any case; null for one the student does not have", () => {
  const id = "dddddddd-0000-4000-8000-00000000000d";
  const list = [task({ id }), task({ id: "other" })];
  assert.equal(findTask(list, id)?.id, id);
  assert.equal(findTask(list, id.toUpperCase())?.id, id);
  assert.equal(findTask(list, "missing"), null);
  assert.equal(findTask([], id), null);
});

test("taskBackTarget: a class task goes back to its class, a private one to its teacher", () => {
  assert.deepEqual(taskBackTarget({ classId: A, teacherId: "t1" }), { kind: "class", id: A });
  assert.deepEqual(taskBackTarget({ classId: null, teacherId: "t1" }), { kind: "teacher", id: "t1" });
});

test("To-do: the tabs and groups are the ones todoBuckets fills, and assignedCount adds the groups", () => {
  const today = "2026-11-04";
  const items = [
    task({ id: "week", dueOn: "2026-11-06" }),
    task({ id: "next", dueOn: "2026-11-12" }),
    task({ id: "later", dueOn: "2026-12-25" }),
    task({ id: "none" }),
    task({ id: "late", dueOn: "2026-11-01" }),
    task({ id: "done", done: true, doneAt: "2026-11-03T10:00:00Z", dueOn: "2026-11-01" }),
  ];
  const b = todoBuckets(items, today);
  assert.deepEqual([...TODO_TABS], ["assigned", "missing", "done"]);
  assert.deepEqual(Object.keys(b.assigned).sort(), [...TODO_GROUPS].sort());
  assert.equal(assignedCount(b.assigned), 4);
  assert.deepEqual(b.missing.map((x) => x.id), ["late"]);
  assert.deepEqual(b.done.map((x) => x.id), ["done"]);
  assert.equal(assignedCount({ this_week: [], next_week: [], later: [], no_date: [] }), 0);
});
