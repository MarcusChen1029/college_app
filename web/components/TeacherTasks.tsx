"use client";

import { useCallback, useId, useMemo, useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { TeacherGate } from "@/components/TeacherGate";
import { errorText, progressLabel, targetText } from "@/components/TeacherText";
import { useLocale, useT } from "@/lib/i18n/client";
import { daysUntil } from "@/lib/format";
import { listStudents, loadTeacherOverview, type LinkedStudent, type TeacherClass } from "@/lib/links-api";
import {
  activeTaskCount,
  emptyTask,
  parseTarget,
  progressTone,
  sortTeacherTasks,
  targetValue,
  TASK_LIMITS,
  topicSuggestions,
  validateTask,
  type TaskInput,
  type TeacherTask,
} from "@/lib/tasks";
import { archiveTask, createTask, listMyTasks, taskProgress, updateTask } from "@/lib/tasks-api";
import { buttonClass } from "@/lib/ui";
import { errMsg, useLoad } from "@/lib/use-load";

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
const btn = buttonClass("ghost", "sm");
// Archive asks first and can be undone (Restore), so it is a quiet outline, but in the danger tone.
const archiveBtn =
  "inline-flex h-9 items-center justify-center rounded-full border border-urgent/40 bg-white px-4 text-sm font-semibold text-urgent transition-colors hover:border-urgent hover:bg-urgent-bg disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Title, details, due date and topic. With `targets` it also has the class / student picker (new tasks only).
 * `presetTarget` ("class:<id>" or "student:<id>", see targetValue) is the target to begin with and the one `onSave` gets when
 * there is no picker: a class page's Create task, or the edit form of a task that already has one. `topicSource` is the
 * teacher's tasks: the topics already on the chosen class (or student) are offered as suggestions while typing the topic.
 */
export function TaskForm({
  initial,
  submitLabel,
  targets,
  presetTarget,
  topicSource,
  onSave,
  onCancel,
}: {
  initial: TaskInput;
  submitLabel: string;
  targets?: { classes: TeacherClass[]; students: LinkedStudent[] };
  presetTarget?: string;
  topicSource?: Parameters<typeof topicSuggestions>[0];
  onSave: (v: TaskInput, target: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useT();
  const topicListId = useId();
  const [f, setF] = useState<TaskInput>(initial);
  const [target, setTarget] = useState(presetTarget ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (targets && !parseTarget(target)) return setError(t("teacher.tasks.chooseErr"));
    const r = validateTask(f);
    if (!r.ok) return setError(r.error);
    setError(null);
    setBusy(true);
    try {
      await onSave(r.value, target);
      if (!onCancel) {
        setF(emptyTask());
        setTarget(presetTarget ?? "");
      }
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const classes = targets?.classes.filter((c) => !c.archived) ?? [];
  const topics = useMemo(() => topicSuggestions(topicSource ?? [], parseTarget(target)), [topicSource, target]);
  // Laid out by the room it gets (a container query): one column in the side panel, two when editing a wide row.
  return (
    <div className="@container">
    <form onSubmit={submit} className="grid gap-3 @lg:grid-cols-2">
      {targets && (
        <label className="text-sm font-medium @lg:col-span-2">
          {t("teacher.tasks.assignTo")}
          <select className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">{t("teacher.tasks.choose")}</option>
            {classes.length > 0 && (
              <optgroup label={t("teacher.tasks.groupClasses")}>
                {classes.map((c) => (
                  <option key={c.id} value={targetValue({ kind: "class", id: c.id })}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {targets.students.length > 0 && (
              <optgroup label={t("teacher.tasks.groupStudent")}>
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
      <label className="text-sm font-medium @lg:col-span-2">
        {t("teacher.tasks.task")}
        <input className={field} value={f.title} maxLength={TASK_LIMITS.title} onChange={(e) => set("title", e.target.value)} placeholder={t("teacher.tasks.taskPlaceholder")} />
      </label>
      <label className="text-sm font-medium @lg:col-span-2">
        {t("teacher.tasks.details")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <textarea className={field} rows={2} value={f.details} maxLength={TASK_LIMITS.details} onChange={(e) => set("details", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        {t("teacher.tasks.due")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input type="date" className={field} value={f.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium">
        {t("teacher.tasks.topic")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input
          className={field}
          list={topicListId}
          value={f.topic ?? ""}
          maxLength={TASK_LIMITS.topic}
          autoComplete="off"
          placeholder={t("teacher.tasks.topicPlaceholder")}
          onChange={(e) => set("topic", e.target.value)}
        />
        <datalist id={topicListId}>
          {topics.map((topic) => (
            <option key={topic} value={topic} />
          ))}
        </datalist>
      </label>
      <div className="flex flex-wrap items-end gap-2 @lg:col-span-2 @lg:justify-end">
        {onCancel && (
          <button type="button" className={btn} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
        <button type="submit" className={buttonClass("primary", "sm")} disabled={busy}>
          {submitLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-urgent @lg:col-span-2">
          {errorText(t, error)}
        </p>
      )}
    </form>
    </div>
  );
}

/** Who has finished one task. Loaded when opened. */
function ProgressList({ taskId }: { taskId: string }) {
  const t = useT();
  const locale = useLocale();
  const load = useCallback(() => taskProgress(taskId), [taskId]);
  const { data, error, retry } = useLoad(load);
  if (!data) {
    return error ? (
      <p role="alert" className="text-sm text-urgent">
        {errorText(t, error)}{" "}
        <button type="button" className="underline" onClick={retry}>
          {t("teacher.tryAgain")}
        </button>
      </p>
    ) : (
      <div className="h-12 animate-pulse rounded-lg bg-zinc-100" />
    );
  }
  if (data.length === 0) return <p className="text-sm text-zinc-500">{t("teacher.tasks.noneAssigned")}</p>;
  return (
    <ul className="grid gap-1 text-sm sm:grid-cols-2">
      {data.map((p) => (
        <li key={p.studentId} className="flex items-center justify-between gap-2 rounded-md border border-zinc-100 px-3 py-1.5">
          <span className="[overflow-wrap:anywhere]">{p.displayName}</span>
          <StatusPill tone={p.done ? "done" : "neutral"}>
            {p.done && p.doneAt ? t("teacher.tasks.doneOn", { date: new Date(p.doneAt).toLocaleDateString(locale, { month: "short", day: "numeric" }) }) : t("teacher.notDone")}
          </StatusPill>
        </li>
      ))}
    </ul>
  );
}

function TaskRow({ task, tasks, today, run }: { task: TeacherTask; tasks: readonly TeacherTask[]; today: Date; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <li className="p-4">
        <TaskForm
          initial={{ title: task.title, details: task.details, dueOn: task.dueOn, topic: task.topic }}
          submitLabel={t("common.save")}
          presetTarget={task.classId ? targetValue({ kind: "class", id: task.classId }) : task.studentId ? targetValue({ kind: "student", id: task.studentId }) : undefined}
          topicSource={tasks}
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
            {targetText(t, task)}
            {task.classArchived && ` ${t("teacher.tasks.archivedClass")}`}
            {task.topic && ` · ${task.topic}`}
          </p>
          {task.details && <p className="mt-1 text-sm whitespace-pre-line text-zinc-600 [overflow-wrap:anywhere]">{task.details}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {task.dueOn && <DeadlineChip date={task.dueOn} days={daysUntil(task.dueOn, today)} done={progressTone(task) === "done"} doneLabel={t("teacher.tasks.allDone")} label={t("teacher.tasks.due")} />}
          <StatusPill tone={progressTone(task)}>{progressLabel(t, task)}</StatusPill>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? t("teacher.tasks.hideStudents") : t("teacher.tasks.whoDone")}
        </button>
        {!task.archived && (
          <button type="button" className={btn} aria-label={t("teacher.tasks.editAria", { title: task.title })} onClick={() => setEditing(true)}>
            {t("common.edit")}
          </button>
        )}
        <button
          type="button"
          className={task.archived ? btn : archiveBtn}
          aria-label={t(task.archived ? "teacher.tasks.restoreAria" : "teacher.tasks.archiveAria", { title: task.title })}
          onClick={() => {
            if (!task.archived && !confirm(t("teacher.tasks.archiveConfirm", { title: task.title }))) return;
            void run(() => archiveTask(task.id, !task.archived));
          }}
        >
          {task.archived ? t("teacher.classes.restore") : t("teacher.classes.archive")}
        </button>
      </div>
      {open && <ProgressList taskId={task.id} />}
    </li>
  );
}

function TasksBoard() {
  const t = useT();
  const load = useCallback(async () => {
    const [tasks, overview, students] = await Promise.all([listMyTasks(), loadTeacherOverview(), listStudents()]);
    return { tasks, classes: overview.classes, students, now: new Date() };
  }, []);
  const { data, error, retry } = useLoad(load);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // Phones: the form waits behind "+ Assign a task" so the tasks lead the screen; from lg it is always open beside them.
  const [formOpen, setFormOpen] = useState(false);

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
          {errorText(t, error)}
        </p>
        <button type="button" className={btn} onClick={retry}>
          {t("teacher.tryAgain")}
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

  // The tasks and who has done them on the left; assigning a new one in a column beside them (behind a button on phones).
  return (
    <div className="space-y-6">
      {actionError && (
        <p role="alert" className="text-sm text-urgent">
          {errorText(t, actionError)}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
      <div className="lg:sticky lg:top-24 lg:col-start-2 lg:row-start-1">
      <button
        type="button"
        aria-expanded={formOpen}
        aria-controls="task-add-card"
        onClick={() => setFormOpen((o) => !o)}
        className={`${buttonClass(formOpen ? "ghost" : "secondary", "sm")} lg:hidden`}
      >
        {formOpen ? t("teacher.tasks.assignClose") : t("teacher.tasks.assignOpen")}
      </button>
      <section
        id="task-add-card"
        aria-labelledby="task-add"
        className={`${formOpen ? "mt-3 block" : "hidden"} space-y-3 rounded-2xl border border-zinc-200 bg-white p-5 lg:mt-0 lg:block`}
      >
        <h2 id="task-add" className="font-display text-lg font-bold">
          {t("teacher.tasks.assignHeading")}
        </h2>
        {noTargets ? (
          <p className="text-sm text-zinc-500">{t("teacher.tasks.noTargets")}</p>
        ) : (
          <TaskForm
            initial={emptyTask()}
            submitLabel={t("teacher.tasks.assign")}
            targets={{ classes: data.classes, students: data.students }}
            topicSource={data.tasks}
            onSave={async (v, target) => {
              const dest = parseTarget(target);
              if (!dest) throw new Error(t("teacher.tasks.chooseErr"));
              await createTask(dest, v);
              retry();
            }}
          />
        )}
        <p className="text-[13px] text-zinc-600">
          {t("teacher.tasks.limitNote", { max: TASK_LIMITS.activePerTeacher, n: activeTaskCount(data.tasks) })}
        </p>
      </section>
      </div>

      <div className="space-y-6 lg:col-start-1 lg:row-start-1">
      <section aria-labelledby="task-list" className="space-y-3">
        <h2 id="task-list" className="font-display text-lg font-bold">
          {t("teacher.tasks.active")} <span className="text-sm font-normal text-zinc-500">({active.length})</span>
        </h2>
        {active.length === 0 ? (
          <p className="rounded-2xl bg-blue-50 px-6 py-8 text-center text-[15px] text-ink">{t("teacher.tasks.noActive")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
            {active.map((t) => (
              <TaskRow key={t.id} task={t} tasks={data.tasks} today={data.now} run={run} />
            ))}
          </ul>
        )}
      </section>

      {archived.length > 0 && (
        <section aria-labelledby="task-archived" className="space-y-3">
          <h2 id="task-archived" className="font-display text-lg font-bold">
            <button type="button" aria-expanded={showArchived} className="hover:underline underline-offset-4" onClick={() => setShowArchived((s) => !s)}>
              {t("teacher.tasks.archivedTasks")} <span className="text-sm font-normal text-zinc-500">({archived.length})</span>
            </button>
          </h2>
          {showArchived && (
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {archived.map((t) => (
                <TaskRow key={t.id} task={t} tasks={data.tasks} today={data.now} run={run} />
              ))}
            </ul>
          )}
        </section>
      )}
      </div>
      </div>
    </div>
  );
}

/** Teacher page: assign tasks to a class or one linked student, follow who has done them, archive old ones. */
export function TeacherTasks() {
  const t = useT();
  return (
    <TeacherGate returnTo="/teacher/tasks">
      <div className="space-y-5">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("teacher.tasks.title")}</h1>
        <TasksBoard />
      </div>
    </TeacherGate>
  );
}
