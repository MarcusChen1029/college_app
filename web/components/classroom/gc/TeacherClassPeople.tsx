"use client";

import Link from "next/link";
import { CodeBox } from "@/components/TeacherClassCard";
import { studentHref } from "@/components/TeacherRosterTable";
import { ActionsMenu } from "@/components/teacher/ActionsMenu";
import { initialOf } from "@/lib/classes-home";
import { useT } from "@/lib/i18n/client";
import { newCode, removeFromClass } from "@/lib/links-api";
import { useStudent } from "@/lib/student-store";
import { LABEL } from "@/lib/ui";
import { focusAfterRemoval } from "./focusAfterRemoval";
import type { TeacherClassContext } from "./TeacherClassPage";

const HEADING = "font-display text-xl font-bold text-ink";
const LIST_ID = "people-students";
const HEADING_ID = "people-students-heading";

function Avatar({ initial }: { initial: string }) {
  return (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-ink text-base font-bold text-white">
      {initial}
    </span>
  );
}

/**
 * The People tab of a teacher's class page (spec 4.2): the teacher (you), the students who are in this class only (never
 * another class's: the name leads to the student's detail page, and the "⋯" menu takes them out of this class after the
 * usual confirmation; they stay linked to you), and "Invite students" with the class code, Copy invite link and Show on
 * screen. After a removal focus moves to the next student's menu. An archived class has no live code to invite with.
 */
export function TeacherClassPeople({ ctx }: { ctx: TeacherClassContext }) {
  const t = useT();
  const student = useStudent();
  const { cls, students, now, busy, run } = ctx;
  const name = student.teacherProfile?.displayName ?? "";
  const school = student.teacherProfile?.school ?? null;

  return (
    <div className="max-w-3xl space-y-8">
      <section aria-labelledby="people-teachers-heading" className="space-y-3">
        <h2 id="people-teachers-heading" className={`border-b border-ink pb-2 ${HEADING}`}>
          {t("classroom.tc.teachers")}
        </h2>
        <div className="flex items-center gap-3 py-1">
          <Avatar initial={initialOf(name)} />
          <div className="min-w-0">
            <p className="font-semibold text-ink [overflow-wrap:anywhere]">
              {name || t("classroom.tc.you")}
              {name && <span className="ml-2 rounded-full bg-neutral-bg px-2 py-0.5 align-middle text-[13px] font-semibold text-neutral">{t("classroom.tc.you")}</span>}
            </p>
            {school && <p className="text-[13px] text-neutral [overflow-wrap:anywhere]">{school}</p>}
          </div>
        </div>
      </section>

      <section aria-labelledby={HEADING_ID} className="space-y-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-ink pb-2">
          <h2 id={HEADING_ID} tabIndex={-1} className={`${HEADING} focus:outline-none`}>
            {t("classroom.tc.students")}
          </h2>
          <span className="text-sm text-neutral">{t(students.length === 1 ? "teacher.classes.memberCount.one" : "teacher.classes.memberCount.other", { n: students.length })}</span>
        </div>
        {students.length === 0 ? (
          <p className="text-[15px] text-neutral">{t("classroom.tc.studentsEmpty")}</p>
        ) : (
          <ul id={LIST_ID} className="divide-y divide-neutral-bg">
            {students.map((s, i) => (
              <li key={s.studentId} className="flex items-center gap-3 py-2">
                <Avatar initial={initialOf(s.displayName)} />
                <div className="min-w-0 flex-1">
                  <Link href={studentHref(s.studentId)} className="font-semibold text-ink underline-offset-4 [overflow-wrap:anywhere] hover:underline">
                    {s.displayName}
                  </Link>
                  <p className="truncate text-[13px] text-neutral" title={s.email}>
                    {s.email}
                  </p>
                </div>
                <ActionsMenu
                  quiet
                  label={t("teacher.menu.more", { name: s.displayName })}
                  disabled={busy}
                  actions={[
                    {
                      id: "remove-from-class",
                      label: t("teacher.classes.removeFromNamed", { class: cls.name }),
                      onSelect: () =>
                        confirm(t("teacher.classes.removeFromConfirm", { student: s.displayName, class: cls.name })) &&
                        run(() => removeFromClass(cls.id, s.studentId), () => focusAfterRemoval(LIST_ID, i, HEADING_ID)),
                    },
                  ]}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="people-invite-heading" className="space-y-3 rounded-[10px] border border-neutral-line bg-white p-4">
        <h2 id="people-invite-heading" className={LABEL}>
          {t("classroom.tc.invite")}
        </h2>
        {cls.archived ? (
          <p className="text-sm text-neutral">{t("classroom.tc.inviteArchived")}</p>
        ) : (
          <CodeBox code={cls.code} expiresAt={cls.codeExpiresAt} now={now} busy={busy} turnOnLabel={t("teacher.classes.turnOn")} subject={cls.name} onNew={() => run(() => newCode("class", cls.id))} />
        )}
      </section>
    </div>
  );
}
