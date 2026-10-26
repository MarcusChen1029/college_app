"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { useT } from "@/lib/i18n/client";
import { homePathFor, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const choice = "rounded-2xl border-2 border-zinc-200 p-5 text-left hover:border-blue-500 hover:bg-blue-50 disabled:opacity-60";

/** First sign-in: pick student or teacher/counselor (saved once through the set_my_role RPC). */
export function WelcomeForm() {
  const t = useT();
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [asTeacher, setAsTeacher] = useState(false);
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  if (!student.auth) {
    return (
      <div className="space-y-3">
        <p className="text-zinc-600">{t("profile.welcome.signInPrompt")}</p>
        <GoogleSignIn returnTo="/welcome" />
      </div>
    );
  }

  // Role not loaded yet, or already chosen (RoleGate is sending them on).
  if (student.role !== null) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  async function save(role: "student" | "teacher", teacher?: { displayName: string; school: string | null }) {
    setBusy(true);
    setError(null);
    const err = await student.setRole(role, teacher);
    if (err) {
      setError(err);
      setBusy(false);
      return;
    }
    router.push(homePathFor(role));
  }

  function submitTeacher(e: React.FormEvent) {
    e.preventDefault();
    const v = validateTeacher({ displayName: name, school });
    if (!v.ok) return setError(v.error === "Enter your name." ? t("profile.welcome.enterName") : v.error);
    void save("teacher", v.value);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">{t("profile.welcome.signedInAs", { email: student.auth.email ?? "" })}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <button type="button" disabled={busy} className={choice} onClick={() => save("student")}>
          <span className="block font-display text-lg font-bold">{t("profile.welcome.student")}</span>
          <span className="mt-1 block text-sm text-zinc-500">{t("profile.welcome.studentHint")}</span>
        </button>
        <button type="button" disabled={busy} className={`${choice} ${asTeacher ? "border-blue-500 bg-blue-50" : ""}`} onClick={() => setAsTeacher(true)}>
          <span className="block font-display text-lg font-bold">{t("profile.welcome.teacher")}</span>
          <span className="mt-1 block text-sm text-zinc-500">{t("profile.welcome.teacherHint")}</span>
        </button>
      </div>
      {asTeacher && (
        <form onSubmit={submitTeacher} className="space-y-3 rounded-2xl border border-zinc-200 p-5">
          <label className="block text-sm font-medium">
            {t("profile.welcome.yourName")}
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" placeholder={t("profile.welcome.namePlaceholder")} />
          </label>
          <label className="block text-sm font-medium">
            {t("profile.welcome.school")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
            <input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2" placeholder={t("profile.welcome.schoolPlaceholder")} />
          </label>
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {busy ? t("common.saving") : t("profile.welcome.continue")}
          </button>
        </form>
      )}
      {error && <p className="text-sm text-urgent">{error}</p>}
    </div>
  );
}
