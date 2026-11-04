"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { assignedCount, TODO_GROUPS, TODO_TABS } from "@/lib/class-page";
import { taskPath, TODO_PATH } from "@/lib/classes-home";
import { todoBuckets, type TodoGroup } from "@/lib/classwork";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { localDate } from "@/lib/roster";
import type { StudentTask } from "@/lib/tasks";
import { PAGE_TITLE } from "@/lib/ui";
import { ClassTabs, classPanelProps, useClassTab } from "./ClassTabs";
import { LoadFailed, PageProblem } from "./PageStates";
import { GateSkeleton, StudentGate } from "./StudentGate";
import { useStudentClassroom } from "./useStudentClassroom";
import { WorkRow } from "./WorkRow";

const GROUP_LABEL: Record<TodoGroup, MessageKey> = {
  this_week: "classroom.todo.group.this_week",
  next_week: "classroom.todo.group.next_week",
  later: "classroom.todo.group.later",
  no_date: "classroom.todo.group.no_date",
};

/**
 * The student's To-do (`/counselor/todo`, spec 3.5): every task from every class and teacher in one list, in three tabs.
 * Assigned (open, due today or later, or undated) is grouped This week / Next week / Later / No due date; Missing (open and
 * past due) is one list with the latest due first; Done is newest first. A row names its class or "1-on-1 with <teacher>"
 * and opens the task page. The tab lives in the address (`?tab=`).
 */
export function StudentTodo() {
  return (
    <StudentGate returnTo={TODO_PATH}>
      <Todo />
    </StudentGate>
  );
}

function TodoRows({ tasks, today }: { tasks: readonly StudentTask[]; today: string }) {
  const t = useT();
  return (
    <ul>
      {tasks.map((task) => {
        const where = task.classId ? task.className : t("classroom.oneOnOne.title", { name: task.teacherName });
        return (
          <li key={task.id}>
            <WorkRow item={{ ...task, classLabel: where ?? undefined }} today={today} href={taskPath(task.id)} />
          </li>
        );
      })}
    </ul>
  );
}

function Todo() {
  const t = useT();
  const { ready, error, tasks, reload } = useStudentClassroom();
  const [today] = useState(() => localDate(new Date()));
  const tab = useClassTab(TODO_TABS);
  const buckets = useMemo(() => todoBuckets(tasks, today), [tasks, today]);

  if (!ready) return error ? <LoadFailed error={error} onRetry={reload} /> : <GateSkeleton label={t("classroom.page.loading")} />;

  const missing = buckets.missing.length;
  const tabs = [
    { id: "assigned", label: t("classroom.todo.tab.assigned") },
    { id: "missing", label: missing > 0 ? t("classroom.todo.tab.missingCount", { n: missing }) : t("classroom.todo.tab.missing") },
    { id: "done", label: t("classroom.todo.tab.done") },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <Link href="/counselor" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">
          <span aria-hidden="true">←</span>
          {t("classroom.page.title")}
        </Link>
        <h1 className={PAGE_TITLE}>{t("classroom.classes.todo")}</h1>
      </div>

      <PageProblem actionError={null} loadError={error} onRetry={reload} />

      <div className="max-w-3xl">
        <ClassTabs tabs={tabs} label={t("classroom.todo.tabsLabel")} />
        <div {...classPanelProps(tab)} className="pt-4">
          {tab === "assigned" &&
            (assignedCount(buckets.assigned) === 0 ? (
              <p className="text-[15px] text-neutral">{t("classroom.todo.empty.assigned")}</p>
            ) : (
              <div className="space-y-5">
                {TODO_GROUPS.filter((g) => buckets.assigned[g].length > 0).map((g) => (
                  <section key={g} aria-labelledby={`todo-group-${g}`}>
                    <h2 id={`todo-group-${g}`} className="flex items-baseline justify-between px-3 pb-1 text-[13px] font-bold text-neutral">
                      <span>{t(GROUP_LABEL[g])}</span>
                      <span>{buckets.assigned[g].length}</span>
                    </h2>
                    <TodoRows tasks={buckets.assigned[g]} today={today} />
                  </section>
                ))}
              </div>
            ))}
          {tab === "missing" && (missing === 0 ? <p className="text-[15px] text-neutral">{t("classroom.todo.empty.missing")}</p> : <TodoRows tasks={buckets.missing} today={today} />)}
          {tab === "done" && (buckets.done.length === 0 ? <p className="text-[15px] text-neutral">{t("classroom.todo.empty.done")}</p> : <TodoRows tasks={buckets.done} today={today} />)}
        </div>
      </div>
    </div>
  );
}
