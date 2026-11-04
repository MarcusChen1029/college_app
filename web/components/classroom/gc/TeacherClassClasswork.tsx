"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { StatusPill } from "@/components/StatusPill";
import { TaskForm } from "@/components/TeacherTasks";
import { errorText } from "@/components/TeacherText";
import { byTopic } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { isHttpUrl } from "@/lib/linkify";
import { emptyTask, parseTarget, targetValue, type TaskProgress } from "@/lib/tasks";
import { createTask } from "@/lib/tasks-api";
import { teacherWorkLabel, type TeacherWork } from "@/lib/teacher-class";
import { buttonClass } from "@/lib/ui";
import { shortDate } from "../ClassroomText";
import { LinkedText } from "../LinkedText";
import { useTaskProgress } from "./useTaskProgress";
import { WorkRow } from "./WorkRow";
import type { TeacherClassContext } from "./TeacherClassPage";

/**
 * The Classwork tab of a teacher's class page (spec 4.2): "+ Create task" (the Tasks page's form, given to this class, with a
 * Topic that suggests the class's topics), then the class's tasks grouped by topic (tasks without a topic first). A row
 * shows the due date and "N of M done"; opening it shows the instructions and each student's state: done (with the date),
 * their note and their link, or not done. The students' list is asked for when a row is opened and kept until the page's
 * data is next loaded (any write reloads it). An archived class can't be given tasks, so it has no Create task.
 */
export function TeacherClassClasswork({ ctx }: { ctx: TeacherClassContext }) {
  const t = useT();
  const locale = useLocale();
  const { cls, work, tasksFailed, today, now, busy, reload } = ctx;
  const progress = useTaskProgress(now);
  const [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => byTopic(work), [work]);

  /** Closes the Create task dialog and puts focus back on its button, which the unmounted dialog can't do. */
  function closeCreate() {
    setCreating(false);
    setTimeout(() => createButton.current?.focus(), 0);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {cls.archived ? (
        <p className="rounded-[10px] bg-neutral-bg px-4 py-3 text-sm text-ink">{t("classroom.tc.archivedNote")}</p>
      ) : (
        <div>
          <button ref={createButton} type="button" disabled={busy} className={buttonClass("primary", "sm")} onClick={() => setCreating(true)}>
            {t("classroom.tc.createTask")}
          </button>
        </div>
      )}

      {tasksFailed ? (
        <p role="alert" className="text-sm text-urgent">
          {t("common.tryAgain")}{" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
            {t("classroom.retry")}
          </button>
        </p>
      ) : work.length === 0 ? (
        <p className="text-[15px] text-neutral">{t(cls.archived ? "classroom.classwork.empty" : "classroom.tc.classworkEmpty")}</p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.topic ?? ""} className="space-y-1">
              {group.topic !== null && <h3 className="border-b border-neutral-line pb-2 font-display text-lg font-bold text-ink [overflow-wrap:anywhere]">{group.topic}</h3>}
              <ul>
                {group.items.map((task) => (
                  <li key={task.id}>
                    <WorkRow
                      item={task}
                      today={today}
                      expandable
                      dueText={teacherWorkLabel(t, task, today, locale)}
                      details={<TaskDetails task={task} entries={progress.entries} load={progress.load} retry={progress.retry} />}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {creating && (
        <Modal title={<h2 className="text-lg font-semibold">{t("classroom.tc.createTaskTitle")}</h2>} onClose={() => setCreating(false)} className="w-[min(40rem,calc(100vw-2rem))]">
          <TaskForm
            initial={emptyTask()}
            submitLabel={t("classroom.tc.createTaskTitle")}
            presetTarget={targetValue({ kind: "class", id: cls.id })}
            topicSource={work}
            onSave={async (v, target) => {
              const dest = parseTarget(target);
              if (!dest) throw new Error(t("teacher.tasks.chooseErr"));
              await createTask(dest, v);
              closeCreate();
              reload();
            }}
            onCancel={closeCreate}
          />
        </Modal>
      )}
    </div>
  );
}

/** What an opened task row shows: the instructions, then each assigned student's state. Mounted only while the row is open. */
function TaskDetails({
  task,
  entries,
  load,
  retry,
}: {
  task: TeacherWork;
  entries: ReturnType<typeof useTaskProgress>["entries"];
  load: (taskId: string) => void;
  retry: (taskId: string) => void;
}) {
  const t = useT();
  const entry = entries[task.id];
  useEffect(() => {
    load(task.id);
  }, [load, task.id]);

  return (
    <div className="space-y-4">
      {task.details ? (
        <p>
          <LinkedText text={task.details} />
        </p>
      ) : (
        <p className="text-neutral">{t("classroom.task.noDetails")}</p>
      )}

      <div className="space-y-2">
        <h4 className="text-[13px] font-semibold text-neutral">{t("classroom.tc.students")}</h4>
        {!entry ? (
          <div className="h-12 animate-pulse rounded-lg bg-neutral-bg" />
        ) : "error" in entry ? (
          <p role="alert" className="text-sm text-urgent">
            {errorText(t, entry.error)}{" "}
            <button type="button" className="font-semibold underline underline-offset-4" onClick={() => retry(task.id)}>
              {t("teacher.tryAgain")}
            </button>
          </p>
        ) : entry.rows.length === 0 ? (
          <p className="text-neutral">{t("teacher.tasks.noneAssigned")}</p>
        ) : (
          <ul className="divide-y divide-neutral-bg rounded-lg border border-neutral-line">
            {entry.rows.map((p) => (
              <StudentWork key={p.studentId} progress={p} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One student under a task: name, done (with the date) or not done, and the note and link they attached when marking it done. */
function StudentWork({ progress: p }: { progress: TaskProgress }) {
  const t = useT();
  const locale = useLocale();
  const doneAt = p.doneAt ? shortDate(p.doneAt, locale === "zh-TW" ? "zh-TW" : "en-US") : "";
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium [overflow-wrap:anywhere]">{p.displayName}</span>
        <StatusPill tone={p.done ? "done" : "neutral"}>{p.done ? (doneAt ? t("teacher.tasks.doneOn", { date: doneAt }) : t("classroom.due.done")) : t("teacher.notDone")}</StatusPill>
      </div>
      {(p.note || p.link) && (
        <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
          {p.note && (
            <>
              <dt className="font-semibold text-neutral">{t("classroom.tc.note")}</dt>
              <dd>
                <LinkedText text={p.note} />
              </dd>
            </>
          )}
          {p.link && (
            <>
              <dt className="font-semibold text-neutral">{t("classroom.tc.link")}</dt>
              <dd className="[overflow-wrap:anywhere]">
                {isHttpUrl(p.link) ? (
                  <a href={p.link} target="_blank" rel="noopener noreferrer nofollow" className="text-blue-700 underline underline-offset-2 hover:text-blue-900">
                    {p.link}
                  </a>
                ) : (
                  p.link
                )}
              </dd>
            </>
          )}
        </dl>
      )}
    </li>
  );
}
