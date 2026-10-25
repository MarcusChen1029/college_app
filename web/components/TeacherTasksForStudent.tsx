"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { myTeachers } from "@/lib/links-api";
import { useStudent } from "@/lib/student-store";
import { sortStudentTasks, taskDays, taskTone, type StudentTask } from "@/lib/tasks";
import { myTasks, setTaskDone } from "@/lib/tasks-api";
import { errMsg, useLoad } from "@/lib/use-load";

const noop = () => () => {};

function TaskList() {
  // Only students linked to at least one teacher get the section; everyone else gets nothing at all.
  const load = useCallback(async () => {
    const teachers = await myTeachers();
    return teachers.length === 0 ? null : await myTasks();
  }, []);
  const { data, error, loading, retry } = useLoad(load);
  // Optimistic ticks: task id -> done, cleared once the server list is reloaded.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  if (loading || (!data && !error)) return null;
  if (error) {
    return (
      <section aria-labelledby="teacher-tasks" className="space-y-2 rounded-lg border border-zinc-200 p-5">
        <h2 id="teacher-tasks" className="font-display text-lg font-bold">
          From my teachers
        </h2>
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={retry}>
            Try again
          </button>
        </p>
      </section>
    );
  }
  if (!data) return null;

  const today = new Date();
  const tasks: StudentTask[] = sortStudentTasks(data.map((t) => (t.id in pending ? { ...t, done: pending[t.id] } : t)));
  const open = tasks.filter((t) => !t.done).length;

  async function toggle(t: StudentTask, done: boolean) {
    setActionError(null);
    setPending((p) => ({ ...p, [t.id]: done }));
    try {
      await setTaskDone(t.id, done);
    } catch (e) {
      setPending((p) => {
        const next = { ...p };
        delete next[t.id];
        return next;
      });
      setActionError(errMsg(e));
    }
  }

  return (
    <section aria-labelledby="teacher-tasks" className="space-y-3 rounded-lg border border-zinc-200 p-5">
      <h2 id="teacher-tasks" className="font-display text-lg font-bold">
        From my teachers {tasks.length > 0 && <span className="text-sm font-normal text-zinc-500">({open} to do)</span>}
      </h2>
      {actionError && (
        <p role="alert" className="text-sm text-urgent">
          {actionError}
        </p>
      )}
      {tasks.length === 0 ? (
        <p className="text-sm text-zinc-500">No tasks from your teachers or counselors right now.</p>
      ) : (
        <ul className="divide-y divide-zinc-100">
          {tasks.map((t) => {
            const days = taskDays(t, today);
            return (
              <li key={t.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <label className="flex min-w-0 items-start gap-3">
                  <input type="checkbox" className="mt-1 size-4 shrink-0" checked={t.done} onChange={(e) => void toggle(t, e.target.checked)} />
                  <span className="min-w-0">
                    <span className={`block font-medium [overflow-wrap:anywhere] ${t.done ? "text-zinc-500 line-through" : ""}`}>{t.title}</span>
                    <span className="block text-xs text-zinc-500">From {t.teacherName}</span>
                    {t.details && <span className="mt-1 block text-sm whitespace-pre-line text-zinc-600 [overflow-wrap:anywhere]">{t.details}</span>}
                  </span>
                </label>
                {t.dueOn && days != null ? (
                  <DeadlineChip date={t.dueOn} days={days} done={t.done} label="Due" />
                ) : (
                  <StatusPill tone={taskTone(t, today)}>{t.done ? "Done" : "No due date"}</StatusPill>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Tasks a student's linked teachers assigned them. Renders nothing when signed out, for teachers, or with no linked teacher. */
export function TeacherTasksForStudent() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready || !student.auth || student.role !== "student") return null;
  return <TaskList key={student.auth.userId} />;
}
