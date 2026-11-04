"use client";

import Link from "next/link";
import { useState } from "react";
import { classPath, oneOnOnePath, taskPath } from "@/lib/classes-home";
import { findTask, taskBackTarget } from "@/lib/class-page";
import { dueState } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { localDate } from "@/lib/roster";
import { AnchorChip } from "../AnchorChip";
import { dueLabel, shortDate } from "../ClassroomText";
import { LinkedText } from "../LinkedText";
import { CheckIcon, ClipboardIcon } from "./gcIcons";
import { LoadFailed, NotAvailable, PageProblem } from "./PageStates";
import { GateSkeleton, StudentGate } from "./StudentGate";
import { PrivateComments } from "./PrivateComments";
import { useStudentClassroom } from "./useStudentClassroom";
import { YourWork } from "./YourWork";

/**
 * One task (`/counselor/task/<taskId>`, spec 3.4): the instructions on the left (who gave it, when, when it is due, the
 * item it is about, and which class it is for), and on the right Your work (mark it done with a note and a link) and the
 * private comments with its teacher. A task the student does not have gets the "isn't available" page.
 */
export function StudentTaskPage({ taskId }: { taskId: string }) {
  return (
    <StudentGate returnTo={taskPath(taskId)}>
      <TaskPage taskId={taskId} />
    </StudentGate>
  );
}

function TaskPage({ taskId }: { taskId: string }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const { ready, error, tasks, conversations, reload } = useStudentClassroom();
  const [today] = useState(() => localDate(new Date()));

  if (!ready) return error ? <LoadFailed error={error} onRetry={reload} /> : <GateSkeleton label={t("classroom.page.loading")} />;

  const task = findTask(tasks, taskId);
  if (!task) return <NotAvailable title={t("classroom.task.unavailable")} body={t("classroom.task.unavailableBody")} />;

  const state = dueState(task, today);
  const done = state.kind === "done";
  const back = taskBackTarget(task);
  const backHref = back.kind === "class" ? classPath(back.id) : oneOnOnePath(back.id);
  const backName = back.kind === "class" ? (task.className ?? t("classroom.page.title")) : t("classroom.oneOnOne.title", { name: task.teacherName });
  const posted = shortDate(task.createdAt, tag);

  return (
    <div className="space-y-5">
      <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">
        <span aria-hidden="true">←</span>
        <span className="[overflow-wrap:anywhere]">{t("classroom.back.to", { name: backName })}</span>
      </Link>

      <PageProblem actionError={null} loadError={error} onRetry={reload} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <article className="min-w-0">
          <header className="flex items-start gap-3">
            <span aria-hidden="true" className={`grid size-10 shrink-0 place-items-center rounded-full ${done ? "bg-mint text-ink" : "bg-ink text-white"}`}>
              {done ? <CheckIcon className="size-5" /> : <ClipboardIcon className="size-5" />}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-ink [overflow-wrap:anywhere] sm:text-[1.75rem]">{task.title}</h1>
              <p className="mt-1 text-[13px] text-neutral [overflow-wrap:anywhere]">
                {task.teacherName}
                {posted ? ` · ${t("classroom.task.posted", { date: posted })}` : ""}
                {" · "}
                <span className={`font-semibold ${state.kind === "missing" ? "text-urgent" : "text-ink"}`}>{dueLabel(t, state, locale, today)}</span>
              </p>
            </div>
          </header>

          <div className="my-4 border-t border-ink" />

          {task.details ? (
            <div className="text-[15px] leading-relaxed text-ink [overflow-wrap:anywhere]">
              <LinkedText text={task.details} />
            </div>
          ) : (
            <p className="text-[15px] text-neutral">{t("classroom.task.noDetails")}</p>
          )}

          {task.about && (
            <div className="mt-4">
              <AnchorChip info={task.about} role="student" />
            </div>
          )}

          <p className="mt-4 text-[13px] text-neutral [overflow-wrap:anywhere]">{task.classId ? (task.className ?? "") : t("classroom.task.onlyYou")}</p>
        </article>

        <div className="min-w-0 space-y-4">
          <YourWork key={task.id} task={task} onChanged={reload} />
          <PrivateComments
            key={task.id}
            teacherId={task.teacherId}
            teacherName={task.teacherName}
            taskId={task.id}
            taskTitle={task.title}
            conversations={conversations}
            onChanged={reload}
          />
        </div>
      </div>
    </div>
  );
}
