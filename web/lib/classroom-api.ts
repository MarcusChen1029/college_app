"use client";

// Thin typed wrappers over the classroom RPCs (migration 0052): announcements, conversations and the badge counts.
// The tables are closed to clients, so everything goes through these functions. Each throws an Error with plain
// wording (classroomErrorMessage) when a call fails. Argument names are the SQL parameter names (supabase-js passes
// them by name); keep them in step with the migration.

import type { Anchor } from "./anchors";
import {
  classroomErrorMessage,
  parseConversation,
  parseMessage,
  parseStudentPost,
  parseTeacherPost,
  parseUnread,
  type ClassroomUnread,
  type Conversation,
  type Message,
  type PostInput,
  type StudentPost,
  type TeacherPost,
} from "./classroom";
import { browserSupabase } from "./supabase-browser";
import { parseTeacherStudentTask, type TeacherStudentTask } from "./tasks";

const db = () => browserSupabase();

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) throw new Error(classroomErrorMessage(res.error.message));
  return res.data;
}

// A table-returning RPC gives an array; treat a null as "no rows".
const rowsOf = (res: { data: unknown; error: { message: string } | null }): Record<string, unknown>[] => (check(res) as Record<string, unknown>[] | null) ?? [];

// ───────── announcements: teacher side ─────────

/** Posts an announcement to one of the caller's classes, or to all their students (classId null). Returns the post id. */
export async function createPost(classId: string | null, p: PostInput): Promise<string> {
  return check(await db().rpc("teacher_create_post", { p_class: classId, p_title: p.title, p_body: p.body, p_link: p.link, p_pinned: p.pinned })) as string;
}

/** Changes the text, link and pin of one of the caller's posts. The audience can't change. */
export async function updatePost(id: string, p: PostInput): Promise<void> {
  check(await db().rpc("teacher_update_post", { p_post: id, p_title: p.title, p_body: p.body, p_link: p.link, p_pinned: p.pinned }));
}

export async function archivePost(id: string, archived: boolean): Promise<void> {
  check(await db().rpc("teacher_archive_post", { p_post: id, p_archived: archived }));
}

/** The caller's posts with how many students were there and how many have read each. */
export async function teacherPosts(): Promise<TeacherPost[]> {
  return rowsOf(await db().rpc("teacher_posts")).map(parseTeacherPost);
}

/** The students (by display name) who haven't read one of the caller's posts. */
export async function postUnread(id: string): Promise<{ id: string; name: string }[]> {
  return rowsOf(await db().rpc("teacher_post_unread", { p_post: id })).map((r) => ({
    id: typeof r.student_id === "string" ? r.student_id : "",
    name: typeof r.display_name === "string" ? r.display_name : "",
  }));
}

// ───────── announcements: student side ─────────

/** Announcements from the caller's linked teachers, with the caller's read state. */
export async function myPosts(): Promise<StudentPost[]> {
  return rowsOf(await db().rpc("my_posts")).map(parseStudentPost);
}

/** Marks posts read. Does nothing (and makes no call) for an empty list. */
export async function markPostsRead(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  check(await db().rpc("mark_posts_read", { p_posts: ids }));
}

// ───────── conversations (both sides) ─────────

/**
 * Starts a conversation with `otherId` (the student for a teacher, the teacher for a student) about `a`, with a first
 * message. `label` is the item's name to save with it (null for a general conversation). If the pair already talks
 * about that item, the message goes into that conversation. Returns the conversation id.
 */
export async function startConversation(otherId: string, a: Anchor, label: string | null, body: string): Promise<string> {
  return check(await db().rpc("start_conversation", { p_other: otherId, p_kind: a.kind, p_ref: a.ref, p_label: label, p_body: body })) as string;
}

/** Adds a message to one of the caller's conversations (reopening it). Returns the message id. */
export async function sendMessage(id: string, body: string): Promise<string> {
  return check(await db().rpc("send_message", { p_conversation: id, p_body: body })) as string;
}

/** Deletes one of the caller's own messages; it stays in the thread without its text. */
export async function deleteMessage(id: string): Promise<void> {
  check(await db().rpc("delete_message", { p_message: id }));
}

export async function setConversationStatus(id: string, s: "open" | "resolved"): Promise<void> {
  check(await db().rpc("set_conversation_status", { p_conversation: id, p_status: s }));
}

export async function markConversationRead(id: string): Promise<void> {
  check(await db().rpc("mark_conversation_read", { p_conversation: id }));
}

/** The caller's conversations, newest first. */
export async function myConversations(): Promise<Conversation[]> {
  return rowsOf(await db().rpc("my_conversations")).map(parseConversation);
}

/** The messages of one conversation, oldest first. */
export async function conversationMessages(id: string): Promise<Message[]> {
  return rowsOf(await db().rpc("conversation_messages_for", { p_conversation: id })).map(parseMessage);
}

// ───────── badge counts ─────────

/** The caller's badge numbers. The RPC returns exactly one row. */
export async function classroomUnread(): Promise<ClassroomUnread> {
  const rows = check(await db().rpc("classroom_unread")) as Record<string, unknown>[] | null;
  return parseUnread(rows?.[0]);
}

// ───────── tasks for one student ─────────

/** The caller's tasks that reach one linked student right now (private and class tasks), with that student's done state. */
export async function studentTasksForTeacher(studentId: string): Promise<TeacherStudentTask[]> {
  return rowsOf(await db().rpc("teacher_student_tasks", { p_student: studentId })).map(parseTeacherStudentTask);
}
