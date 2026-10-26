"use client";

import { useCallback, useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { TeacherGate } from "@/components/TeacherGate";
import { daysUntil } from "@/lib/format";
import { listStudents, loadTeacherOverview, type LinkedStudent, type TeacherClass } from "@/lib/links-api";
import {
  activeTaskCount,
  emptyTask,
  parseTarget,
  progressText,
  progressTone,
  sortTeacherTasks,
  targetLabel,
  targetValue,
  TASK_LIMITS,
  validateTask,
  type TaskInput,
  type TeacherTask,
} from "@/lib/tasks";
import { archiveTask, createTask, listMyTasks, taskProgress, updateTask } from "@/lib/tasks-api";
import { buttonClass } from "@/lib/ui";
import { errMsg, useLoad } from "@/lib/use-load";

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
const btn = buttonClass("secondary", "sm");

/** Title, details and due date. With `targets` it also has the class / student picker (new tasks only). */
function TaskForm({
  initial,
  submitLabel,
  targets,
  onSave,
  onCancel,
}: {
  initial: TaskInput;
  submitLabel: string;
  targets?: { classes: TeacherClass[]; students: LinkedStudent[] };
  onSave: (v: TaskInput, target: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [f, setF] = useState<TaskInput>(initial);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (targets && !parseTarget(target)) return setError("Choose a class or a student.");
    const r = validateTask(f);
    if (!r.ok) return setError(r.error);
    setError(null);
    setBusy(true);
    try {
      await onSave(r.value, target);
      if (!onCancel) {
        setF(emptyTask());
        setTarget("");
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const classes = targets?.classes.filter((c) => !c.archived) ?? [];
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      {targets && (
        <label className="text-sm font-medium sm:col-span-2">
          Assign to
          <select className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">Choose a class or a student…</option>
            {classes.length > 0 && (
              <optgroup label="Classes">
                {classes.map((c) => (
                  <option key={c.id} value={targetValue({ kind: "class", id: c.id })}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {targets.students.length > 0 && (
              <optgroup label="One student">
                {targets.students.map((s) => (
                  <option key={s.studentId} value={targetValue({ kind: "student", id: s.studentId })}>
                    {s.displayName}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
      )}
      <label className="text-sm font-medium sm:col-span-2">
        Task
        <input className={field} value={f.title} maxLength={TASK_LIMITS.title} onChange={(e) => set("title", e.target.value)} placeholder="Finish the Common App activities section" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Details <span className="font-normal text-zinc-500">(optional)</span>
        <textarea className={field} rows={2} value={f.details} maxLength={TASK_LIMITS.details} onChange={(e) => set("details", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        Due <span className="font-normal text-zinc-500">(optional)</span>
        <input type="date" className={field} value={f.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value || null)} />
      </label>
      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
        {onCancel && (
          <button type="button" className={btn} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={buttonClass("primary", "sm")} disabled={busy}>
          {submitLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-urgent sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}

/** Who has finished one task. Loaded when opened. */
function ProgressList({ taskId }: { taskId: string }) {
  const load = useCallback(() => taskProgress(taskId), [taskId]);
  const { data, error, retry } = useLoad(load);
  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-urgent">
        {error}{" "}
        <button type="button" className="underline" onClick={retry}>
          Try again
        </button>
      </p>
    ) : (
      <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
    );
  }
  if (data.length === 0) return <p className="text-sm text-zinc-500">No linked students are assigned this task right now.</p>;
  return (
    <ul className="grid gap-1 text-sm sm:grid-cols-2">
      {data.map((p) => (
        <li key={p.studentId} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-3 py-1.5">
          <span className="[overflow-wrap:anywhere]">{p.displayName}</span>
          <StatusPill tone={p.done ? "done" : "neutral"}>
            {p.done && p.doneAt ? `Done ${new Date(p.doneAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "Not done"}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

function TaskRow({ task, today, run }: { task: TeacherTask; today: Date; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="p-4">
        <TaskForm
          initial={{ title: task.title, details: task.details, dueOn: task.dueOn }}
          submitLabel="Save"
          onSave={async (v) => {
            await updateTask(task.id, v);
            setEditing(false);
            await run(async () => {});
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium [overflow-wrap:anywhere]">{task.title}</p>
          <p className="text-sm text-zinc-500">
            {targetLabel(task)}
            {task.classArchived && " (archived class)"}
          </p>
          {task.details && <p className="mt-1 text-sm whitespace-pre-line text-zinc-600 [overflow-wrap:anywhere]">{task.details}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {task.dueOn && <DeadlineChip date={task.dueOn} days={daysUntil(task.dueOn, today)} done={progressTone(task) === "done"} doneLabel="All done" label="Due" />}
          <StatusPill tone={progressTone(task)}>{progressText(task)}</StatusPill>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide students" : "Who's done"}
        </button>
        {!task.archived && (
          <button type="button" className={btn} aria-label={`Edit ${task.title}`} onClick={() => setEditing(true)}>
            Edit
          </button>
        )}
        <button
          type="button"
          className={buttonClass(task.archived ? "secondary" : "danger", "sm")}
          aria-label={`${task.archived ? "Restore" : "Archive"} ${task.title}`}
          onClick={() => {
            if (!task.archived && !confirm(`Archive "${task.title}"? Students will no longer see it.`)) return;
            void run(() => archiveTask(task.id, !task.archived));
          }}
        >
          {task.archived ? "Restore" : "Archive"}
        </button>
      </div>
      {open && <ProgressList taskId={task.id} />}
    </li>
  );
}

function TasksBoard() {
  const load = useCallback(async () => {
    const [tasks, overview, students] = await Promise.all([listMyTasks(), loadTeacherOverview(), listStudents()]);
    return { tasks, classes: overview.classes, students, now: new Date() };
  }, []);
  const { data, error, retry } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(errMsg(e));
    }
    retry();
  };

  if (!data) {
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
        <button type="button" className={btn} onClick={retry}>
          Try again
        </button>
      </div>
    ) : (
      <div className="h-64 animate-pulse rounded-lg bg-zinc-100" />
    );
  }

  const sorted = sortTeacherTasks(data.tasks);
  const active = sorted.filter((t) => !t.archived);
  const archived = sorted.filter((t) => t.archived);
  const noTargets = data.students.length === 0 && !data.classes.some((c) => !c.archived);

  return (
    <div className="space-y-6">
      {actionError && (
        <p role="alert" className="text-sm text-urgent">
          {actionError}
        </p>
      )}
      <section aria-labelledby="task-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="task-add" className="font-display text-lg font-bold">
          Assign a task
        </h2>
        {noTargets ? (
          <p className="text-sm text-zinc-500">Create a class or link a student on the Classes page first; tasks go to a class or to one linked student.</p>
        ) : (
          <TaskForm
            initial={emptyTask()}
            submitLabel="Assign task"
            targets={{ classes: data.classes, students: data.students }}
            onSave={async (v, target) => {
              const t = parseTarget(target);
              if (!t) throw new Error("Choose a class or a student.");
              await createTask(t, v);
              retry();
            }}
          />
        )}
        <p className="text-xs text-zinc-500">
          Students see a task while they are linked to you (and, for a class task, in that class). You can have up to {TASK_LIMITS.activePerTeacher} active tasks
          ({activeTaskCount(data.tasks)} now).
        </p>
      </section>

      <section aria-labelledby="task-list" className="space-y-3">
        <h2 id="task-list" className="font-display text-lg font-bold">
          Active tasks <span className="text-sm font-normal text-zinc-500">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <p className="text-sm text-zinc-500">No active tasks.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {active.map((t) => (
              <TaskRow key={t.id} task={t} today={data.now} run={run} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="task-archived" className="space-y-3">
          <h2 id="task-archived" className="font-display text-lg font-bold">
            <button type="button" aria-expanded={showArchived} className="hover:underline underline-offset-4" onClick={() => setShowArchived((s) => !s)}>
              Archived tasks <span className="text-sm font-normal text-zinc-500">({archived.length})</span>
            </button>
          </h2>
          {showArchived && (
            <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
              {archived.map((t) => (
                <TaskRow key={t.id} task={t} today={data.now} run={run} />
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

/** Teacher page: assign tasks to a class or one linked student, follow who has done them, archive old ones. */
export function TeacherTasks() {
  return (
    <TeacherGate returnTo="/teacher/tasks">
      <div className="space-y-5">
        <h1 className="font-display text-3xl font-bold">Tasks</h1>
        <TasksBoard />
      </div>
    </TeacherGate>
  );
}
