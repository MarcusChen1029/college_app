import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeTaskCount,
  dueSoonCount,
  parseStudentTask,
  parseTarget,
  parseTaskProgress,
  parseTeacherStudentTask,
  parseTeacherTask,
  progressText,
  progressTone,
  setTaskDoneArgs,
  shownTasks,
  sortStudentTasks,
  sortTeacherTasks,
  targetLabel,
  targetValue,
  taskErrorMessage,
  taskTone,
  topicSuggestions,
  validateTask,
  TASK_LIMITS,
  type StudentTask,
  type TeacherTask,
} from "./tasks.ts";

const today = new Date(2026, 9, 25); // 2026-10-25, local

const st = (o: Partial<StudentTask>): StudentTask => ({
  id: "x",
  teacherId: "tch-1",
  teacherName: "Ms. Lee",
  classId: null,
  className: null,
  title: "Task",
  details: "",
  dueOn: null,
  done: false,
  doneAt: null,
  about: null,
  createdAt: "", // what a row without created_at parses to
  topic: null,
  note: null,
  link: null,
  ...o,
});
const tt = (o: Partial<TeacherTask>): TeacherTask => ({
  id: "x",
  classId: null,
  className: null,
  classArchived: false,
  studentId: "s1",
  studentName: "Ana",
  title: "Task",
  details: "",
  dueOn: null,
  archived: false,
  createdAt: "2026-10-01T00:00:00Z",
  doneCount: 0,
  totalCount: 1,
  about: null,
  topic: null,
  ...o,
});

test("validateTask trims, enforces the 0028 limits and checks the date", () => {
  assert.deepEqual(validateTask({ title: "  Send transcript ", details: "  ", dueOn: "" }), { ok: true, value: { title: "Send transcript", details: "", dueOn: null, topic: null } });
  assert.equal(validateTask({ title: "   " }).ok, false);
  assert.equal(validateTask({ title: "x".repeat(TASK_LIMITS.title) }).ok, true);
  assert.equal(validateTask({ title: "x".repeat(TASK_LIMITS.title + 1) }).ok, false);
  assert.equal(validateTask({ title: "ok", details: "x".repeat(TASK_LIMITS.details) }).ok, true);
  assert.equal(validateTask({ title: "ok", details: "x".repeat(TASK_LIMITS.details + 1) }).ok, false);
  assert.equal(validateTask({ title: "ok", dueOn: "2026-02-30" }).ok, false);
  assert.deepEqual(validateTask({ title: "ok", dueOn: "2026-11-01" }), { ok: true, value: { title: "ok", details: "", dueOn: "2026-11-01", topic: null } });
  // The limits are the ones the migrations enforce.
  assert.deepEqual(TASK_LIMITS, { title: 120, details: 1000, topic: 60, activePerTeacher: 500 });
});

test("validateTask: a topic is trimmed, 1-60 characters, and empty means no topic (0053)", () => {
  assert.deepEqual(validateTask({ title: "ok", topic: "  Unit 3 " }), { ok: true, value: { title: "ok", details: "", dueOn: null, topic: "Unit 3" } });
  for (const empty of ["", "   ", null, undefined]) assert.equal((validateTask({ title: "ok", topic: empty }) as { value: { topic: unknown } }).value.topic, null);
  assert.equal(validateTask({ title: "ok", topic: "x".repeat(TASK_LIMITS.topic) }).ok, true);
  assert.equal(validateTask({ title: "ok", topic: "x".repeat(TASK_LIMITS.topic + 1) }).ok, false);
  assert.equal(validateTask({ title: "ok", topic: "x".repeat(TASK_LIMITS.topic + 1) + "  " }).ok, false);
  assert.match((validateTask({ title: "ok", topic: "x".repeat(61) }) as { error: string }).error, /topic/i);
});

test("parseTarget round-trips and rejects junk", () => {
  assert.deepEqual(parseTarget("class:abc"), { kind: "class", id: "abc" });
  assert.deepEqual(parseTarget("student:s-1"), { kind: "student", id: "s-1" });
  assert.equal(parseTarget(""), null);
  assert.equal(parseTarget("teacher:x"), null);
  assert.equal(parseTarget("class:"), null);
  assert.equal(targetValue({ kind: "student", id: "s-1" }), "student:s-1");
});

