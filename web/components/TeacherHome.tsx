"use client";

import { useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/AccountPanel";
import { TeacherAttention } from "@/components/TeacherAttention";
import { SettingsButton, SettingsPanel, useSettingsOpen } from "@/components/SettingsPanel";
import { TeacherClasses } from "@/components/TeacherClasses";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

/** Teacher dashboard: greeting, classes and join codes, one-on-one students, and the account section. */
export function TeacherHome() {
  const student = useStudent();
  const [settingsOpen, setSettingsOpen] = useSettingsOpen();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  if (!student.auth) {
    return (
      <div className="space-y-3">
        <p className="text-zinc-600">Sign in to see your teacher dashboard.</p>
        <GoogleSignIn returnTo="/teacher" />
      </div>
    );
  }
  if (student.role !== "teacher") return <p className="text-zinc-500">This page is for teacher and counselor accounts.</p>;

  const tp = student.teacherProfile;
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold">Hello{tp ? `, ${tp.displayName}` : ""}</h1>
          {tp?.school && <p className="mt-1 text-zinc-500">{tp.school}</p>}
        </div>
        <SettingsButton open={settingsOpen} onToggle={() => setSettingsOpen((o) => !o)} />
      </div>
      <SettingsPanel open={settingsOpen} />
      <TeacherAttention />
      <TeacherClasses />
    </div>
  );
}
