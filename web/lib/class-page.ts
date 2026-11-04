// What a student's class page, task page and To-do page are built from: which class, task and announcements a page
// shows. Pure functions only (the screens draw them), so they can be tested. Spec
// 2026-11-04-classroom-google-style-design.md sections 3.2 to 3.5.

import { themeFor, type ClassTheme } from "./class-theme.ts";
import { pairClasses, type StudentPost } from "./classroom.ts";
import type { TodoGroup, TodoTab } from "./classwork.ts";
import type { MyTeacher } from "./links-api.ts";
import type { StudentTask } from "./tasks.ts";

export type ClassView = {
  teacher: MyTeacher;
  classId: string;
  name: string;
  year: string | null;
  theme: ClassTheme;
  /** The class's announcements, and the teacher's announcements to all their students (`classId` null), in input order. */
  posts: StudentPost[];
  /** This class's tasks (never the teacher's private tasks for this student). */
  tasks: StudentTask[];
};

/**
 * The class a student opens at `/counselor/class/<classId>`: its teacher, name, school year and banner colour, the posts
 * its Stream shows and its tasks. Null when the student is not in a class with that id, or the class is archived (its
 * announcements and tasks are hidden from students then); the page says "This class isn't available".
 * A class id the database did not return alongside the names (`pairClasses` gives a null id) is never found.
 */
export function classView(
  i: { teachers: readonly MyTeacher[]; posts: readonly StudentPost[]; tasks: readonly StudentTask[] },
  classId: string,
): ClassView | null {
  const wanted = classId.toLowerCase(); // ids come back from the database in lower case
  for (const teacher of i.teachers) {
    const index = pairClasses(teacher.classNames, teacher.classIds).findIndex((c) => c.id === wanted);
    if (index < 0) continue;
    if (teacher.classArchived[index]) return null;
    return {
      teacher,
      classId: wanted,
      name: teacher.classNames[index],
      year: teacher.classYears[index] ?? null,
      theme: themeFor(wanted, teacher.classThemes[index]),
      posts: i.posts.filter((p) => p.teacherId === teacher.teacherId && (p.classId === wanted || p.classId === null)),
      tasks: i.tasks.filter((x) => x.teacherId === teacher.teacherId && x.classId === wanted),
    };
  }
  return null;
}

/** A post to all of a teacher's students (not to one class): the Stream tags it. */
export const isToAllStudents = (p: Pick<StudentPost, "classId">): boolean => p.classId === null;

/** The task at `/counselor/task/<taskId>`, or null when the student has no such task (never theirs, archived, or left). */
export function findTask<T extends Pick<StudentTask, "id">>(tasks: readonly T[], taskId: string): T | null {
  const wanted = taskId.toLowerCase();
  return tasks.find((x) => x.id === wanted) ?? null;
}

/** Where "back" goes from a task: its class page, or the 1-on-1 page of its teacher for a private task. */
export const taskBackTarget = (task: Pick<StudentTask, "classId" | "teacherId">): { kind: "class"; id: string } | { kind: "teacher"; id: string } =>
  task.classId ? { kind: "class", id: task.classId } : { kind: "teacher", id: task.teacherId };

// ---- To-do tabs ----

export const TODO_TABS = ["assigned", "missing", "done"] as const satisfies readonly TodoTab[];
export const TODO_GROUPS = ["this_week", "next_week", "later", "no_date"] as const satisfies readonly TodoGroup[];

/** How many items an Assigned bucket holds in all groups. */
export const assignedCount = (assigned: Record<TodoGroup, readonly unknown[]>): number => TODO_GROUPS.reduce((n, g) => n + assigned[g].length, 0);