test("taskTone: done wins, overdue and <=7 days urgent, <=21 soon, no date neutral", () => {
  assert.equal(taskTone(st({ done: true, dueOn: "2026-10-20" }), today), "done");
  assert.equal(taskTone(st({ dueOn: "2026-10-20" }), today), "urgent"); // overdue
  assert.equal(taskTone(st({ dueOn: "2026-11-01" }), today), "urgent"); // 7 days
  assert.equal(taskTone(st({ dueOn: "2026-11-02" }), today), "soon"); // 8 days
  assert.equal(taskTone(st({ dueOn: "2026-11-15" }), today), "soon"); // 21 days
  assert.equal(taskTone(st({ dueOn: "2026-11-16" }), today), "neutral"); // 22 days
  assert.equal(taskTone(st({ dueOn: null }), today), "neutral");
});

test("sortStudentTasks: open first by due date (none last), done after", () => {
  const items = [
    st({ id: "a", title: "No date" }),
    st({ id: "b", title: "Done early", dueOn: "2026-10-01", done: true }),
    st({ id: "c", title: "Later", dueOn: "2026-12-01" }),
    st({ id: "d", title: "Sooner", dueOn: "2026-10-28" }),
  ];
  assert.deepEqual(sortStudentTasks(items).map((t) => t.id), ["d", "c", "a", "b"]);
  assert.deepEqual(items.map((t) => t.id), ["a", "b", "c", "d"]); // input untouched
});

test("sortTeacherTasks: active first, by due date, then newest", () => {
  const items = [
    tt({ id: "arch", archived: true, dueOn: "2026-10-01" }),
    tt({ id: "old", createdAt: "2026-09-01T00:00:00Z" }),
    tt({ id: "new", createdAt: "2026-10-10T00:00:00Z" }),
    tt({ id: "due", dueOn: "2026-11-01" }),
  ];
  assert.deepEqual(sortTeacherTasks(items).map((t) => t.id), ["due", "new", "old", "arch"]);
  assert.equal(activeTaskCount(items), 3);
});

test("targetLabel, progressText and progressTone", () => {
  assert.equal(targetLabel(tt({ classId: "c1", className: "Senior seminar", studentName: null })), "Class: Senior seminar");
  assert.equal(targetLabel(tt({})), "Ana");
  assert.equal(progressText(tt({ doneCount: 3, totalCount: 10 })), "3 of 10 done");
  assert.equal(progressText(tt({ doneCount: 0, totalCount: 0 })), "No students assigned");
  assert.equal(progressTone(tt({ doneCount: 0, totalCount: 4 })), "neutral");
  assert.equal(progressTone(tt({ doneCount: 2, totalCount: 4 })), "progress");
  assert.equal(progressTone(tt({ doneCount: 4, totalCount: 4 })), "done");
  assert.equal(progressTone(tt({ doneCount: 0, totalCount: 0 })), "neutral");
});

test("row parsers map RPC columns and tolerate missing values", () => {
  assert.deepEqual(
    parseTeacherTask({
      task_id: "t1",
      class_id: "c1",
      class_name: "Seminar",
      class_archived: false,
      student_id: null,
      student_name: null,
      title: "Essay draft",
      details: null,
      due_on: "2026-11-01",
      archived: false,
      created_at: "2026-10-25T00:00:00Z",
      done_count: 2,
      total_count: "5",
    }),
    tt({ id: "t1", classId: "c1", className: "Seminar", studentId: null, studentName: null, title: "Essay draft", dueOn: "2026-11-01", createdAt: "2026-10-25T00:00:00Z", doneCount: 2, totalCount: 5 }),
  );
  // Rows from a database that predates 0053 have no note or link.
  assert.deepEqual(parseTaskProgress({ student_id: "s1", display_name: "Ana", done: false, done_at: null }), {
    studentId: "s1",
    displayName: "Ana",
    done: false,
    doneAt: null,
    note: null,
    link: null,
  });
});

test("task_progress rows carry the student's done note and link (0053)", () => {
  assert.deepEqual(
    parseTaskProgress({ student_id: "s1", display_name: "Ana", done: true, done_at: "2026-11-02T09:00:00Z", note: "Sent it", link: "https://example.com/doc" }),
    { studentId: "s1", displayName: "Ana", done: true, doneAt: "2026-11-02T09:00:00Z", note: "Sent it", link: "https://example.com/doc" },
  );
  assert.equal(parseTaskProgress({ student_id: "s2", display_name: "Bo", done: true, note: "", link: null }).note, null);
});

