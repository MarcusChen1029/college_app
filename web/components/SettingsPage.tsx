"use client";

import Link from "next/link";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { ReminderToggle } from "@/components/AccountPanel";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { MyCounselors } from "@/components/MyCounselors";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const card = "rounded-2xl border border-zinc-200 p-6";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2 text-sm">
      <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

/** Everything about the account: username, email, student/teacher, reminders, counselors and the role switch. */
export function SettingsPage() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Wait for the session check too, so a signed-in load never flashes the signed-out card.
  const ready = mounted && student.ready && student.sessionChecked;
  const signedIn = !!student.auth;
  const scrolled = useRef(false);

  // The cards render after load, so the browser's own anchor jump (e.g. #reminders) misses them. Scroll once only.
  useEffect(() => {
    if (!ready || scrolled.current) return;
    const id = decodeURIComponent(window.location.hash.slice(1));
    const el = id ? document.getElementById(id) : null;
    if (!el) return;
    scrolled.current = true;
    el.scrollIntoView();
  }, [ready, signedIn, student.role]);

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold">Settings</h1>
      {!ready ? <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" /> : student.auth ? <SignedIn /> : <SignedOut />}
    </div>
  );
}

function SignedOut() {
  return (
    <section aria-labelledby="signin-heading" className={`${card} space-y-3`}>
      <h2 id="signin-heading" className="text-xl font-bold">Sign in to save your list and get reminders</h2>
      <GoogleSignIn returnTo="/settings" />
      <p className="text-xs text-zinc-500">Your current list and scores will be saved to your account.</p>
    </section>
  );
}

function SignedIn() {
  const student = useStudent();
  const auth = student.auth!;
  const teacher = student.role === "teacher";
  const username = auth.email?.split("@")[0] ?? "";
  const tp = student.teacherProfile;

  return (
    <>
      <section aria-labelledby="account-heading" className={card}>
        <h2 id="account-heading" className="text-xl font-bold">Account</h2>
        <dl className="mt-2 divide-y divide-zinc-100">
          <Row label="Username">{username}</Row>
          <Row label="Email">{auth.email}</Row>
          <Row label="Account type">{teacher ? "Teacher / counselor" : student.role === "student" ? "Student" : "Not chosen yet"}</Row>
          {teacher ? (
            <>
              {tp?.displayName && <Row label="Name">{tp.displayName}</Row>}
              {tp?.school && <Row label="School">{tp.school}</Row>}
            </>
          ) : (
            <Row label="Applying from">{student.profile.international ? "Abroad (international applicant)" : "The US"}</Row>
          )}
        </dl>
        {!teacher && (
          <p className="mt-3 text-sm text-zinc-500">
            Your scores and college list are saved to your account{student.syncing ? " (syncing…)" : ""}. Change your scores and other details on your{" "}
            <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
              Profile
            </Link>
            .
          </p>
        )}
        {student.error && (
          <p role="alert" className="mt-3 text-sm text-urgent">
            {student.error}
          </p>
        )}
        <button className={`mt-4 ${buttonClass("secondary")}`} onClick={() => student.signOut()}>
          Sign out
        </button>
      </section>
      {student.role === "student" && (
        <section id="reminders" aria-labelledby="reminders-heading" className={`${card} scroll-mt-4`}>
          <h2 id="reminders-heading" className="mb-3 text-xl font-bold">Reminders</h2>
          <ReminderToggle />
        </section>
      )}
      {student.role === "student" && <MyCounselors />}
      <RoleSwitcher />
    </>
  );
}
