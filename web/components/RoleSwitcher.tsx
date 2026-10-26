"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { homePathFor, roleChangeMessage, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const btn = buttonClass("secondary", "sm");
const field = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2";

/** roleChangeMessage / validateTeacher (lib/roles.ts, English, tested) in the visitor's language; unknown messages pass through. */
function roleError(t: TFunction, english: string): string {
  if (english === "Enter your name.") return t("settings.role.enterName");
  if (english.startsWith("Leave your teachers and counselors first")) return t("settings.role.leaveTeachers");
  if (english.startsWith("Remove all your linked students first")) return t("settings.role.removeStudents");
  if (english === "Something went wrong. Please try again.") return t("common.tryAgain");
  return english;
}

/** Settings page control to switch between a student and a teacher/counselor account. Shown only to signed-in users with a role. */
export function RoleSwitcher() {
  const student = useStudent();
  const t = useT();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const role = student.role;
  if (!student.auth || (role !== "student" && role !== "teacher")) return null;

  async function switchTo(next: "student" | "teacher", teacher?: { displayName: string; school: string | null }) {
    setBusy(true);
    setError(null);
    const err = await student.changeRole(next, teacher);
    if (err) {
      setError(roleError(t, roleChangeMessage(err)));
      setBusy(false);
      return;
    }
    router.push(homePathFor(next));
  }

  function toTeacher(e: React.FormEvent) {
    e.preventDefault();
    const v = validateTeacher({ displayName: name, school });
    if (!v.ok) return setError(roleError(t, v.error));
    void switchTo("teacher", v.value);
  }

  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 p-5" aria-labelledby="role-heading">
      <h3 id="role-heading" className="font-display text-lg font-bold">
        {t("settings.role.title")}
      </h3>
      {role === "student" ? (
        <>
          <p className="text-sm text-zinc-600">{t("settings.role.studentBody")}</p>
          {!open ? (
            <button type="button" className={btn} onClick={() => setOpen(true)}>
              {t("settings.role.toTeacherOpen")}
            </button>
          ) : (
            <form onSubmit={toTeacher} className="space-y-3">
              <label className="block text-sm font-medium">
                {t("settings.role.yourName")}
                <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder={t("settings.role.namePlaceholder")} />
              </label>
              <label className="block text-sm font-medium">
                {t("settings.role.school")} <span className="font-normal text-zinc-500">{t("settings.role.optional")}</span>
                <input value={school} onChange={(e) => setSchool(e.target.value)} className={field} placeholder={t("settings.role.schoolPlaceholder")} />
              </label>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
                  {busy ? t("settings.role.switching") : t("settings.role.toTeacher")}
                </button>
                <button type="button" disabled={busy} className={btn} onClick={() => setOpen(false)}>
                  {t("common.cancel")}
                </button>
              </div>
            </form>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-zinc-600">{t("settings.role.teacherBody")}</p>
          <button
            type="button"
            disabled={busy}
            className={btn}
            onClick={() => confirm(t("settings.role.toStudentConfirm")) && void switchTo("student")}
          >
            {busy ? t("settings.role.switching") : t("settings.role.toStudent")}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
    </section>
  );
}
