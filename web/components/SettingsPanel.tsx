"use client";

import { useEffect, useState } from "react";
import { GoogleSignIn, OPEN_SETTINGS_EVENT } from "@/components/AccountPanel";
import { MyCounselors } from "@/components/MyCounselors";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

/** Open/closed state of the settings panel. Opens when the URL hash is #account, or when the nav's Account link asks for it. */
export function useSettingsOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const sync = () => {
      if (window.location.hash === "#account") setOpen(true);
    };
    const show = () => setOpen(true);
    sync();
    window.addEventListener("hashchange", sync);
    window.addEventListener(OPEN_SETTINGS_EVENT, show);
    return () => {
      window.removeEventListener("hashchange", sync);
      window.removeEventListener(OPEN_SETTINGS_EVENT, show);
    };
  }, []);
  return [open, setOpen] as const;
}

export const SETTINGS_PANEL_ID = "settings-panel";

export function SettingsButton({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={SETTINGS_PANEL_ID}
      onClick={onToggle}
      className={buttonClass("secondary", "sm")}
    >
      <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      Settings
    </button>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-0.5 py-2 text-sm">
      <dt className="w-32 shrink-0 text-zinc-500">{label}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

/** Everything about the account: username, email, student/teacher, personal info, sign out, counselors and the role switch. */
export function SettingsPanel({ open }: { open: boolean }) {
  const student = useStudent();
  // The wrapper always exists so `#account` links have a target even while the panel is closed.
  return (
    <section id="account" aria-label="Settings" className="scroll-mt-4">
      {open && (
        <div id={SETTINGS_PANEL_ID} className="space-y-4">
          {student.auth ? <SignedIn /> : <SignedOut />}
        </div>
      )}
    </section>
  );
}

function SignedOut() {
  return (
    <div className="space-y-3 rounded-3xl border-2 border-zinc-200 p-6">
      <h2 className="text-xl font-bold">Settings</h2>
      <GoogleSignIn />
      <p className="text-xs text-zinc-500">Your current list and scores will be saved to your account.</p>
    </div>
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
      <div className="rounded-3xl border-2 border-zinc-200 p-6">
        <h2 className="text-xl font-bold">Settings</h2>
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
            Your scores and college list are saved to your account{student.syncing ? " (syncing…)" : ""}. Change your scores and other details in the cards on this page.
          </p>
        )}
        {student.error && (
          <p role="alert" className="mt-3 text-sm text-urgent">
            {student.error}
          </p>
        )}
        <button className={`mt-4 ${buttonClass("secondary", "sm")}`} onClick={() => student.signOut()}>
          Sign out
        </button>
      </div>
      {student.role === "student" && <MyCounselors />}
      <RoleSwitcher />
    </>
  );
}
