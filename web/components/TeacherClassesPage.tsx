"use client";

import { TeacherClasses } from "@/components/TeacherClasses";
import { TeacherGate } from "@/components/TeacherGate";
import { useT } from "@/lib/i18n/client";

/** The teacher's classes, join codes and one-on-one students, on their own page. */
export function TeacherClassesPage() {
  const t = useT();
  return (
    <TeacherGate returnTo="/teacher/classes">
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">{t("teacher.classes.title")}</h1>
        <TeacherClasses />
      </div>
    </TeacherGate>
  );
}
