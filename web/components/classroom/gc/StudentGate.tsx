"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { PAGE_TITLE } from "@/lib/ui";

const noop = () => () => {};

/** Placeholder while the session or the role is being worked out. `label` is announced to a screen reader. */
export function GateSkeleton({ label }: { label?: string }) {
  return (
    <div role="status" aria-busy="true" className="h-96 animate-pulse rounded-3xl bg-zinc-100">
      {label && <span className="sr-only">{label}</span>}
    </div>
  );
}

/**
 * The door of every student classroom screen: a skeleton until the session is known, a sign-in prompt for a visitor,
 * a skeleton for a teacher or an account without a role (RoleGate is already sending them elsewhere), and for a student
 * the children, keyed by user so nothing of the last user's state survives a sign-out and sign-in. `returnTo` is the path
 * Google sign-in comes back to.
 */
export function StudentGate({ returnTo, children }: { returnTo: string; children: ReactNode }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready || !student.sessionChecked) return <GateSkeleton />;
  if (!student.auth) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
        <p className="text-base text-ink">{t("classroom.page.signIn")}</p>
        <GoogleSignIn returnTo={returnTo} />
      </div>
    );
  }
  if (student.role !== "student") return <GateSkeleton />;
  return <Fragment key={student.auth.userId}>{children}</Fragment>;
}
