"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { myConversations } from "@/lib/classroom-api";
import { shouldRefreshOnPath, studentMarkers, type StudentMarker } from "@/lib/classroom";
import { useStudent } from "@/lib/student-store";
import type { StudentTask } from "@/lib/tasks";
import { myTasks } from "@/lib/tasks-api";
import { useClassroomUnread } from "./useClassroomUnread";

// One module-level store behind every marker on the student's own pages (a speech bubble or a task box next to an
// item a counselor commented on or gave a task about): every component that reads it shares the same data and the
// same two requests (my_conversations + my_tasks). It loads only for a student who is linked to a teacher (the nav's
// unread numbers say so: teachers > 0), so a student without one costs no calls beyond the unread count. Markers are
// a convenience, so a failed load keeps what is there.

type Snapshot = {
  /** Whose data this is; null when nobody is fetching (signed out, not a student, or not linked to anyone). */
  userId: string | null;
  markers: ReadonlyMap<string, StudentMarker[]> | null;
  tasks: readonly StudentTask[] | null;
  /** What the data looked like when it arrived, so an identical reload doesn't re-render every marker. */
  sig: string;
};

const NOBODY: Snapshot = { userId: null, markers: null, tasks: null, sig: "" };
/** A reload that nobody asked for specifically (a page change, the window regaining focus) is skipped when the data is this fresh. */
const FRESH_MS = 2000;

let snap: Snapshot = NOBODY;
let loadedAt = 0;
let loading = false;
let again = false;
let scheduled = false;
let lastMoved = ""; // the unread numbers the last refresh was asked for; "" for a new user
let lastPath: string | null = null; // the page the last refresh was asked for; null for a new user
const listeners = new Set<() => void>();

const signature = (markers: ReadonlyMap<string, StudentMarker[]>, tasks: readonly StudentTask[]): string =>
  JSON.stringify([[...markers], tasks.map((t) => [t.id, t.done, t.dueOn])]);

function emit(next: Snapshot) {
  if (next.userId === snap.userId && next.sig === snap.sig) return;
  snap = next;
  for (const l of [...listeners]) l();
}

async function load() {
  const userId = snap.userId;
  if (!userId) return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  try {
    const [conversations, tasks] = await Promise.all([myConversations(), myTasks()]);
    loadedAt = Date.now();
    // The reply is dropped if somebody else is the user by now.
    if (snap.userId === userId) {
      const markers = studentMarkers(conversations, tasks);
      emit({ userId, markers, tasks, sig: signature(markers, tasks) });
    }
  } catch {
    // Keep what we have.
  } finally {
    loading = false;
    // Somebody else became the user while this load ran: their asks were skipped (a load was running), so load for them now.
    if (snap.userId !== null && snap.userId !== userId) again = true;
    if (again) {
      again = false;
      void load();
    }
  }
}

/**
 * Reloads the markers. Several calls in the same tick make one request. Unless `force`, it does nothing while a load is
 * running or just finished: the data is as fresh as a new request would make it.
 */
function refresh(force: boolean) {
  if (!force && (loading || Date.now() - loadedAt < FRESH_MS)) return;
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void load();
  });
}

/** Who to fetch for; null stops fetching and clears what was loaded. */
function setUser(userId: string | null) {
  if (userId === snap.userId) return;
  loadedAt = 0;
  lastMoved = ""; // so the new user's first numbers count as a move and load their data
  lastPath = null;
  emit(userId ? { userId, markers: null, tasks: null, sig: "" } : NOBODY);
}

const onFocus = () => refresh(false);

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("focus", onFocus);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("focus", onFocus);
  };
}

/**
 * The current student's loaded data: markers by item and tasks. Mounting this keeps it up to date: it loads for a new
 * user, reloads when the unread numbers move, when the page changes (unless it just loaded) and when the window regains
 * focus. Another marker mounting is no reason to reload. Null until loaded, and for anyone who isn't a linked student.
 */
function useStore(): Snapshot | null {
  const { auth, role } = useStudent();
  const pathname = usePathname();
  const unread = useClassroomUnread();
  const userId = auth && role === "student" && unread !== null && unread.teachers > 0 ? auth.userId : null;
  const moved = unread ? `${unread.posts}:${unread.conversations}` : "";
  const current = useSyncExternalStore(subscribe, () => snap, () => NOBODY);

  useEffect(() => {
    setUser(userId);
  }, [userId]);

  // A move of the unread numbers (a read, a new message; the first numbers of a new user) always reloads; a page change
  // reloads unless the data just arrived. Every mounted copy runs this; the first one moves lastMoved / lastPath on.
  useEffect(() => {
    if (!userId) return;
    const changed = moved !== lastMoved;
    const newPage = shouldRefreshOnPath(lastPath, pathname);
    lastMoved = moved;
    lastPath = pathname;
    if (changed || newPage) refresh(changed);
  }, [userId, moved, pathname]);

  // Until the effect above has switched the store over, the data may still be somebody else's.
  return userId !== null && current.userId === userId ? current : null;
}

/**
 * The student's markers keyed by anchorKey ("college:mit", "essay:ps"...): for each item, one entry per teacher who
 * commented on it or gave a task about it. Null while loading and for anyone who isn't a linked student.
 */
export function useStudentMarkers(): ReadonlyMap<string, StudentMarker[]> | null {
  return useStore()?.markers ?? null;
}

/** The student's tasks from their teachers (open and done), loaded with the markers. Null while loading and when not linked. */
export function useStudentTasks(): readonly StudentTask[] | null {
  return useStore()?.tasks ?? null;
}
