import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeTaskCount,
  parseStudentTask,
  parseTarget,
  parseTaskProgress,
  parseTeacherTask,
  progressText,
  progressTone,
  sortStudentTasks,
  sortTeacherTasks,
  targetLabel,
  targetValue,
  taskErrorMessage,
  taskTone,
  validateTask,
  TASK_LIMITS,
  type StudentTask,
  type TeacherTask,
} from "./tasks.ts";

const today = new Date(2026, 9, 25); // 2026-10-25, local

const st = (o: Partial<StudentTask>): StudentTask => ({ id: "x", teacherName: "Ms. Lee", title: "Task", details: "", dueOn: null, done: false, ...o });
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
  ...o,
});

test("validateTask trims, enforces the 0028 limits and checks the date", () => {
  assert.deepEqual(validateTask({ title: "  Send transcript ", details: "  ", dueOn: "" }), { ok: true, value: { title: "Send transcript", details: "", dueOn: null } });
  assert.equal(validateTask({ title: "   " }).ok, false);
  assert.equal(validateTask({ title: "x".repeat(TASK_LIMITS.title) }).ok, true);
  assert.equal(validateTask({ title: "x".repeat(TASK_LIMITS.title + 1) }).ok, false);
  assert.equal(validateTask({ title: "ok", details: "x".repeat(TASK_LIMITS.details) }).ok, true);
  assert.equal(validateTask({ title: "ok", details: "x".repeat(TASK_LIMITS.details + 1) }).ok, false);
  assert.equal(validateTask({ title: "ok", dueOn: "2026-02-30" }).ok, false);
  assert.deepEqual(validateTask({ title: "ok", dueOn: "2026-11-01" }), { ok: true, value: { title: "ok", details: "", dueOn: "2026-11-01" } });
  // The limits are the ones the migration enforces.
  assert.deepEqual(TASK_LIMITS, { title: 120, details: 1000, activePerTeacher: 500 });
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
  assert.deepEqual(parseStudentTask({ task_id: "t1", teacher_name: "Mr. K", title: "Hi", details: null, due_on: null, done: true }), st({ id: "t1", teacherName: "Mr. K", title: "Hi", done: true }));
  assert.deepEqual(parseTaskProgress({ student_id: "s1", display_name: "Ana", done: false, done_at: null }), { studentId: "s1", displayName: "Ana", done: false, doneAt: null });
});

test("taskErrorMessage maps database errors to plain wording", () => {
  assert.match(taskErrorMessage("task limit reached"), /500 active tasks/);
  assert.equal(taskErrorMessage("student not found"), "That student is no longer linked to you.");
  assert.equal(taskErrorMessage("task not found"), "That task is no longer available.");
  assert.equal(taskErrorMessage("weird"), "weird");
  assert.equal(taskErrorMessage(""), "Something went wrong. Please try again.");
});
