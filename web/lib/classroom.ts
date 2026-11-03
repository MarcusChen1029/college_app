// Classroom phase 1 (migrations "classroom"): teacher announcements, two-way conversations about items, private
// notes and tasks. Pure helpers only (validation, parsing, sorting, marker maths). The database decides who sees what;
// the limits below mirror the check constraints and RPC checks in supabase/migrations/00NN_classroom.sql, so keep the
// two in step.

import { ANCHOR_KINDS, anchorKey, type Anchor, type AnchorKind } from "./anchors.ts";
import { isHttpUrl } from "./linkify.ts";

export const CLASSROOM_LIMITS = {
  postTitle: 120,
  postBody: 4000,
  link: 500,
  message: 2000,
  anchorLabel: 120,
  teacherMessagesPerDay: 300,
  studentMessagesPerDay: 50,
  teacherPostsPerDay: 20,
  activePostsPerTeacher: 200,
  conversationsPerPair: 100,
} as const;

export type PostInput = { title: string; body: string; link: string | null; pinned: boolean };

/** An announcement as a student sees it (my_posts). */
export type StudentPost = {
  id: string;
  teacherId: string;
  classId: string | null;
  className: string | null;
  title: string;
  body: string;
  link: string | null;
  pinned: boolean;
  createdAt: string;
  read: boolean;
};

/** An announcement as its teacher sees it (teacher_posts). `audience` and `readCount` count the students who were there when it was posted. */
export type TeacherPost = {
  id: string;
  classId: string | null;
  className: string | null;
  title: string;
  body: string;
  link: string | null;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  audience: number;
  readCount: number;
};

/** What a conversation, comment or task is about. `label` is null when it was never saved or the viewer may not see it. */
export type AnchorInfo = { anchor: Anchor; label: string | null; available: boolean };

export type Conversation = {
  id: string;
  otherId: string;
  otherName: string;
  about: AnchorInfo;
  status: "open" | "resolved";
  startedBy: "teacher" | "student";
  lastMessageAt: string;
  lastAuthor: "teacher" | "student";
  lastBody: string | null;
  unread: number;
};

/** One message; a deleted one keeps its place but has no body. */
export type Message = { id: string; author: "teacher" | "student"; body: string | null; deleted: boolean; createdAt: string };

export type ClassroomUnread = { teachers: number; posts: number; conversations: number };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };

/** Trims and checks an announcement form. Mirrors the table's check constraints and the RPC checks. */
export function validatePost(i: Partial<Record<keyof PostInput, unknown>>): Result<PostInput> {
  const title = typeof i.title === "string" ? i.title.trim() : "";
  if (!title) return { ok: false, error: "Enter a title for the announcement." };
  if (title.length > CLASSROOM_LIMITS.postTitle) return { ok: false, error: `Keep the title under ${CLASSROOM_LIMITS.postTitle} characters.` };
  const body = typeof i.body === "string" ? i.body.trim() : "";
  if (!body) return { ok: false, error: "Write the announcement." };
  if (body.length > CLASSROOM_LIMITS.postBody) return { ok: false, error: `Keep the text under ${CLASSROOM_LIMITS.postBody} characters.` };
  const raw = typeof i.link === "string" ? i.link.trim() : "";
  if (raw.length > CLASSROOM_LIMITS.link) return { ok: false, error: `Keep the link under ${CLASSROOM_LIMITS.link} characters.` };
  if (raw && !isHttpUrl(raw)) return { ok: false, error: "The link must start with http:// or https://." };
  return { ok: true, value: { title, body, link: raw || null, pinned: i.pinned === true } };
}

