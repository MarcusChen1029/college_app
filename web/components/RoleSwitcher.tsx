"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { SettingsRow } from "@/components/settings/SettingsRow";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { homePathFor, roleChangeMessage, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const btn = buttonClass("secondary", "sm");
const field = "mt-1.5 block h-10 w-full rounded-xl border border-zinc-300 bg-white px-3.5 text-base font-normal text-ink placeholder:text-zinc-500 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

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
    <SettingsRow
      headingId="role-heading"
      title={t("settings.role.title")}
      description={<p>{role === "student" ? t("settings.role.studentBody") : t("settings.role.teacherBody")}</p>}
    >
      {role === "student" ? (
        <>
          {!open ? (
            <button type="button" className={btn} onClick={() => setOpen(true)}>
              {t("settings.role.toTeacherOpen")}
            </button>
          ) : (
            <form onSubmit={toTeacher} className="max-w-md space-y-4">
              <label className="block text-sm font-semibold text-ink">
                {t("settings.role.yourName")}
                <input value={name} onChange={(e) => setName(e.target.value)} className={field} placeholder={t("settings.role.namePlaceholder")} />
              </label>
              <label className="block text-sm font-semibold text-ink">
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
        <p role="alert" className="mt-3 text-sm text-urgent">
          {error}
        </p>
      )}
    </SettingsRow>
  );
}
