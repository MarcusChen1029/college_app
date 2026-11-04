// What the teacher's class screens (Classes grid and a class page, spec 2026-11-04-classroom-google-style-design.md
// 4.1 and 4.2) pick out of the teacher's data. Pure functions only (the screens draw them), so they can be tested.

import type { TeacherPost } from "./classroom.ts";
import { dueState, upcoming, type WorkItem } from "./classwork.ts";
import { dueLabel } from "./due-label.ts";
import type { Locale } from "./i18n/core.ts";
import type { TFunction } from "./i18n/index.ts";
import type { LinkedStudent } from "./links-api.ts";
import type { TeacherTask } from "./tasks.ts";

/** A class task as classwork.ts reads it: nothing is "done" for the teacher, who sees counts instead (doneCount of totalCount). */
export type TeacherWork = TeacherTask & WorkItem;

/** The teacher's address for one class. The id is encoded, so an odd id can never change the path. */
export const teacherClassPath = (classId: string): string => `/teacher/classes/${encodeURIComponent(classId)}`;

/** The teacher's classes list (the grid). */
export const TEACHER_CLASSES_PATH = "/teacher/classes";

/** The live (not archived) tasks given to one class, as classwork items. Private tasks and other classes' tasks are left out. */
export function classWork(tasks: readonly TeacherTask[], classId: string): TeacherWork[] {
  return tasks.filter((t) => t.classId === classId && !t.archived).map((t) => ({ ...t, done: false, doneAt: null }));
}

/**
 * The announcements a class Stream shows: this class's live ones and the teacher's live posts to all their students
 * (no class), which the Stream tags. Archived posts stay on the Messages page.
 */
export function classFeedPosts(posts: readonly TeacherPost[], classId: string): TeacherPost[] {
  return posts.filter((p) => !p.archived && (p.classId === classId || p.classId === null));
}

/** A post to all of the teacher's students (not to one class). */
export const isForAllStudents = (p: Pick<TeacherPost, "classId">): boolean => p.classId === null;

/** The students who are in a class. */
export function studentsIn(students: readonly LinkedStudent[], classId: string): LinkedStudent[] {
  return students.filter((s) => s.classIds.includes(classId));
}

/** The class task with the nearest due date that is still ahead (today counts), or null: the line a grid card shows. */
export function nextDueTask(work: readonly TeacherWork[], today: string): TeacherWork | null {
  return upcoming(work, today, 1)[0] ?? null;
}

/**
 * The line on the right of a class task in Classwork: its due date as the teacher reads it, then how many students have
 * finished it ("Due Friday · 3 of 12 done"). The count is left out while nobody is assigned the task.
 */
export function teacherWorkLabel(t: TFunction, w: Pick<TeacherTask, "dueOn" | "doneCount" | "totalCount">, today: string, locale: Locale): string {
  return [teacherDueLabel(t, w.dueOn, today, locale), w.totalCount > 0 ? t("teacher.tasks.progress", { done: w.doneCount, total: w.totalCount }) : ""].filter(Boolean).join(" · ");
}

/**
 * How a class task's due date reads to its teacher: "No due date", "Due today", "Due Friday", "Due Nov 15", and for a date
 * that has passed "Due Oct 28" with the date, never "Missing", which is a student's state. `today` is the teacher's
 * local `YYYY-MM-DD`.
 */
export function teacherDueLabel(t: TFunction, dueOn: string | null, today: string, locale: Locale): string {
  const stub: WorkItem = { id: "", title: "", dueOn, done: false, doneAt: null, topic: null, createdAt: "" };
  const s = dueState(stub, today);
  if (s.kind !== "missing") return dueLabel(t, s, locale, today);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueOn ?? "");
  if (!m) return t("classroom.due.none");
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const sameYear = today.slice(0, 4) === m[1];
  const when = at.toLocaleDateString(locale === "zh-TW" ? "zh-TW" : "en-US", { month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
  return t("classroom.due.on", { when });
}
