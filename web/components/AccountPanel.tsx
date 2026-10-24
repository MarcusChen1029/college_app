"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};

/** Fired by the nav's Account link so the settings panel opens when you are already on the page (a same-page link emits no hashchange). */
export const OPEN_SETTINGS_EVENT = "open-settings";

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
        className={`${buttonClass("secondary")} w-full sm:w-auto`}
      >
        <GoogleMark />
        {busy ? "Opening Google…" : "Continue with Google"}
      </button>
      {error && <p className="text-sm text-urgent">{error}</p>}
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

/** A link to the Settings panel: the teacher dashboard's for teachers, the profile's otherwise. Opens the panel if already on that page. */
export function SettingsLink({ children, className }: { children: React.ReactNode; className?: string }) {
  const student = useStudent();
  const home = student.role === "teacher" ? "/teacher" : "/profile";
  return (
    <Link href={`${home}#account`} className={className} onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
      {children}
    </Link>
  );
}

/** Top-right nav entry: "Sign in" when signed out, otherwise the username menu. */
export function AccountLink() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const cls = "max-w-40 truncate font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white";
  if (!mounted || !student.ready) return <span className="w-14" />;
  if (!student.auth) {
    return (
      <Link href="/profile#account" className={cls} onClick={() => window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT))}>
        Sign in
      </Link>
    );
  }
  return <AccountMenu />;
}

/** The signed-in username with a drop-down: Profile (Dashboard for teachers), Settings, Help, Sign out. */
function AccountMenu() {
  const student = useStudent();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const teacher = student.role === "teacher";
  const home = teacher ? "/teacher" : "/profile";
  const name = student.teacherProfile?.displayName ?? student.auth?.email?.split("@")[0] ?? "Account";

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item = "block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={student.auth?.email ?? undefined}
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-40 items-center gap-1 font-semibold text-zinc-600 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-white"
      >
        <span className="truncate">{name}</span>
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-44 rounded-xl border-2 border-ink bg-white p-1 shadow-lg">
          <Link role="menuitem" href={home} className={item} onClick={() => setOpen(false)}>
            {teacher ? "Dashboard" : "Profile"}
          </Link>
          <Link
            role="menuitem"
            href={`${home}#account`}
            className={item}
            onClick={() => {
              setOpen(false);
              window.dispatchEvent(new Event(OPEN_SETTINGS_EVENT));
            }}
          >
            Settings
          </Link>
          <Link role="menuitem" href="/help" className={item} onClick={() => setOpen(false)}>
            Help
          </Link>
          <button
            type="button"
            role="menuitem"
            className={`${item} border-t border-zinc-100`}
            onClick={() => {
              setOpen(false);
              void student.signOut();
            }}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
