"use client";

import { useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

/** Renders its children only for a signed-in teacher account; otherwise a skeleton, sign-in prompt or short notice. */
export function TeacherGate({ children, returnTo }: { children: React.ReactNode; returnTo: string }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;
  if (!student.auth) {
    return (
      <div className="space-y-3">
        <p className="text-zinc-600">{t("teacher.signInStudents")}</p>
        <GoogleSignIn returnTo={returnTo} />
      </div>
    );
  }
  if (student.role !== "teacher") return <p className="text-zinc-500">{t("teacher.notTeacher")}</p>;
  return <>{children}</>;
}
