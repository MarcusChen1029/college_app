"use client";

import { useId, useState } from "react";
import { NAME_LIMITS } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { updateTeacherProfile } from "@/lib/links-api";
import { validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { classroomError } from "./ClassroomText";

/**
 * A teacher's display name and school (Settings, spec 5.3): the two fields students see when they join and on their
 * Counselors page. Save writes both through update_my_teacher_profile, then tells the account store so the header and the
 * Account area show the new values at once. The name is required; a blank school clears it. Teachers only.
 */
export function TeacherProfileForm() {
  const t = useT();
  const uid = useId();
  const student = useStudent();
  const saved = student.teacherProfile;
  const [name, setName] = useState(saved?.displayName ?? "");
  const [school, setSchool] = useState(saved?.school ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (student.role !== "teacher") return null;

  const unchanged = name.trim() === (saved?.displayName ?? "") && school.trim() === (saved?.school ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateTeacher({ displayName: name, school });
    if (!v.ok) {
      setError(v.error === "Enter your name." ? t("profile.welcome.enterName") : v.error);
      return;
    }
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      await updateTeacherProfile(v.value.displayName, v.value.school);
      student.setTeacherProfile(v.value);
      setName(v.value.displayName);
      setSchool(v.value.school ?? "");
      setDone(true);
    } catch (err) {
      setError(classroomError(t, err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="max-w-md space-y-4">
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div className="space-y-1">
          <label htmlFor={`${uid}-name`} className="block text-sm font-medium">
            {t("settings.name")}
          </label>
          <input
            id={`${uid}-name`}
            type="text"
            value={name}
            maxLength={NAME_LIMITS.teacherName}
            autoComplete="name"
            className={`${FIELD_CLASS} w-full`}
            onChange={(e) => {
              setName(e.target.value);
              setDone(false);
            }}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-school`} className="block text-sm font-medium">
            {t("settings.school")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
          </label>
          <input
            id={`${uid}-school`}
            type="text"
            value={school}
            maxLength={NAME_LIMITS.school}
            autoComplete="organization"
            className={`${FIELD_CLASS} w-full`}
            onChange={(e) => {
              setSchool(e.target.value);
              setDone(false);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={unchanged} className={buttonClass("primary", "sm")}>
            {busy ? t("common.saving") : t("common.save")}
          </button>
          <span role="status" className="text-sm text-zinc-600">
            {done ? t("classroom.profile.saved") : ""}
          </span>
        </div>
        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}
      </fieldset>
    </form>
  );
}
