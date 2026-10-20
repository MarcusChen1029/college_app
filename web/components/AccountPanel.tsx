"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";

const noop = () => () => {};

export function AccountPanel() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        {student.error && <p className="text-sm text-rose-600">{student.error}</p>}
        <div className="flex gap-3">
          <Link href="/my-list" className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
            Go to my list
          </Link>
          <button className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm dark:border-zinc-700" onClick={() => student.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
        <p className="font-medium">Check your email</p>
        <p className="mt-1 text-sm text-zinc-500">
          We sent a sign-in link to {email}. Open it on this device to finish signing in.
        </p>
        <button className="mt-3 text-sm text-blue-600 underline dark:text-blue-400" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form
      className="space-y-3 rounded-lg border border-zinc-200 p-5 dark:border-zinc-800"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const err = await student.signIn(email.trim());
        setBusy(false);
        if (err) setError(err);
        else setSent(true);
      }}
    >
      <label className="block text-sm">
        <span className="text-zinc-500">Email</span>
        <input
          type="email"
          required
          autoComplete="email"
          className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />
      </label>
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <button disabled={busy} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60">
        {busy ? "Sending…" : "Email me a sign-in link"}
      </button>
      <p className="text-xs text-zinc-500">No password needed. Your current list and scores will be saved to your account.</p>
    </form>
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