test("list_my_tasks rows carry the task's topic (0053)", () => {
  const row = { task_id: "t1", title: "Draft", total_count: 1 };
  assert.equal(parseTeacherTask({ ...row, topic: "Essays" }).topic, "Essays");
  assert.equal(parseTeacherTask({ ...row, topic: null }).topic, null);
  assert.equal(parseTeacherTask(row).topic, null);
});

test("parseStudentTask reads created_at, topic, note and link (my_tasks, 0053)", () => {
  assert.deepEqual(
    parseStudentTask({
      task_id: "t1",
      teacher_id: "tch-9",
      teacher_name: "Mr. K",
      title: "Draft",
      details: null,
      due_on: "2026-11-05",
      done: true,
      done_at: "2026-11-02T09:00:00Z",
      created_at: "2026-10-28T12:00:00Z",
      topic: "Essays",
      note: "Sent it",
      link: "https://example.com/doc",
    }),
    st({
      id: "t1",
      teacherId: "tch-9",
      teacherName: "Mr. K",
      title: "Draft",
      dueOn: "2026-11-05",
      done: true,
      doneAt: "2026-11-02T09:00:00Z",
      createdAt: "2026-10-28T12:00:00Z",
      topic: "Essays",
      note: "Sent it",
      link: "https://example.com/doc",
    }),
  );
  // Missing, null and empty values all read as null (a database that predates 0053 returns none of the columns).
  for (const row of [{}, { topic: null, note: null, link: null }, { topic: "", note: "", link: "" }]) {
    const t = parseStudentTask({ task_id: "t2", title: "x", ...row });
    assert.deepEqual([t.topic, t.note, t.link], [null, null, null]);
  }
});

test("setTaskDoneArgs: marking done always sends the note and link, undoing sends neither (R7)", () => {
  // Done, nothing attached: the nulls are sent on purpose (the call replaces the saved note and link).
  assert.deepEqual(setTaskDoneArgs("t1", true), { p_task: "t1", p_done: true, p_note: null, p_link: null });
  assert.deepEqual(setTaskDoneArgs("t1", true, undefined, undefined), { p_task: "t1", p_done: true, p_note: null, p_link: null });
  assert.deepEqual(setTaskDoneArgs("t1", true, "Sent it", "https://example.com"), { p_task: "t1", p_done: true, p_note: "Sent it", p_link: "https://example.com" });
  // Re-sending an already-done task keeps what it had when the caller passes the current values.
  assert.deepEqual(setTaskDoneArgs("t1", true, "Sent it", null), { p_task: "t1", p_done: true, p_note: "Sent it", p_link: null });
  // Undo: the database deletes the completion, so no note or link goes along, even if the caller passed some.
  assert.deepEqual(setTaskDoneArgs("t1", false), { p_task: "t1", p_done: false });
  assert.deepEqual(setTaskDoneArgs("t1", false, "Sent it", "https://example.com"), { p_task: "t1", p_done: false });
});

test("parseStudentTask reads the teacher, the class, done_at and an anchor (my_tasks, 0052)", () => {
  // The 0041 columns only: no class, no done_at, no anchor columns at all.
  assert.deepEqual(
    parseStudentTask({ task_id: "t1", teacher_id: "tch-9", teacher_name: "Mr. K", title: "Hi", details: null, due_on: null, done: true }),
    st({ id: "t1", teacherId: "tch-9", teacherName: "Mr. K", title: "Hi", done: true }),
  );
  // A private task about an essay, done.
  assert.deepEqual(
    parseStudentTask({
      task_id: "t2",
      teacher_id: "tch-9",
      teacher_name: "Mr. K",
      class_id: null,
      class_name: null,
      title: "Tighten the opening",
      details: "Cut the first paragraph",
      due_on: "2026-11-01",
      done: true,
      done_at: "2026-10-30T08:00:00Z",
      anchor_kind: "essay",
      anchor_ref: "ps",
      anchor_label: "Personal statement",
      anchor_available: true,
    }),
    st({
      id: "t2",
      teacherId: "tch-9",
      teacherName: "Mr. K",
      title: "Tighten the opening",
      details: "Cut the first paragraph",
      dueOn: "2026-11-01",
      done: true,
      doneAt: "2026-10-30T08:00:00Z",
      about: { anchor: { kind: "essay", ref: "ps" }, label: "Personal statement", available: true },
    }),
  );
  // A class task has a class and (when not done) no done_at; an anchor the teacher can no longer see keeps its label for the student.
  const cls = parseStudentTask({ task_id: "t3", teacher_id: "tch-9", teacher_name: "Mr. K", class_id: "c1", class_name: "Seminar", title: "Read", done: false, done_at: null });
  assert.equal(cls.classId, "c1");
  assert.equal(cls.className, "Seminar");
  assert.equal(cls.doneAt, null);
  assert.equal(cls.about, null);
  const gone = parseStudentTask({ task_id: "t4", title: "x", anchor_kind: "college", anchor_ref: "mit", anchor_label: "MIT", anchor_available: false });
  assert.deepEqual(gone.about, { anchor: { kind: "college", ref: "mit" }, label: "MIT", available: false });
  // Nothing in the row says the task has an anchor.
  assert.equal(parseStudentTask({ task_id: "t5", title: "x", anchor_kind: null, anchor_ref: null, anchor_label: null, anchor_available: null }).about, null);
  assert.equal(parseStudentTask({ task_id: "t6", title: "x" }).about, null);
});

