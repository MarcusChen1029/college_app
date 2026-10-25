"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { SignInButton } from "@/components/SignInDialog";
import type { NavItem } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";

/** The reminder-emails switch. It lives under the deadline calendar; reminders are only sent to signed-in accounts. */
export function ReminderToggle() {
  const student = useStudent();
  if (!student.auth) {
    return (
      <p className="text-sm text-zinc-600">
        <SignInButton className="font-semibold text-blue-700 underline underline-offset-4">Sign in</SignInButton>{" "}
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

/** A link to the Settings page. */
export function SettingsLink({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Link href="/settings" className={className}>
      {children}
    </Link>
  );
}

/** A header drop-down: the username (with Sign out) or "More" (without). Items are real links; Esc and an outside click close it. */
export function AccountMenu({ label, title, items, onSignOut }: { label: string; title?: string; items: readonly NavItem[]; onSignOut?: () => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

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

  const item = "block w-full rounded-lg px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-zinc-100";
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 max-w-32 items-center gap-1 lg:max-w-40 font-semibold text-zinc-600 hover:text-zinc-900"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border-2 border-ink bg-white p-1 shadow-lg">
          {items.map(([href, text]) => (
            <Link key={href} role="menuitem" href={href} className={item} onClick={() => setOpen(false)}>
              {text}
            </Link>
          ))}
          {onSignOut && (
            <button
              type="button"
              role="menuitem"
              className={`${item} border-t border-zinc-100`}
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
            >
              Sign out
            </button>
          )}
        </div>
      )}
    </div>
  );
}
