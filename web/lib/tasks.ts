// Teacher-assigned tasks (migration 0028): a teacher gives a class or one linked student a task, students tick it off.
// Pure helpers only (validation, parsing, sorting, colours). The database decides who sees what; the limits below
// mirror the check constraints and RPC checks in supabase/migrations/0028_teacher_tasks.sql, so keep the two in step.

import { daysUntil } from "./format.ts";
import { deadlineTone, type Tone } from "./status.ts";

export const TASK_LIMITS = { title: 120, details: 1000, activePerTeacher: 500 } as const;

export type TaskTarget = { kind: "class"; id: string } | { kind: "student"; id: string };

export type TaskInput = { title: string; details: string; dueOn: string | null };

/** A task as its teacher sees it (list_my_tasks). Counts are over the students it is assigned to right now. */
export type TeacherTask = {
  id: string;
  classId: string | null;
  className: string | null;
  classArchived: boolean;
  studentId: string | null;
  studentName: string | null;
  title: string;
  details: string;
  dueOn: string | null;
  archived: boolean;
  createdAt: string;
  doneCount: number;
  totalCount: number;
};

/** A task as a student sees it (my_tasks). */
export type StudentTask = { id: string; teacherName: string; title: string; details: string; dueOn: string | null; done: boolean };

/** One assigned student's state for a task (task_progress). */
export type TaskProgress = { studentId: string; displayName: string; done: boolean; doneAt: string | null };

export const emptyTask = (): TaskInput => ({ title: "", details: "", dueOn: null });

/** A real calendar date written yyyy-mm-dd (the date input's value). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** Trims and checks a task form. Mirrors check_task_text() and the table's check constraints. */
export function validateTask(i: Partial<Record<keyof TaskInput, unknown>>): { ok: true; value: TaskInput } | { ok: false; error: string } {
  const title = typeof i.title === "string" ? i.title.trim() : "";
  if (!title) return { ok: false, error: "Enter a title for the task." };
  if (title.length > TASK_LIMITS.title) return { ok: false, error: `Keep the title under ${TASK_LIMITS.title} characters.` };
  const details = typeof i.details === "string" ? i.details.trim() : "";
  if (details.length > TASK_LIMITS.details) return { ok: false, error: `Keep the details under ${TASK_LIMITS.details} characters.` };
  const dueOn = i.dueOn == null || i.dueOn === "" ? null : isIsoDate(i.dueOn) ? i.dueOn : undefined;
  if (dueOn === undefined) return { ok: false, error: "Enter a valid due date." };
  return { ok: true, value: { title, details, dueOn } };
}

/** The target picker's value is "class:<id>" or "student:<id>"; anything else is no target. */
export function parseTarget(v: string): TaskTarget | null {
  const m = /^(class|student):(.+)$/.exec(v);
  return m ? { kind: m[1] as TaskTarget["kind"], id: m[2] } : null;
}
export const targetValue = (t: TaskTarget): string => `${t.kind}:${t.id}`;

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

export function parseTeacherTask(r: Record<string, unknown>): TeacherTask {
  return {
    id: str(r.task_id),
    classId: strOrNull(r.class_id),
    className: strOrNull(r.class_name),
    classArchived: r.class_archived === true,
    studentId: strOrNull(r.student_id),
    studentName: strOrNull(r.student_name),
    title: str(r.title),
    details: str(r.details),
    dueOn: strOrNull(r.due_on),
    archived: r.archived === true,
    createdAt: str(r.created_at),
    doneCount: int(r.done_count),
    totalCount: int(r.total_count),
  };
}

export function parseStudentTask(r: Record<string, unknown>): StudentTask {
  return { id: str(r.task_id), teacherName: str(r.teacher_name), title: str(r.title), details: str(r.details), dueOn: strOrNull(r.due_on), done: r.done === true };
}

export function parseTaskProgress(r: Record<string, unknown>): TaskProgress {
  return { studentId: str(r.student_id), displayName: str(r.display_name), done: r.done === true, doneAt: strOrNull(r.done_at) };
}

/** Days until the task is due, or null when it has no due date. Negative = overdue. */
export const taskDays = (t: Pick<StudentTask, "dueOn">, today: Date): number | null => (t.dueOn ? daysUntil(t.dueOn, today) : null);

/** Pill colour: done wins; otherwise overdue and the last week are urgent, three weeks soon; no date is neutral. */
export function taskTone(t: Pick<StudentTask, "dueOn" | "done">, today: Date): Tone {
  if (t.done) return "done";
  const days = taskDays(t, today);
  return days == null ? "neutral" : deadlineTone(days, false);
}

const byDue = (a: string | null, b: string | null): number => (a === b ? 0 : a === null ? 1 : b === null ? -1 : a < b ? -1 : 1);

/** Student list: open tasks first (earliest due first, no date last), then done ones; ties by title. */
export function sortStudentTasks<T extends Pick<StudentTask, "done" | "dueOn" | "title" | "id">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(a.done) - Number(b.done) || byDue(a.dueOn, b.dueOn) || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
}

/** Teacher list: active before archived, then earliest due (no date last), then newest first. */
export function sortTeacherTasks<T extends Pick<TeacherTask, "archived" | "dueOn" | "createdAt" | "id">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => Number(a.archived) - Number(b.archived) || byDue(a.dueOn, b.dueOn) || b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}

/** Who a task is for, as the teacher reads it. */
export function targetLabel(t: Pick<TeacherTask, "classId" | "className" | "studentName">): string {
  if (t.classId) return t.className ? `Class: ${t.className}` : "Class";
  return t.studentName ?? "Student";
}

/** "3 of 10 done", or a note when nobody is assigned any more. */
export function progressText(t: Pick<TeacherTask, "doneCount" | "totalCount">): string {
  return t.totalCount === 0 ? "No students assigned" : `${t.doneCount} of ${t.totalCount} done`;
}

/** Tone of the progress pill: all done is done, some is progress, none is neutral. */
export function progressTone(t: Pick<TeacherTask, "doneCount" | "totalCount">): Tone {
  if (t.totalCount > 0 && t.doneCount >= t.totalCount) return "done";
  return t.doneCount > 0 ? "progress" : "neutral";
}

/** Active tasks count toward the per-teacher cap. */
export const activeTaskCount = (items: readonly Pick<TeacherTask, "archived">[]): number => items.filter((t) => !t.archived).length;

/** Plain wording for the errors the task RPCs raise. */
export function taskErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("task limit reached")) return `You have ${TASK_LIMITS.activePerTeacher} active tasks, the most allowed. Archive some to add more.`;
  if (m.includes("choose a class or a student")) return "Choose a class or a student.";
  if (m.includes("class not found")) return "That class isn't available. It may be archived.";
  if (m.includes("student not found")) return "That student is no longer linked to you.";
  if (m.includes("task not found")) return "That task is no longer available.";
  if (m.includes("task title required")) return "Enter a title for the task.";
  if (m.includes("task title too long")) return `Keep the title under ${TASK_LIMITS.title} characters.`;
  if (m.includes("task details too long")) return `Keep the details under ${TASK_LIMITS.details} characters.`;
  return message || "Something went wrong. Please try again.";
}