test("parseTeacherTask reads an anchor (list_my_tasks, 0052)", () => {
  const row = { task_id: "t1", student_id: "s1", student_name: "Ana", title: "Draft", done_count: 0, total_count: 1 };
  assert.equal(parseTeacherTask({ ...row, anchor_kind: null, anchor_ref: null, anchor_label: null, anchor_available: null }).about, null);
  assert.equal(parseTeacherTask(row).about, null);
  assert.deepEqual(
    parseTeacherTask({ ...row, anchor_kind: "activity", anchor_ref: "act-1", anchor_label: "Robotics club", anchor_available: true }).about,
    { anchor: { kind: "activity", ref: "act-1" }, label: "Robotics club", available: true },
  );
  // The label comes back null once the teacher may no longer see the item.
  assert.deepEqual(
    parseTeacherTask({ ...row, anchor_kind: "essay", anchor_ref: "ps", anchor_label: null, anchor_available: false }).about,
    { anchor: { kind: "essay", ref: "ps" }, label: null, available: false },
  );
});

test("parseTeacherStudentTask maps teacher_student_tasks rows (0052)", () => {
  // A class task the student has not finished.
  assert.deepEqual(
    parseTeacherStudentTask({
      task_id: "t1",
      title: "Read the handbook",
      details: null,
      due_on: "2026-11-05",
      class_id: "c1",
      class_name: "Seminar",
      anchor_kind: null,
      anchor_ref: null,
      anchor_label: null,
      anchor_available: null,
      done: false,
      done_at: null,
    }),
    { id: "t1", title: "Read the handbook", details: null, dueOn: "2026-11-05", classId: "c1", className: "Seminar", about: null, done: false, doneAt: null, topic: null, note: null, link: null },
  );
  // A private task with an anchor, done.
  assert.deepEqual(
    parseTeacherStudentTask({
      task_id: "t2",
      title: "Fix the supplement",
      details: "Under 250 words",
      due_on: null,
      class_id: null,
      class_name: null,
      anchor_kind: "essay",
      anchor_ref: "supp:mit:why",
      anchor_label: "MIT supplement",
      anchor_available: true,
      done: true,
      done_at: "2026-10-31T10:00:00Z",
    }),
    {
      id: "t2",
      title: "Fix the supplement",
      details: "Under 250 words",
      dueOn: null,
      classId: null,
      className: null,
      about: { anchor: { kind: "essay", ref: "supp:mit:why" }, label: "MIT supplement", available: true },
      done: true,
      doneAt: "2026-10-31T10:00:00Z",
      topic: null,
      note: null,
      link: null,
    },
  );
  // 0053 adds the task's topic and that student's note and link.
  const r = parseTeacherStudentTask({ task_id: "t3", title: "x", done: true, topic: "Essays", note: "Sent it", link: "https://example.com/doc" });
  assert.deepEqual([r.topic, r.note, r.link], ["Essays", "Sent it", "https://example.com/doc"]);
});

