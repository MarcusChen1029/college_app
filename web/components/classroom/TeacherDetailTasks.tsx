"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { errorText } from "@/components/TeacherText";
import { anchorKey, focusAttr } from "@/lib/anchors";
import { studentTasksForTeacher } from "@/lib/classroom-api";
import type { TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { daysUntil } from "@/lib/format";
import { emptyTask, sortStudentTasks, TASK_LIMITS, validateTask, type TaskInput, type TeacherStudentTask } from "@/lib/tasks";
import { archiveTask, createTask, updateTask } from "@/lib/tasks-api";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { AnchorChip } from "./AnchorChip";
import { savedLabel, type AnchorOption } from "./anchorOptions";
import { classroomError, TEXTAREA_CLASS } from "./ClassroomText";
import { focusField } from "./useFocusTarget";

const NO_ITEM = "";

/** A task error in the reader's language: the task validators' and RPCs' sentences first, then the classroom ones. */
function taskError(t: TFunction, e: unknown): string {
  const raw = typeof e === "string" ? e : e instanceof Error ? e.message : "";
  const known = errorText(t, raw);
  return known !== raw ? known : classroomError(t, e);
}

/**
 * Title, details, due date and (new tasks only) the item the task is about. A task keeps its item for life, so editing
 * shows the item instead of a picker. `about` is the picker's starting choice, an anchorKey or "" for no item.
 * `titleRef` reaches the title field (the page focuses it when a preset opens the form).
 */
function TaskForm({
  studentName,
  initial,
  options,
  about,
  titleRef,
  submitLabel,
  onSave,
  onCancel,
}: {
  studentName: string;
  initial: TaskInput;
  /** The items to choose from; undefined when the task already exists (its item can't change). */
  options?: AnchorOption[];
  about?: string;
  titleRef?: React.Ref<HTMLInputElement>;
  submitLabel: string;
  onSave: (v: TaskInput, item: AnchorOption | null) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useT();
  const uid = useId();
  const [f, setF] = useState<TaskInput>(initial);
  const [pick, setPick] = useState(about ?? NO_ITEM);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setF((cur) => ({ ...cur, [k]: v }));
  // "General" is for conversations; a task is about one item or nothing.
  const items = (options ?? []).filter((o) => o.anchor.kind !== "general");
  const chosen = items.find((o) => anchorKey(o.anchor) === pick) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateTask(f);
    if (!v.ok) {
      setError(taskError(t, v.error));
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSave(v.value, chosen);
    } catch (err) {
      setError(taskError(t, err));
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
      <fieldset disabled={busy} className="min-w-0 space-y-3">
        <div className="space-y-1">
          <label htmlFor={`${uid}-title`} className="block text-sm font-medium">
            {t("teacher.tasks.task")}
          </label>
          <input
            ref={titleRef}
            id={`${uid}-title`}
            className={`${FIELD_CLASS} w-full`}
            value={f.title}
            maxLength={TASK_LIMITS.title}
            autoComplete="off"
            placeholder={t("teacher.tasks.taskPlaceholder")}
            onChange={(e) => set("title", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-details`} className="block text-sm font-medium">
            {t("teacher.tasks.details")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
          </label>
          <textarea id={`${uid}-details`} className={TEXTAREA_CLASS} rows={3} value={f.details} maxLength={TASK_LIMITS.details} onChange={(e) => set("details", e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor={`${uid}-due`} className="block text-sm font-medium">
              {t("teacher.tasks.due")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
            </label>
            <input id={`${uid}-due`} type="date" className={`${FIELD_CLASS} w-full`} value={f.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value || null)} />
          </div>
          {options && (
            <div className="space-y-1">
              <label htmlFor={`${uid}-about`} className="block text-sm font-medium">
                {t("classroom.dt.about")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
              </label>
              <select id={`${uid}-about`} className={`${FIELD_CLASS} w-full`} value={chosen ? pick : NO_ITEM} onChange={(e) => setPick(e.target.value)}>
                <option value={NO_ITEM}>{t("classroom.dt.noItem")}</option>
                {items.map((o) => (
                  <option key={anchorKey(o.anchor)} value={anchorKey(o.anchor)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <p className="text-[13px] text-zinc-600">{t("classroom.dt.privateHelp", { name: studentName })}</p>
        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" className={buttonClass("quiet", "sm")} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" className={buttonClass("primary", "sm")}>
            {busy ? t("common.saving") : submitLabel}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

/** One task's state for this student: "Done Nov 2", or "Not done". */
function DonePill({ task }: { task: TeacherStudentTask }) {
  const t = useT();
  const locale = useLocale();
  return (
    <StatusPill tone={task.done ? "done" : "neutral"}>
      {task.done && task.doneAt ? t("teacher.tasks.doneOn", { date: new Date(task.doneAt).toLocaleDateString(locale, { month: "short", day: "numeric" }) }) : task.done ? t("teacher.done") : t("teacher.notDone")}
    </StatusPill>
  );
}

/** What every task row shows: the title, what it is about, the details, the due date while it is open, and whether the student did it. */
function TaskBody({ task, studentId, now, children }: { task: TeacherStudentTask; studentId: string; now: Date; children?: React.ReactNode }) {
  const t = useT();
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 space-y-1">
          <p className="font-medium [overflow-wrap:anywhere]">{task.title}</p>
          {children}
          {task.about && <AnchorChip info={task.about} role="teacher" studentId={studentId} />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {task.dueOn && !task.done && <DeadlineChip date={task.dueOn} days={daysUntil(task.dueOn, now)} done={false} label={t("teacher.tasks.due")} />}
          <DonePill task={task} />
        </div>
      </div>
      {task.details && <p className="whitespace-pre-line text-sm text-zinc-600 [overflow-wrap:anywhere]">{task.details}</p>}
    </>
  );
}

type Form = { mode: "new"; about: string } | { mode: "edit"; id: string } | null;

/**
 * The Tasks tab of one student's page (spec 5.2): "Private tasks for <student>" (create, edit and archive, each with an
 * optional due date and item; only the student sees them), then the class tasks that reach this student with done / not
 * done. Archived tasks are on the Tasks page (Restore). `options` are the items a task can be about
 * (teacherAnchorOptions). `preset` opens the new-task form on that item, once (scrolled into view, its title field
 * focused); `onPresetUsed` then lets the page forget it.
 * `onChanged` runs after a task was created, edited or archived, so the page can refresh the task markers on its items.
 */
export function TeacherDetailTasks({
  studentId,
  studentName,
  options,
  preset,
  onPresetUsed,
  onChanged,
}: {
  studentId: string;
  studentName: string;
  options: AnchorOption[];
  preset?: AnchorOption | null;
  onPresetUsed?: () => void;
  onChanged?: () => void;
}) {
  const t = useT();
  const uid = useId();
  const [tasks, setTasks] = useState<TeacherStudentTask[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Form>(null);
  const [usedPreset, setUsedPreset] = useState<AnchorOption | null>(null);
  const [focusAsk, setFocusAsk] = useState(0); // goes up each time a preset should bring the new-task form into view
  const newTitle = useRef<HTMLInputElement>(null);
  const [now] = useState(() => new Date());

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  // A change of ours: reload the list, and tell the page (its markers count these tasks too).
  const changed = useCallback(() => {
    reload();
    onChanged?.();
  }, [reload, onChanged]);

  // The list stays on screen while it reloads, so an open form and its typing survive every change.
  useEffect(() => {
    let live = true;
    studentTasksForTeacher(studentId).then(
      (list) => {
        if (!live) return;
        setTasks(list);
        setLoadError(null);
      },
      (e) => {
        if (live) setLoadError(taskError(t, e));
      },
    );
    return () => {
      live = false;
    };
  }, [studentId, nonce, t]);

  // A preset opens the new-task form on that item. The form doesn't need the list, so it opens at once.
  if (preset && preset !== usedPreset) {
    setUsedPreset(preset);
    setForm({ mode: "new", about: anchorKey(preset.anchor) });
    setFocusAsk((n) => n + 1);
  } else if (!preset && usedPreset) {
    setUsedPreset(null); // the page has forgotten the request: the same item asked for again is a new request
  }
  useEffect(() => {
    if (preset && preset === usedPreset) onPresetUsed?.();
  }, [preset, usedPreset, onPresetUsed]);

  // The pre-filled form into view, its title field focused, once the tab is shown.
  useEffect(() => {
    if (focusAsk === 0) return;
    return focusField(() => newTitle.current);
  }, [focusAsk]);

  const { privateTasks, classTasks } = useMemo(() => {
    const sorted = sortStudentTasks(tasks ?? []);
    return { privateTasks: sorted.filter((k) => k.classId === null), classTasks: sorted.filter((k) => k.classId !== null) };
  }, [tasks]);

  async function archive(task: TeacherStudentTask) {
    if (!confirm(t("teacher.tasks.archiveConfirm", { title: task.title }))) return;
    setBusy(true);
    setActionError(null);
    try {
      await archiveTask(task.id, true);
      changed();
    } catch (e) {
      setActionError(taskError(t, e));
    } finally {
      setBusy(false);
    }
  }

  const newForm = form?.mode === "new" && (
    <TaskForm
      key={form.about || "new"}
      studentName={studentName}
      initial={emptyTask()}
      options={options}
      about={form.about}
      titleRef={newTitle}
      submitLabel={t("classroom.dt.create")}
      onSave={async (v, item) => {
        await createTask({ kind: "student", id: studentId }, v, item ? { anchor: item.anchor, label: savedLabel(item.label) ?? "" } : undefined);
        setForm(null);
        changed();
      }}
      onCancel={() => setForm(null)}
    />
  );

  return (
    <div className="space-y-8">
      <section className="space-y-3" aria-labelledby={`${uid}-private`}>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div>
            <h2 id={`${uid}-private`} className="font-display text-xl font-bold [overflow-wrap:anywhere]">
              {t("classroom.dt.privateTitle", { name: studentName })}
            </h2>
            <p className="text-sm text-zinc-600">{t("classroom.dt.privateHelp", { name: studentName })}</p>
          </div>
          {form?.mode !== "new" && (
            <button type="button" className={buttonClass("primary", "sm")} onClick={() => setForm({ mode: "new", about: NO_ITEM })}>
              {t("classroom.dt.new")}
            </button>
          )}
        </div>

        {newForm}
        {actionError && (
          <p role="alert" className="text-sm text-urgent">
            {actionError}
          </p>
        )}

        {tasks === null ? (
          loadError ? (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-urgent">
                {loadError}
              </p>
              <button type="button" className={buttonClass("secondary", "sm")} onClick={reload}>
                {t("classroom.retry")}
              </button>
            </div>
          ) : (
            <div role="status" aria-busy="true" className="h-32 animate-pulse rounded-2xl bg-zinc-100">
              <span className="sr-only">{t("classroom.dt.loading")}</span>
            </div>
          )
        ) : (
          <>
            {loadError && (
              <p role="alert" className="text-sm text-urgent">
                {loadError}{" "}
                <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
                  {t("classroom.retry")}
                </button>
              </p>
            )}
            {privateTasks.length === 0 ? (
              <p className="rounded-2xl bg-zinc-50 p-5 text-[15px] text-zinc-700">{t("classroom.dt.empty", { name: studentName })}</p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
                {privateTasks.map((task) =>
                  form?.mode === "edit" && form.id === task.id ? (
                    <li key={task.id} data-focus={focusAttr({ kind: "task", ref: task.id })} className="p-4">
                      <TaskForm
                        studentName={studentName}
                        initial={{ title: task.title, details: task.details ?? "", dueOn: task.dueOn, topic: task.topic }}
                        submitLabel={t("common.save")}
                        onSave={async (v) => {
                          await updateTask(task.id, v);
                          setForm(null);
                          changed();
                        }}
                        onCancel={() => setForm(null)}
                      />
                    </li>
                  ) : (
                    <li key={task.id} data-focus={focusAttr({ kind: "task", ref: task.id })} className="space-y-2 p-4">
                      <TaskBody task={task} studentId={studentId} now={now} />
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          className={buttonClass("ghost", "sm")}
                          aria-label={t("teacher.tasks.editAria", { title: task.title })}
                          onClick={() => setForm({ mode: "edit", id: task.id })}
                        >
                          {t("common.edit")}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          className={buttonClass("danger", "sm")}
                          aria-label={t("teacher.tasks.archiveAria", { title: task.title })}
                          onClick={() => void archive(task)}
                        >
                          {t("teacher.classes.archive")}
                        </button>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </>
        )}
      </section>

      {tasks !== null && (
        <section className="space-y-3" aria-labelledby={`${uid}-class`}>
          <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
            <div>
              <h2 id={`${uid}-class`} className="font-display text-xl font-bold [overflow-wrap:anywhere]">
                {t("classroom.dt.classTitle", { name: studentName })}
              </h2>
              <p className="text-sm text-zinc-600">{t("classroom.dt.classHelp", { name: studentName })}</p>
            </div>
            <Link href="/teacher/tasks" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
              {t("classroom.dt.openTasks")}
            </Link>
          </div>
          {classTasks.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 p-5 text-[15px] text-zinc-700">{t("classroom.dt.classEmpty", { name: studentName })}</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {classTasks.map((task) => (
                <li key={task.id} data-focus={focusAttr({ kind: "task", ref: task.id })} className="space-y-2 p-4">
                  <TaskBody task={task} studentId={studentId} now={now}>
                    <p className="text-sm text-zinc-600 [overflow-wrap:anywhere]">{task.className ? t("teacher.tasks.targetClass", { name: task.className }) : t("teacher.tasks.targetClassWord")}</p>
                  </TaskBody>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
