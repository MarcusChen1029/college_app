"use client";

// Thin typed wrappers over the teacher-task RPCs (migration 0028). The tables are closed to clients, so everything
// goes through these functions. Each throws an Error with plain wording (taskErrorMessage) when a call fails.

import type { Anchor } from "./anchors";
import { browserSupabase } from "./supabase-browser";
import { parseStudentTask, parseTaskProgress, parseTeacherTask, setTaskDoneArgs, taskErrorMessage, type StudentTask, type TaskInput, type TaskProgress, type TaskTarget, type TeacherTask } from "./tasks";

const db = () => browserSupabase();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(taskErrorMessage(res.error.message));
  return res.data;
}

// ───────── teacher side ─────────

/**
 * Assigns a task to one of the caller's classes or one linked student. Returns the new task id.
 * `about` ties a one-student task to an item (its anchor plus the label to save); the database refuses it on a class task.
 */
export async function createTask(target: TaskTarget, task: TaskInput, about?: { anchor: Anchor; label: string }): Promise<string> {
  return check(
    await db().rpc("create_task", {
      p_title: task.title,
      p_details: task.details || null,
      p_due_on: task.dueOn,
      p_class: target.kind === "class" ? target.id : null,
      p_student: target.kind === "student" ? target.id : null,
      p_topic: task.topic, // null = no topic (migration 0053)
      // The anchor arguments are sent only with an anchor.
      ...(about ? { p_anchor_kind: about.anchor.kind, p_anchor_ref: about.anchor.ref, p_anchor_label: about.label } : {}),
    }),
  ) as string;
}

/** Always sends p_topic: update_task replaces the topic, so null is how a teacher clears it. */
export async function updateTask(id: string, task: TaskInput): Promise<void> {
  check(await db().rpc("update_task", { p_task: id, p_title: task.title, p_details: task.details || null, p_due_on: task.dueOn, p_topic: task.topic }));
}

export async function archiveTask(id: string, archived: boolean): Promise<void> {
  check(await db().rpc("archive_task", { p_task: id, p_archived: archived }));
}

/** The caller's tasks with done/total counts over the students assigned right now. */
export async function listMyTasks(): Promise<TeacherTask[]> {
  const rows = check(await db().rpc("list_my_tasks")) as Record<string, unknown>[];
  return rows.map(parseTeacherTask);
}

/** Done state (and each student's note and link) per currently assigned student for one of the caller's tasks. */
export async function taskProgress(id: string): Promise<TaskProgress[]> {
  const rows = check(await db().rpc("task_progress", { p_task: id })) as Record<string, unknown>[];
  return rows.map(parseTaskProgress);
}

// ───────── student side ─────────

/** Tasks from the caller's linked teachers. */
export async function myTasks(): Promise<StudentTask[]> {
  const rows = check(await db().rpc("my_tasks")) as Record<string, unknown>[];
  return rows.map(parseStudentTask);
}

/**
 * Marks a task done or open for the caller. Marking done REPLACES the saved note and link with what is sent here, so a
 * caller marking an already-done task (say, to fix its note) must pass the current note and link or they are wiped. Pass
 * nothing only for a task that has none. Undoing (done=false) sends no note or link; the database drops them.
 */
export async function setTaskDone(id: string, done: boolean, note?: string | null, link?: string | null): Promise<void> {
  check(await db().rpc("set_task_done", setTaskDoneArgs(id, done, note, link)));
}
