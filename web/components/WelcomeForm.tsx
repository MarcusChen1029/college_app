"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { GoogleSignIn, SignInConsent } from "@/components/GoogleSignIn";
import { useT } from "@/lib/i18n/client";
import { homePathFor, validateTeacher } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import type { MessageKey } from "@/lib/i18n";
import { buttonClass, PAGE_INTRO, PANEL } from "@/lib/ui";
import { clearWelcomeIntent, readWelcomeIntent, saveWelcomeIntent, sessionStore, welcomeStep, type WelcomeRole } from "@/lib/welcome-intent";
import { Calendar, GradCap } from "./Doodles";

const noop = () => () => {};

// The two kinds of account and what each really gets (features that exist in the app), shown before and after sign-in.
const ROLES = [
  { role: "student", art: GradCap, title: "profile.welcome.student", hint: "profile.welcome.studentHint", google: "profile.welcome.googleAsStudent", points: ["profile.welcome.studentP1", "profile.welcome.studentP2", "profile.welcome.studentP3"] },
  { role: "teacher", art: Calendar, title: "profile.welcome.teacher", hint: "profile.welcome.teacherHint", google: "profile.welcome.googleAsTeacher", points: ["profile.welcome.teacherP1", "profile.welcome.teacherP2", "profile.welcome.teacherP3"] },
] as const satisfies readonly { role: WelcomeRole; art: unknown; title: MessageKey; hint: MessageKey; google: MessageKey; points: readonly MessageKey[] }[];

/** A role's card body: its picture, name, one line and three things it gets. */
function RoleBody({ r }: { r: (typeof ROLES)[number] }) {
  const t = useT();
  const Art = r.art;
  return (
    <>
      <Art className="h-12 w-auto" />
      <span className="mt-4 block font-display text-xl font-bold text-ink">{t(r.title)}</span>
      <span className="mt-1 block text-base text-ink">{t(r.hint)}</span>
      <ul className="mt-4 space-y-2 text-[15px] text-zinc-700">
        {r.points.map((k) => (
          <li key={k} className="flex gap-2">
            <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-ink" />
            {t(k)}
          </li>
        ))}
      </ul>
    </>
  );
}

/** First sign-in: pick student or teacher/counselor (saved once through the set_my_role RPC). Signed out, each card has its
 *  own "Continue with Google". The card the visitor clicked is kept in this tab (lib/welcome-intent.ts, ten minutes, used
 *  once), never in the address: back from Google, the student card sets up a student account straight away and the teacher
 *  card opens the name form (the RPC needs the name). Without that click, a signed-in account with no role gets the chooser. */
export function WelcomeForm() {
  const t = useT();
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Read once when the page loads (reading changes nothing) and forgotten by the effect below, so it is used once.
  const [intent] = useState(() => readWelcomeIntent(sessionStore()));
  const [asTeacher, setAsTeacher] = useState(() => intent === "teacher");
  const [name, setName] = useState("");
  const [school, setSchool] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  useEffect(() => clearWelcomeIntent(sessionStore()), []);

  const step = welcomeStep({ ready: mounted && student.ready, signedIn: !!student.auth, role: student.role, intent, failed: !!error });

  // Back from Google after "Continue with Google" on the student card: save the role once, the same way the card does.
  useEffect(() => {
    if (step !== "saveStudent" || autoStarted.current) return;
    autoStarted.current = true;
    void student.setRole("student").then((err) => (err ? setError(err) : router.push(homePathFor("student"))));
  }, [step, student, router]);

  if (step === "loading") return <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />;

  if (step === "signIn") {
    return (
      <div className="space-y-6">
        <p className={PAGE_INTRO}>{t("profile.welcome.signInPrompt")}</p>
        <ul className="grid gap-4 md:grid-cols-2">
          {ROLES.map((r) => (
            <li key={r.role} className={`${PANEL} flex flex-col p-6`}>
              <RoleBody r={r} />
              <div className="mt-auto space-y-2 pt-6">
                <GoogleSignIn
                  returnTo="/welcome"
                  ariaLabel={t(r.google)}
                  consent={false}
                  onStart={() => saveWelcomeIntent(sessionStore(), r.role)}
                  onFail={() => clearWelcomeIntent(sessionStore())}
                />
              </div>
            </li>
          ))}
        </ul>
        <SignInConsent />
      </div>
    );
  }

  if (step === "saveStudent") {
    return (
      <div className="space-y-4" aria-live="polite">
        <p className={PAGE_INTRO}>{t("profile.welcome.settingUp")}</p>
        <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
      </div>
    );
  }

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
      <p className={PAGE_INTRO}>{t("profile.welcome.signedInAs", { email: student.auth?.email ?? "" })}</p>
      <div className="grid gap-4 md:grid-cols-2">
        {ROLES.map((r) => (
          <button
            key={r.role}
            type="button"
            disabled={busy}
            aria-pressed={r.role === "teacher" ? asTeacher : undefined}
            className={`${PANEL} p-6 text-left transition-shadow hover:ring-2 hover:ring-ink disabled:opacity-60 ${r.role === "teacher" && asTeacher ? "ring-2 ring-ink" : ""}`}
            onClick={() => (r.role === "student" ? save("student") : setAsTeacher(true))}
          >
            <RoleBody r={r} />
          </button>
        ))}
      </div>
      {asTeacher && (
        <form onSubmit={submitTeacher} className={`space-y-3 ${PANEL} p-5 sm:p-6`}>
          <label className="block text-sm font-medium">
            {t("profile.welcome.yourName")}
            <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2" placeholder={t("profile.welcome.namePlaceholder")} />
          </label>
          <label className="block text-sm font-medium">
            {t("profile.welcome.school")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
            <input value={school} onChange={(e) => setSchool(e.target.value)} className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2" placeholder={t("profile.welcome.schoolPlaceholder")} />
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