/** Trims and checks one message. */
export function validateMessage(body: unknown): Result<string> {
  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Write a message first." };
  if (text.length > CLASSROOM_LIMITS.message) return { ok: false, error: `Keep the message under ${CLASSROOM_LIMITS.message} characters.` };
  return { ok: true, value: text };
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
const side = (v: unknown): "teacher" | "student" => (v === "student" ? "student" : "teacher");

export function parseStudentPost(r: Record<string, unknown>): StudentPost {
  return {
    id: str(r.post_id),
    teacherId: str(r.teacher_id),
    classId: strOrNull(r.class_id),
    className: strOrNull(r.class_name),
    title: str(r.title),
    body: str(r.body),
    link: strOrNull(r.link_url),
    pinned: r.pinned === true,
    createdAt: str(r.created_at),
    read: r.is_read === true,
  };
}

export function parseTeacherPost(r: Record<string, unknown>): TeacherPost {
  return {
    id: str(r.post_id),
    classId: strOrNull(r.class_id),
    className: strOrNull(r.class_name),
    title: str(r.title),
    body: str(r.body),
    link: strOrNull(r.link_url),
    pinned: r.pinned === true,
    archived: r.archived === true,
    createdAt: str(r.created_at),
    updatedAt: str(r.updated_at),
    audience: int(r.audience),
    readCount: int(r.read_count),
  };
}

/** Reads anchor_kind / anchor_ref / anchor_label / anchor_available. A null or unknown kind is "general". */
export function parseAnchorInfo(r: Record<string, unknown>): AnchorInfo {
  const kind = (ANCHOR_KINDS as readonly unknown[]).includes(r.anchor_kind) ? (r.anchor_kind as AnchorKind) : "general";
  return {
    anchor: { kind, ref: kind === "general" ? null : strOrNull(r.anchor_ref) },
    label: strOrNull(r.anchor_label),
    available: kind === "general" || r.anchor_available === true,
  };
}

export function parseConversation(r: Record<string, unknown>): Conversation {
  return {
    id: str(r.conversation_id),
    otherId: str(r.other_id),
    otherName: str(r.other_name),
    about: parseAnchorInfo(r),
    status: r.status === "resolved" ? "resolved" : "open",
    startedBy: side(r.started_by),
    lastMessageAt: str(r.last_message_at),
    lastAuthor: side(r.last_author),
    lastBody: strOrNull(r.last_body),
    unread: int(r.unread),
  };
}

export function parseMessage(r: Record<string, unknown>): Message {
  return { id: str(r.message_id), author: side(r.author), body: strOrNull(r.body), deleted: r.deleted === true, createdAt: str(r.created_at) };
}

/** classroom_unread() row; zeros when there is none. */
export function parseUnread(r: unknown): ClassroomUnread {
  const o = typeof r === "object" && r !== null ? (r as Record<string, unknown>) : {};
  return { teachers: int(o.teachers), posts: int(o.posts), conversations: int(o.conversations) };
}

const newestFirst = (a: string, b: string): number => (a === b ? 0 : a < b ? 1 : -1);

/** Pinned first, then newest first. Returns a new array. */
export function sortPosts<T extends { pinned: boolean; createdAt: string }>(p: readonly T[]): T[] {
  return [...p].sort((a, b) => Number(b.pinned) - Number(a.pinned) || newestFirst(a.createdAt, b.createdAt));
}

/** What the student's strip shows: every unread post, then the newest read ones, up to `max` posts in total. */
export function shownPosts(p: readonly StudentPost[], max = 3): StudentPost[] {
  const unread = sortPosts(p.filter((x) => !x.read));
  const read = sortPosts(p.filter((x) => x.read));
  return [...unread, ...read.slice(0, Math.max(0, max - unread.length))];
}

/** The Counselors page's comments list: every conversation with unread messages, then the newest read ones, up to `max` in total. */
export function shownConversations(list: readonly Conversation[], max = 3): Conversation[] {
  const sorted = filterConversations(list, "all", null);
  const unread = sorted.filter((c) => c.unread > 0);
  const read = sorted.filter((c) => c.unread === 0);
  return [...unread, ...read.slice(0, Math.max(0, max - unread.length))];
}

/**
 * The classes a student is in with one teacher, as names with ids. my_teachers() returns the names only, so an id comes
 * from the announcements and tasks of that teacher that name the class. A class nothing mentions yet, and a name two
 * classes share, get a null id (the page then has nothing safe to pass to leave_class).
 */
export function classRefs(names: readonly string[], known: readonly { classId: string | null; className: string | null }[]): { name: string; id: string | null }[] {
  const ids = new Map<string, Set<string>>();
  for (const k of known) {
    if (!k.classId || !k.className) continue;
    let set = ids.get(k.className);
    if (!set) ids.set(k.className, (set = new Set()));
    set.add(k.classId);
  }
  return names.map((name) => {
    const set = ids.get(name);
    return { name, id: set && set.size === 1 ? [...set][0] : null };
  });
}

const momentOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Teachers with the newest announcement or message first. A teacher with neither goes by link time; ties keep input order. Returns a new array. */
export function byRecentActivity<T extends { teacherId: string; linkedAt: string }>(
  teachers: readonly T[],
  posts: readonly { teacherId: string; createdAt: string }[],
  conversations: readonly { otherId: string; lastMessageAt: string }[],
): T[] {
  const last = new Map<string, number>();
  const note = (id: string, iso: string) => last.set(id, Math.max(last.get(id) ?? 0, momentOf(iso)));
  for (const p of posts) note(p.teacherId, p.createdAt);
  for (const c of conversations) note(c.otherId, c.lastMessageAt);
  const key = (t: T): number => Math.max(last.get(t.teacherId) ?? 0, momentOf(t.linkedAt));
  return [...teachers].sort((a, b) => key(b) - key(a));
}

/** The student wrote last and the teacher hasn't looked yet. */
export const needsReply = (c: Conversation): boolean => c.lastAuthor === "student" && c.unread > 0;

export type ConversationFilter = "needs_reply" | "open" | "resolved" | "all";

/** Newest first. `studentIds` (e.g. one class) limits the list to those students; null means everyone. */
export function filterConversations(list: readonly Conversation[], f: ConversationFilter, studentIds: ReadonlySet<string> | null): Conversation[] {
  const keep = (c: Conversation): boolean => {
    if (studentIds && !studentIds.has(c.otherId)) return false;
    if (f === "needs_reply") return needsReply(c);
    if (f === "open") return c.status === "open";
    if (f === "resolved") return c.status === "resolved";
    return true;
  };
  return list.filter(keep).sort((a, b) => newestFirst(a.lastMessageAt, b.lastMessageAt));
}

/** The conversation with this person about this item. A general conversation has no single item, so never matches. */
export function findConversation(list: readonly Conversation[], otherId: string, a: Anchor): Conversation | null {
  if (a.kind === "general") return null;
  return list.find((c) => c.otherId === otherId && c.about.anchor.kind === a.kind && c.about.anchor.ref === a.ref) ?? null;
}

/** What to show next to one item: its conversation, how many private notes and open private tasks it has. */
export type Marker = { conversationId: string | null; unread: number; notes: number; openTasks: number; firstTaskId: string | null };

/**
 * Markers keyed by anchorKey. General and missing anchors are skipped, and so are done tasks. Callers pass one
 * teacher's items at a time (a student linked to two teachers sees each teacher's markers separately).
 * `firstTaskId` is the first open task on the item in input order.
 */
export function markersByAnchor(i: {
  conversations?: readonly Conversation[];
  notes?: readonly { anchor: Anchor | null }[];
  tasks?: readonly { id: string; about: AnchorInfo | null; done: boolean }[];
}): Map<string, Marker> {
  const out = new Map<string, Marker>();
  const at = (a: Anchor): Marker => {
    const key = anchorKey(a);
    let m = out.get(key);
    if (!m) {
      m = { conversationId: null, unread: 0, notes: 0, openTasks: 0, firstTaskId: null };
      out.set(key, m);
    }
    return m;
  };
  for (const c of i.conversations ?? []) {
    if (c.about.anchor.kind === "general") continue;
    const m = at(c.about.anchor);
    m.conversationId ??= c.id;
    m.unread += c.unread;
  }
  for (const n of i.notes ?? []) {
    if (!n.anchor || n.anchor.kind === "general") continue;
    at(n.anchor).notes += 1;
  }
  for (const t of i.tasks ?? []) {
    if (!t.about || t.about.anchor.kind === "general" || t.done) continue;
    const m = at(t.about.anchor);
    m.openTasks += 1;
    m.firstTaskId ??= t.id;
  }
  return out;
}

// What a teacher can and cannot see of a linked student, as i18n key suffixes. TEACHER_SEES mirrors what
// teacher_student (0023:66-81) and teacher_roster (0023:29-39) return, plus the classroom data; TEACHER_NEVER_SEES is
// what no RPC returns, so a reader of the Settings page can be told plainly.
export const TEACHER_SEES = ["nameEmail", "scores", "plans", "list", "interested", "activities", "essays", "lastActive", "tasks", "postReads", "messages"] as const;
export const TEACHER_NEVER_SEES = ["portals", "notes", "aid", "transcript", "recommenders", "scholarships", "resume", "passwords"] as const;

/** Plain wording for the errors the classroom RPCs raise (they all start with "classroom: "). */
export function classroomErrorMessage(raw: string): string {
  const m = raw.toLowerCase();
  if (m.includes("classroom: limit")) return "You've reached the limit for this. Archive or remove some items, then try again.";
  if (m.includes("classroom: not linked")) return "You're no longer linked with this person.";
  if (m.includes("classroom: not found")) return "That item is no longer available.";
  if (m.includes("classroom: invalid")) return "Please check the text and the link, then try again.";
  if (m.includes("classroom: rate")) return "You've reached today's limit. Please try again tomorrow.";
  return raw || "Something went wrong. Please try again.";
}
