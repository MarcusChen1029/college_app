"use client";

// The one load behind the teacher's class screens (the Classes grid and a class page): the classes with their codes, the
// linked students, the teacher's announcements and class tasks. The classes and students are required; announcements
// and tasks are extras, so when one of them fails the page still works and that part is `null` (its screens leave it
// out). Needs a signed-in teacher (TeacherGate); the data belongs to that user, so another user's copy is never handed out.

import { useCallback, useEffect, useRef, useState } from "react";
import { teacherPosts } from "@/lib/classroom-api";
import type { TeacherPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { listStudents, loadTeacherOverview, type LinkedStudent, type TeacherOverview } from "@/lib/links-api";
import { useStudent } from "@/lib/student-store";
import type { TeacherTask } from "@/lib/tasks";
import { listMyTasks } from "@/lib/tasks-api";
import { classroomError } from "../ClassroomText";

export type TeacherClassroom = {
  /** The first load has finished (a reload keeps the old data on screen and keeps this true). */
  ready: boolean;
  /** Why the last load failed, in the reader's language; null when it worked. Data from an earlier load stays. */
  error: string | null;
  overview: TeacherOverview | null;
  students: LinkedStudent[];
  /** null = the announcements could not be loaded. */
  posts: TeacherPost[] | null;
  /** null = the tasks could not be loaded. */
  tasks: TeacherTask[] | null;
  /** The page's load time, in milliseconds: "is this code expired" is judged against it, never against a clock read during render. */
  loadedAt: number;
  /** Loads everything again; the promise settles when that load has finished (it never rejects: a failure shows in `error`). Call it after a write. */
  reload: () => Promise<void>;
};

type Data = { overview: TeacherOverview; students: LinkedStudent[]; posts: TeacherPost[] | null; tasks: TeacherTask[] | null; loadedAt: number };

async function loadAll(): Promise<Data> {
  const [overview, students, posts, tasks] = await Promise.all([loadTeacherOverview(), listStudents(), teacherPosts().catch(() => null), listMyTasks().catch(() => null)]);
  return { overview, students, posts, tasks, loadedAt: Date.now() };
}

/** Loads the teacher's classroom data once per user and again on `reload()`. The values keep their identity until the next load. */
export function useTeacherClassroom(): TeacherClassroom {
  const t = useT();
  const userId = useStudent().auth?.userId ?? null;
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{ userId: string; data: Data } | null>(null);
  const [failure, setFailure] = useState<{ userId: string; cause: unknown } | null>(null);
  // Callers of reload() waiting for the next load to finish.
  const waiting = useRef<(() => void)[]>([]);

  useEffect(() => {
    if (!userId) return;
    let live = true;
    const release = () => waiting.current.splice(0).forEach((done) => done());
    loadAll().then(
      (data) => {
        if (!live) return;
        setLoaded({ userId, data });
        setFailure(null);
        release();
      },
      (cause) => {
        if (!live) return;
        setFailure({ userId, cause });
        release();
      },
    );
    return () => {
      live = false;
    };
  }, [userId, nonce]);

  const reload = useCallback(
    () =>
      new Promise<void>((done) => {
        waiting.current.push(done);
        setNonce((n) => n + 1);
      }),
    [],
  );

  const mine = loaded && loaded.userId === userId ? loaded.data : null;
  const failed = failure && failure.userId === userId ? failure : null;
  return {
    ready: mine !== null,
    error: failed ? classroomError(t, failed.cause) : null,
    overview: mine?.overview ?? null,
    students: mine?.students ?? NO_STUDENTS,
    posts: mine?.posts ?? null,
    tasks: mine?.tasks ?? null,
    loadedAt: mine?.loadedAt ?? 0,
    reload,
  };
}

const NO_STUDENTS: LinkedStudent[] = [];
