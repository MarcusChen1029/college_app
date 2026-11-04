"use client";

// The one load behind the student's classroom screens (Classes home, 1-on-1 page, class page, task page, To-do): the
// linked teachers with their classes, the announcements, the tasks and the conversations. Every screen reads this instead
// of fetching its own copy. Needs a signed-in student (StudentGate); the data belongs to that user, so another user's
// copy is never handed out.

import { useCallback, useEffect, useRef, useState } from "react";
import { myConversations, myPosts } from "@/lib/classroom-api";
import type { Conversation, StudentPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { myTeachers, type MyTeacher } from "@/lib/links-api";
import { useStudent } from "@/lib/student-store";
import type { StudentTask } from "@/lib/tasks";
import { myTasks } from "@/lib/tasks-api";
import { classroomError } from "../ClassroomText";
import { useClassroomUnread } from "../useClassroomUnread";

export type StudentClassroom = {
  /** The first load has finished (a reload keeps the old data on screen and keeps this true). */
  ready: boolean;
  /** Why the last load failed, in the reader's language; null when it worked. Data from an earlier load stays in the lists. */
  error: string | null;
  teachers: MyTeacher[];
  posts: StudentPost[];
  tasks: StudentTask[];
  conversations: Conversation[];
  /** Loads everything again. Call it after a write. */
  reload: () => void;
};

type Data = { teachers: MyTeacher[]; posts: StudentPost[]; tasks: StudentTask[]; conversations: Conversation[] };

const NO_DATA: Data = { teachers: [], posts: [], tasks: [], conversations: [] };

async function loadAll(): Promise<Data> {
  const [teachers, posts, tasks, conversations] = await Promise.all([myTeachers(), myPosts(), myTasks(), myConversations()]);
  return { teachers, posts, tasks, conversations };
}

/**
 * Loads the student's classroom data once per user and again on `reload()`, and whenever the nav badge numbers change
 * (they move after anything calls refreshClassroomUnread(), and when the window regains focus with something new).
 * The arrays keep their identity between renders until the next load, so they are safe in effect dependencies.
 */
export function useStudentClassroom(): StudentClassroom {
  const t = useT();
  const userId = useStudent().auth?.userId ?? null;
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ userId: string; data: Data } | null>(null);
  const [failure, setFailure] = useState<{ userId: string; cause: unknown } | null>(null);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    loadAll().then(
      (data) => {
        if (!live) return;
        setLoaded({ userId, data });
        setFailure(null);
      },
      (cause) => {
        if (live) setFailure({ userId, cause });
      },
    );
    return () => {
      live = false;
    };
  }, [userId, nonce]);

  // A change in the badge numbers means something moved on the server (or this page just read something): load again.
  // The first numbers only set the baseline, because the load above already covers them.
  const unread = useClassroomUnread();
  const unreadKey = unread ? `${unread.teachers}.${unread.posts}.${unread.conversations}` : null;
  const baseline = useRef<string | null>(null);
  useEffect(() => {
    if (unreadKey === null) return;
    const before = baseline.current;
    baseline.current = unreadKey;
    if (before !== null && before !== unreadKey) setNonce((n) => n + 1);
  }, [unreadKey]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const mine = loaded && loaded.userId === userId ? loaded.data : null;
  const failed = failure && failure.userId === userId ? failure : null;
  const data = mine ?? NO_DATA;
  return {
    ready: mine !== null,
    error: failed ? classroomError(t, failed.cause) : null,
    teachers: data.teachers,
    posts: data.posts,
    tasks: data.tasks,
    conversations: data.conversations,
    reload,
  };
}
