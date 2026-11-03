"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { classroomUnread } from "@/lib/classroom-api";
import type { ClassroomUnread } from "@/lib/classroom";
import { useStudent } from "@/lib/student-store";

// One module-level store for the nav badges: every component that calls useClassroomUnread() shares the same
// numbers and the same requests. Badge counts are a convenience, so a failed load keeps the last numbers.

type Entry = { userId: string | null; unread: ClassroomUnread | null };

const NOBODY: Entry = { userId: null, unread: null };
let entry: Entry = NOBODY; // whose numbers these are
let loading = false;
let again = false; // a refresh arrived while a load was running
let scheduled = false;
const listeners = new Set<() => void>();

const same = (a: ClassroomUnread | null, b: ClassroomUnread | null): boolean =>
  a === b || (a !== null && b !== null && a.teachers === b.teachers && a.posts === b.posts && a.conversations === b.conversations);

function emit(next: Entry) {
  if (next.userId === entry.userId && same(next.unread, entry.unread)) return;
  entry = next;
  for (const l of [...listeners]) l();
}

async function load() {
  const userId = entry.userId;
  if (!userId) return;
  if (loading) {
    again = true;
    return;
  }
  loading = true;
  try {
    const unread = await classroomUnread();
    // The reply is dropped if somebody else signed in meanwhile.
    if (entry.userId === userId) emit({ userId, unread });
  } catch {
    // Keep the numbers we have.
  } finally {
    loading = false;
    if (again) {
      again = false;
      void load();
    }
  }
}

/**
 * Reloads the badge numbers (call it after the caller changed something that moves them, e.g. read a post or a
 * conversation). Several calls in the same tick make one request. Does nothing while nobody with a role is signed in.
 */
export function refreshClassroomUnread(): void {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    void load();
  });
}

/** Who the numbers belong to; null when signed out or without a role. A new person starts with no numbers. */
function setUser(userId: string | null) {
  if (userId === entry.userId) return;
  emit({ userId, unread: null });
  if (userId) refreshClassroomUnread();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("focus", refreshClassroomUnread);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("focus", refreshClassroomUnread);
  };
}

/**
 * The signed-in person's badge numbers (students: linked teachers, unread posts, conversations with unread
 * messages; teachers: conversations that need a reply), or null while loading and when signed out. Reloads when the
 * page changes, when the window regains focus and on refreshClassroomUnread().
 */
export function useClassroomUnread(): ClassroomUnread | null {
  const { auth, role } = useStudent();
  const pathname = usePathname();
  const userId = auth && role ? auth.userId : null;
  const snap = useSyncExternalStore(subscribe, () => entry, () => NOBODY);

  useEffect(() => {
    setUser(userId);
  }, [userId]);

  useEffect(() => {
    if (userId) refreshClassroomUnread();
  }, [userId, pathname]);

  // Until the effect above has switched the store over, the entry may still be somebody else's (or empty).
  return userId !== null && snap.userId === userId ? snap.unread : null;
}
