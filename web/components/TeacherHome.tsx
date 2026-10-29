"use client";

import { useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { TeacherWeek } from "@/components/teacher/TeacherWeek";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

/** Teacher home: who needs you this week, from the roster flags and the next seven days of deadlines. */
export function TeacherHome() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  if (!student.auth) {
    return (
      <div className="space-y-3">
        <p className="text-zinc-600">{t("teacher.signInDashboard")}</p>
        <GoogleSignIn returnTo="/teacher" />
      </div>
    );
  }
  if (student.role !== "teacher") return <p className="text-zinc-500">{t("teacher.notTeacher")}</p>;

  const tp = student.teacherProfile;
  const hello = tp ? t("teacher.home.helloName", { name: tp.displayName }) : t("teacher.home.hello");
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-medium text-zinc-600">{tp?.school ? `${hello} · ${tp.school}` : hello}</p>
        <h1 className="mt-1 font-display text-2xl font-bold sm:text-3xl">{t("teacher.week.title")}</h1>
      </header>
      <TeacherWeek />
    </div>
  );
}
