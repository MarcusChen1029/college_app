"use client";

import { btn, type Run } from "@/components/TeacherClassCard";
import { ActionsMenu, type MenuAction } from "@/components/teacher/ActionsMenu";
import { tabHref } from "@/lib/class-tab";
import { themeFor } from "@/lib/class-theme";
import { useLocale, useT } from "@/lib/i18n/client";
import { archiveClass, type TeacherClass } from "@/lib/links-api";
import { nextDueTask, teacherClassPath, teacherDueLabel, type TeacherWork } from "@/lib/teacher-class";
import { ClassCard, type ClassCardDue } from "./ClassCard";

/**
 * One class on the teacher's Classes grid (spec 4.1): the shared class card with the class's color, name and school year,
 * "N students" where a student's card shows the teacher, the next class task that is due (with how many are done), and
 * icon links to the Stream and Classwork tabs. The "⋯" menu offers Customize and Archive; an archived class has Restore
 * in place of the menu. Opening the card leads to the class page, where the code, announcements and tasks are.
 *
 * `label` tells same-named classes apart (the caller adds the year or the code); `work` is this class's live tasks, or an
 * empty list when tasks could not be loaded. `onRemoved` runs after Archive took the card out of its list, so focus can
 * land on the next card.
 */
export function TeacherClassGridCard({
  cls,
  label,
  studentCount,
  work,
  tasksFailed = false,
  today,
  initial,
  busy,
  run,
  onCustomize,
  onRemoved,
}: {
  cls: TeacherClass;
  label: string;
  studentCount: number;
  work: TeacherWork[];
  /** The tasks could not be loaded: the card says so instead of "nothing due soon". */
  tasksFailed?: boolean;
  today: string;
  initial: string;
  busy: boolean;
  run: Run;
  onCustomize: () => void;
  onRemoved?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const path = teacherClassPath(cls.id);
  const classwork = tabHref(path, "classwork");

  const next = nextDueTask(work, today);
  const due: ClassCardDue[] = next
    ? [
        {
          title: next.title,
          label: [teacherDueLabel(t, next.dueOn, today, locale), next.totalCount > 0 ? t("teacher.tasks.progress", { done: next.doneCount, total: next.totalCount }) : ""].filter(Boolean).join(" · "),
          urgent: false,
          href: classwork,
        },
      ]
    : [];

  const actions: MenuAction[] = [
    { id: "customize", label: t("classroom.tc.customize"), onSelect: onCustomize },
    {
      id: "archive",
      label: t("teacher.classes.archive"),
      danger: true,
      onSelect: () => confirm(t("teacher.classes.archiveConfirm", { name: label })) && run(() => archiveClass(cls.id, true), onRemoved),
    },
  ];

  return (
    <ClassCard
      href={path}
      theme={themeFor(cls.id, cls.theme)}
      title={cls.name}
      subtitle={cls.schoolYear ?? undefined}
      who={t(studentCount === 1 ? "teacher.classes.memberCount.one" : "teacher.classes.memberCount.other", { n: studentCount })}
      avatar={initial}
      due={due}
      empty={t(tasksFailed ? "common.tryAgain" : "classroom.due.nothingSoon")}
      icons={[
        { label: t("classroom.card.stream"), href: tabHref(path, "stream"), icon: "stream" },
        { label: t("classroom.card.classwork"), href: classwork, icon: "classwork" },
      ]}
      menu={
        cls.archived ? (
          <button type="button" disabled={busy} className={btn} aria-label={t("teacher.classes.restoreAria", { name: cls.name })} onClick={() => run(() => archiveClass(cls.id, false))}>
            {t("teacher.classes.restore")}
          </button>
        ) : (
          <ActionsMenu label={t("teacher.menu.more", { name: label })} disabled={busy} actions={actions} />
        )
      }
    />
  );
}
