"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Run } from "@/components/TeacherClassCard";
import { TeacherGate } from "@/components/TeacherGate";
import { ActionsMenu } from "@/components/teacher/ActionsMenu";
import { themeFor } from "@/lib/class-theme";
import { classFeedPosts, classWork, studentsIn, TEACHER_CLASSES_PATH, teacherClassPath, type TeacherWork } from "@/lib/teacher-class";
import { initialOf } from "@/lib/classes-home";
import type { TeacherPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { archiveClass, type LinkedStudent, type TeacherClass } from "@/lib/links-api";
import { localDate } from "@/lib/roster";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { ClassBanner } from "./ClassBanner";
import { ClassTabs, classPanelProps, useClassTab } from "./ClassTabs";
import { CustomizeClassDialog } from "./CustomizeClassDialog";
import { GateSkeleton } from "./StudentGate";
import { LoadFailed } from "./PageStates";
import { TeacherClassClasswork } from "./TeacherClassClasswork";
import { TeacherClassPeople } from "./TeacherClassPeople";
import { TeacherClassStream } from "./TeacherClassStream";
import { useRunWrite } from "./useRunWrite";
import { useTeacherClassroom } from "./useTeacherClassroom";

/** The tabs of the class page, in order. The first is the default; `?tab=` picks another (ClassTabs). */
export const TEACHER_CLASS_TABS = ["stream", "classwork", "people"] as const;

/**
 * Everything a tab of the class page can use, so Classwork and People need no loading of their own. All of it belongs to
 * this class and is already loaded.
 */
export type TeacherClassContext = {
  cls: TeacherClass;
  /** The class's live tasks (not archived) as classwork items, newest data from the last load. Empty when the tasks could not be loaded (`tasksFailed`). */
  work: TeacherWork[];
  /** The tasks could not be loaded: a tab should say so rather than claim there is no classwork. */
  tasksFailed: boolean;
  /** The students in this class. */
  students: LinkedStudent[];
  /** The teacher's local date, `YYYY-MM-DD`. */
  today: string;
  /** This class page's address (`/teacher/classes/<id>`), for links into its tabs (`tabHref(path, "classwork")`). */
  path: string;
  /** Page load time in milliseconds. */
  now: number;
  /** A write is running: disable your buttons. */
  busy: boolean;
  /** Does a write, then reloads the page's data and shows a failure above the tabs. */
  run: Run;
  /** Reloads the page's data. */
  reload: () => void;
};

/**
 * A class of the teacher (`/teacher/classes/<classId>`, spec 4.2): the colored banner with Customize and a menu (Archive,
 * or Restore for an archived class), the Stream / Classwork / People tabs, and the tab chosen by `?tab=`. The tabs are
 * TeacherClassStream, TeacherClassClasswork and TeacherClassPeople (the last two are built from TeacherClassContext).
 * A class that is not the teacher's gets an "isn't available" page. The page must sit under a <Suspense> (the tabs read
 * the address).
 */
export function TeacherClassPage({ classId }: { classId: string }) {
  return (
    <TeacherGate returnTo={teacherClassPath(classId)}>
      <ClassPage classId={classId} />
    </TeacherGate>
  );
}

function ClassPage({ classId }: { classId: string }) {
  const t = useT();
  const student = useStudent();
  const data = useTeacherClassroom();
  const { overview, students, posts, tasks, reload } = data;
  const path = teacherClassPath(classId);
  const tab = useClassTab(TEACHER_CLASS_TABS);
  const [today] = useState(() => localDate(new Date()));
  const { busy, error, run } = useRunWrite(reload);
  const [customizing, setCustomizing] = useState(false);

  const cls = overview?.classes.find((c) => c.id === classId) ?? null;
  const work = useMemo(() => (tasks ? classWork(tasks, classId) : []), [tasks, classId]);
  const feed = useMemo<TeacherPost[] | null>(() => (posts ? classFeedPosts(posts, classId) : null), [posts, classId]);
  const members = useMemo(() => studentsIn(students, classId), [students, classId]);

  if (!data.ready) return data.error ? <LoadFailed error={data.error} onRetry={reload} /> : <GateSkeleton label={t("classroom.compose.loadingClasses")} />;
  if (!cls) return <NotFound />;

  const tabs = [
    { id: "stream", label: t("classroom.card.stream") },
    { id: "classwork", label: t("classroom.card.classwork") },
    { id: "people", label: t("classroom.class.people") },
  ];
  const ctx: TeacherClassContext = { cls, work, tasksFailed: tasks === null, students: members, today, path, now: data.loadedAt, busy, run, reload };
  const menu = cls.archived
    ? [{ id: "restore", label: t("teacher.classes.restore"), onSelect: () => run(() => archiveClass(cls.id, false)) }]
    : [
        {
          id: "archive",
          label: t("teacher.classes.archive"),
          danger: true,
          onSelect: () => confirm(t("teacher.classes.archiveConfirm", { name: cls.name })) && run(() => archiveClass(cls.id, true)),
        },
      ];

  return (
    <div className="space-y-5">
      <Link href={TEACHER_CLASSES_PATH} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">
        <span aria-hidden="true">←</span>
        {t("classroom.page.title")}
      </Link>

      <ClassBanner
        theme={themeFor(cls.id, cls.theme)}
        size="page"
        title={cls.name}
        subtitle={cls.schoolYear ?? undefined}
        actions={
          <>
            <button type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => setCustomizing(true)}>
              {t("classroom.tc.customize")}
            </button>
            <ActionsMenu label={t("teacher.menu.more", { name: cls.name })} disabled={busy} actions={menu} />
          </>
        }
      />

      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      {data.error && (
        <p role="alert" className="text-sm text-urgent">
          {data.error}{" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
            {t("classroom.retry")}
          </button>
        </p>
      )}

      <div>
        <ClassTabs tabs={tabs} />
        <div {...classPanelProps(tab)} className="pt-5">
          {tab === "stream" && (
            <TeacherClassStream
              cls={cls}
              posts={feed}
              work={work}
              today={today}
              now={data.loadedAt}
              initial={initialOf(student.teacherProfile?.displayName ?? "")}
              path={path}
              busy={busy}
              run={run}
              reload={reload}
            />
          )}
          {tab === "classwork" && <TeacherClassClasswork ctx={ctx} />}
          {tab === "people" && <TeacherClassPeople ctx={ctx} />}
        </div>
      </div>

      {customizing && (
        <CustomizeClassDialog
          key={cls.id}
          cls={cls}
          onSaved={() => {
            setCustomizing(false);
            reload();
          }}
          onChanged={reload}
          onCancel={() => setCustomizing(false)}
        />
      )}
    </div>
  );
}

function NotFound() {
  const t = useT();
  return (
    <div className="max-w-xl space-y-3">
      <h1 className="font-display text-2xl font-bold text-ink">{t("classroom.class.unavailable")}</h1>
      <p className="text-base text-ink">{t("classroom.tc.notFoundBody")}</p>
      <Link href={TEACHER_CLASSES_PATH} className={buttonClass("secondary", "sm")}>
        {t("classroom.back.classes")}
      </Link>
    </div>
  );
}
