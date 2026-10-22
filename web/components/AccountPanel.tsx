"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

export function AccountPanel() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready) return <div className="h-40 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />;

  if (student.auth) {
    return (
      <div className="space-y-4 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <p>
          Signed in as <span className="font-medium">{student.auth.email}</span>.
        </p>
        <p className="text-sm text-zinc-500">
          Your scores and college list are saved to your account{student.syncing ? " (syncing…)" : ""}. Anything you had saved in this
          browser before signing in was added to it.
        </p>
        {student.error && <p className="text-sm text-rose-600">{student.error}</p>}
        <div className="flex gap-3">
          <Link href="/application/list" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Go to my list
          </Link>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700" onClick={() => student.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <GoogleSignIn />
      <p className="text-xs text-zinc-500">Your current list and scores will be saved to your account.</p>
    </div>
  );
}

/** "Continue with Google". `returnTo` is the path on this site to come back to (default: the profile page). */
export function GoogleSignIn({ returnTo }: { returnTo?: string }) {
  const student = useStudent();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          // On success the browser leaves for Google, so only a failure comes back here.
          const err = await student.signInWithGoogle(returnTo);
          if (err) {
            setError(err);
            setBusy(false);
          }
        }}
        className="flex w-full items-center justify-center gap-3 rounded-full border-2 border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50 disabled:opacity-60 sm:w-auto"
      >
        <GoogleMark />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-rose-600">{error}</p>}
    </>
  );
}

/** The reminder-emails switch. It lives under the deadline calendar; reminders are only sent to signed-in accounts. */
export function ReminderToggle() {
  const student = useStudent();
  if (!student.auth) {
    return (
      <p className="text-sm text-zinc-600">
        <a href="#account" className="font-semibold text-blue-700 underline underline-offset-4">
          Sign in
        </a>{" "}
        to get deadline reminders by email.
      </p>
    );
  }
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1"
        checked={student.profile.reminderEmails ?? true}
        onChange={(e) => student.setProfile({ ...student.profile, reminderEmails: e.target.checked })}
      />
      <span>
        Email me deadline reminders
        <span className="block text-xs text-zinc-500">
          14, 3 and 1 days before each deadline for colleges on my list (only the plan I picked; skipped once I&apos;ve applied).
        </span>
      </span>
    </label>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function AccountLink() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const cls = "text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white";
  if (!mounted || !student.ready) return <span className="w-14" />;
  return (
    <Link href="/profile#account" className={cls}>
      {student.auth ? "Account" : "Sign in"}
    </Link>
  );
}
