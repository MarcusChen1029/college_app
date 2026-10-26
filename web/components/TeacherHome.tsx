"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { TeacherAttention } from "@/components/TeacherAttention";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

/** Teacher dashboard: greeting, classes and join codes, one-on-one students, and the account section. */
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
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">{tp ? t("teacher.home.helloName", { name: tp.displayName }) : t("teacher.home.hello")}</h1>
          {tp?.school && <p className="mt-1 text-zinc-500">{tp.school}</p>}
        </div>
      </div>
      <TeacherAttention />
      <p className="text-sm text-zinc-600">
        {t("teacher.home.managePre")}
        <Link href="/teacher/classes" className="font-semibold text-blue-700 underline underline-offset-4">
          {t("teacher.classes.title")}
        </Link>
        {t("teacher.home.managePost")}
      </p>
    </div>
  );
}