test("taskErrorMessage maps database errors to plain wording", () => {
  assert.match(taskErrorMessage("task limit reached"), /500 active tasks/);
  assert.equal(taskErrorMessage("student not found"), "That student is no longer linked to you.");
  assert.equal(taskErrorMessage("task not found"), "That task is no longer available.");
  // create_task raises the classroom wording when an anchor is refused.
  assert.equal(taskErrorMessage("classroom: invalid"), "Please check the text and the link, then try again.");
  assert.equal(taskErrorMessage("weird"), "weird");
  assert.equal(taskErrorMessage(""), "Something went wrong. Please try again.");
});

test("shownTasks: every open task, then the most recently finished ones up to max", () => {
  const open = (n: number) => Array.from({ length: n }, (_, i) => st({ id: `o${i}`, title: `Open ${i}`, dueOn: `2026-11-0${i + 1}` }));
  const done = (n: number) => Array.from({ length: n }, (_, i) => st({ id: `d${i}`, title: `Done ${i}`, done: true, doneAt: `2026-10-0${i + 1}T00:00:00Z` }));
  assert.equal(shownTasks([...open(5), ...done(2)]).length, 5);
  assert.ok(shownTasks([...open(5), ...done(2)]).every((t) => !t.done));
  assert.deepEqual(shownTasks([...done(4), ...open(1)]).map((t) => t.id), ["o0", "d3", "d2"]);
  assert.deepEqual(shownTasks(done(4), 2).map((t) => t.id), ["d3", "d2"]);
  assert.deepEqual(shownTasks([]), []);
  // Open tasks keep sortStudentTasks order (earliest due first, no date last).
  assert.deepEqual(shownTasks([st({ id: "none", title: "A" }), st({ id: "late", dueOn: "2026-12-01" }), st({ id: "soon", dueOn: "2026-11-01" })]).map((t) => t.id), ["soon", "late", "none"]);
});

test("dueSoonCount: open tasks due within a week, overdue ones included", () => {
  const tasks = [
    st({ id: "overdue", dueOn: "2026-10-20" }), // 5 days late
    st({ id: "today", dueOn: "2026-10-25" }),
    st({ id: "day7", dueOn: "2026-11-01" }), // exactly 7 days out: still this week
    st({ id: "day8", dueOn: "2026-11-02" }),
    st({ id: "undated" }),
    st({ id: "done-soon", dueOn: "2026-10-26", done: true }),
  ];
  assert.equal(dueSoonCount(tasks, today), 3);
  assert.equal(dueSoonCount(tasks, today, 30), 4);
  assert.equal(dueSoonCount([], today), 0);
});

test("topicSuggestions: the topics already on the same class's live tasks, newest first; none from other classes, students or archived tasks", () => {
  const tasks = [
    tt({ id: "a", classId: "c1", studentId: null, topic: "Essays", createdAt: "2026-10-01T00:00:00Z" }),
    tt({ id: "b", classId: "c1", studentId: null, topic: "Testing", createdAt: "2026-10-05T00:00:00Z" }),
    tt({ id: "c", classId: "c1", studentId: null, topic: "Essays", createdAt: "2026-10-10T00:00:00Z" }), // Essays is the newest work now
    tt({ id: "d", classId: "c1", studentId: null, topic: null }),
    tt({ id: "e", classId: "c1", studentId: null, topic: "Old", archived: true }),
    tt({ id: "f", classId: "c2", studentId: null, topic: "Other class" }),
    tt({ id: "g", classId: null, studentId: "s1", topic: "Private" }),
  ];
  assert.deepEqual(topicSuggestions(tasks, { kind: "class", id: "c1" }), ["Essays", "Testing"]);
  assert.deepEqual(topicSuggestions(tasks, { kind: "student", id: "s1" }), ["Private"]);
  assert.deepEqual(topicSuggestions(tasks, { kind: "class", id: "none" }), []);
});

test("topicSuggestions: with no target every live topic is offered; equal times fall back to the name; case is not merged", () => {
  const same = "2026-10-01T00:00:00Z";
  const tasks = [
    tt({ id: "a", classId: "c1", studentId: null, topic: "essays", createdAt: same }),
    tt({ id: "b", classId: "c2", studentId: null, topic: "Essays", createdAt: same }),
    tt({ id: "c", classId: null, studentId: "s1", topic: "Applications", createdAt: same }),
  ];
  assert.deepEqual(topicSuggestions(tasks, null), ["Applications", "essays", "Essays"]);
  assert.deepEqual(topicSuggestions([], null), []);
});
