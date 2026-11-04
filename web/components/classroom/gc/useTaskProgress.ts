"use client";

// Who has done a task, loaded when its Classwork row is opened and kept for the rest of that page load: closing and
// opening the row again shows the same list without asking the server again. The list starts over whenever `stamp`
// changes (the page passes its load time, which moves after every write and every reload), so a row that is open when a
// write happens refreshes and a closed one fetches again when it is next opened. Needs a signed-in teacher.

import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "@/lib/use-load";
import type { TaskProgress } from "@/lib/tasks";
import { taskProgress } from "@/lib/tasks-api";

/** One task's list: the students, or why it could not be loaded (English, as `errMsg` gives it; show it through `errorText`). */
export type ProgressEntry = { rows: TaskProgress[] } | { error: string };

const NONE: Record<string, ProgressEntry> = {};

export function useTaskProgress(stamp: number): {
  /** By task id. A task that is missing here is loading (or was never asked for). */
  entries: Readonly<Record<string, ProgressEntry>>;
  /** Fetches the list for a task unless this page load already has it or is fetching it. Safe to call from an effect. */
  load: (taskId: string) => void;
  /** Forgets a failed list and fetches it again. */
  retry: (taskId: string) => void;
} {
  const [cache, setCache] = useState<{ stamp: number; entries: Record<string, ProgressEntry> }>({ stamp, entries: NONE });
  // `stamp:taskId` of every list that is being fetched or has been fetched (a failure removes its own key).
  const asked = useRef(new Set<string>());
  // The stamp of the latest render, so an answer that arrives after a reload is dropped instead of cached.
  const current = useRef(stamp);
  useEffect(() => {
    current.current = stamp;
  }, [stamp]);

  const load = useCallback(
    (taskId: string) => {
      const key = `${stamp}:${taskId}`;
      if (asked.current.has(key)) return;
      asked.current.add(key);
      const store = (entry: ProgressEntry) => {
        if (current.current !== stamp) return;
        setCache((c) => ({ stamp, entries: { ...(c.stamp === stamp ? c.entries : NONE), [taskId]: entry } }));
      };
      taskProgress(taskId).then(
        (rows) => store({ rows }),
        (e) => {
          asked.current.delete(key);
          store({ error: errMsg(e) });
        },
      );
    },
    [stamp],
  );

  const retry = useCallback(
    (taskId: string) => {
      asked.current.delete(`${stamp}:${taskId}`);
      setCache((c) => {
        if (c.stamp !== stamp) return c;
        const entries = { ...c.entries };
        delete entries[taskId];
        return { stamp, entries };
      });
      load(taskId);
    },
    [stamp, load],
  );

  return { entries: cache.stamp === stamp ? cache.entries : NONE, load, retry };
}
