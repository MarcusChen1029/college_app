// What the student's Classes home shows: one card per class the student is in, one 1-on-1 card per linked teacher,
// newest activity first, with the dot rules. Pure functions only (the screen draws them), so they can be tested.
// Spec 2026-11-04-classroom-google-style-design.md section 3.1.

import { themeFor, type ClassTheme } from "./class-theme.ts";
import { pairClasses, type Conversation, type StudentPost } from "./classroom.ts";
import { cardDue } from "./classwork.ts";
import type { MyTeacher } from "./links-api.ts";
import type { StudentTask } from "./tasks.ts";

type Base = {
  /** Unique over the page (a React key). */
  key: string;
  teacher: MyTeacher;
  /** The banner colour: the class's own, or one derived from its id; a 1-on-1 card's is derived from the teacher id. */
  theme: ClassTheme;
  /** The (at most two) open tasks with the nearest due dates, already-missed ones first (lib/classwork.ts cardDue). */
  due: StudentTask[];
  /** The card's dot: see classHasUnread and oneOnOneHasUnread. */
  unread: boolean;
  /** Newest thing on the card, in milliseconds; the card order. */
  activity: number;
};
export type ClassHomeCard = Base & { kind: "class"; classId: string; name: string; year: string | null };
export type OneOnOneCard = Base & { kind: "oneOnOne" };
export type HomeCard = ClassHomeCard | OneOnOneCard;

// The student's classroom addresses. Ids are encoded, so an odd id can never change the path.
export const classPath = (classId: string): string => `/counselor/class/${encodeURIComponent(classId)}`;
export const oneOnOnePath = (teacherId: string): string => `/counselor/teacher/${encodeURIComponent(teacherId)}`;
export const taskPath = (taskId: string): string => `/counselor/task/${encodeURIComponent(taskId)}`;
export const TODO_PATH = "/counselor/todo";

/** A timestamp as milliseconds; 0 for one that cannot be read, so it never wins "newest". */
const moment = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

const newest = (times: readonly string[]): number => times.reduce((m, iso) => Math.max(m, moment(iso)), 0);

/** A class card's dot: an announcement to that class the student has not read. Posts to all of a teacher's students never count here. */
export const classHasUnread = (posts: readonly Pick<StudentPost, "classId" | "read">[], classId: string): boolean =>
  posts.some((p) => p.classId === classId && !p.read);

/**
 * A 1-on-1 card's dot: an announcement to all of this teacher's students (no class) the student has not read, or a
 * conversation with this teacher that has unread messages. One post to all students therefore lights one card, not several.
 */
export function oneOnOneHasUnread(
  posts: readonly Pick<StudentPost, "teacherId" | "classId" | "read">[],
  conversations: readonly Pick<Conversation, "otherId" | "unread">[],
  teacherId: string,
): boolean {
  return posts.some((p) => p.teacherId === teacherId && p.classId === null && !p.read) || conversations.some((c) => c.otherId === teacherId && c.unread > 0);
}

/**
 * The cards of the Classes home, newest activity first. A class card exists for each class in `my_teachers` that is not
 * archived and whose id is known; a 1-on-1 card for each linked teacher. A card's activity is the newest of its
 * announcements, tasks and (1-on-1) conversations, never older than when the student linked to the teacher.
 * Ties: class cards before 1-on-1 cards, then by key, so the order never shuffles between loads.
 * `today` is the reader's local `YYYY-MM-DD`.
 */
export function homeCards(
  i: { teachers: readonly MyTeacher[]; posts: readonly StudentPost[]; tasks: readonly StudentTask[]; conversations: readonly Conversation[] },
  today: string,
): HomeCard[] {
  const cards: HomeCard[] = [];
  for (const teacher of i.teachers) {
    const posts = i.posts.filter((p) => p.teacherId === teacher.teacherId);
    const tasks = i.tasks.filter((x) => x.teacherId === teacher.teacherId);
    const linked = moment(teacher.linkedAt);

    const names = pairClasses(teacher.classNames, teacher.classIds);
    names.forEach((c, index) => {
      if (c.id === null || teacher.classArchived[index]) return;
      const classId = c.id;
      const classTasks = tasks.filter((x) => x.classId === classId);
      cards.push({
        kind: "class",
        key: `class:${classId}`,
        teacher,
        classId,
        name: c.name,
        year: teacher.classYears[index] ?? null,
        theme: themeFor(classId, teacher.classThemes[index]),
        due: cardDue(classTasks, today),
        unread: classHasUnread(posts, classId),
        activity: Math.max(linked, newest(posts.filter((p) => p.classId === classId).map((p) => p.createdAt)), newest(classTasks.map((x) => x.createdAt))),
      });
    });

    const mine = i.conversations.filter((c) => c.otherId === teacher.teacherId);
    const privateTasks = tasks.filter((x) => x.classId === null);
    cards.push({
      kind: "oneOnOne",
      key: `one:${teacher.teacherId}`,
      teacher,
      theme: themeFor(teacher.teacherId),
      due: cardDue(privateTasks, today),
      unread: oneOnOneHasUnread(posts, mine, teacher.teacherId),
      activity: Math.max(
        linked,
        newest(posts.filter((p) => p.classId === null).map((p) => p.createdAt)),
        newest(privateTasks.map((x) => x.createdAt)),
        newest(mine.map((c) => c.lastMessageAt)),
      ),
    });
  }
  return cards.sort((a, b) => b.activity - a.activity || Number(a.kind === "oneOnOne") - Number(b.kind === "oneOnOne") || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

/** The first letter of a name, upper case, for a round avatar; "?" for a blank name. Counts a whole character (an emoji or a CJK character is one). */
export function initialOf(name: string): string {
  const first = [...name.trim()][0];
  return first ? first.toUpperCase() : "?";
}
