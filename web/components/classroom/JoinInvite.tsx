"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { SignInButton } from "@/components/SignInDialog";
import { useT } from "@/lib/i18n/client";
import type { CodeResult } from "@/lib/join-codes";
import { clearPendingCode, inviteStep, keepPendingAfter, parseInviteHash, readPendingCode, savePendingCode } from "@/lib/join-invite";
import { useStudent } from "@/lib/student-store";
import { buttonClass, PAGE_INTRO, PAGE_TITLE } from "@/lib/ui";
import { JoinBox } from "./JoinBox";

const noop = () => () => {};

/** The invite code in play: the one in the address (an invite link just opened), else the one saved in this tab. */
function codeInPlay(): string | null {
  if (typeof window === "undefined") return null;
  return parseInviteHash(window.location.hash) ?? readPendingCode();
}

/**
 * The /join page (spec 4.3). An invite link carries its code in the address fragment (/join#ABCD2345), which never
 * reaches a server. The page copies it to this tab's sessionStorage and removes it from the address bar at once, because
 * signing in and choosing a role can both lose the fragment. Then, by `inviteStep`:
 *  - signed out: why they are here and a Sign in button (it returns to /join, which reads the saved code);
 *  - signed in with no role: on to /welcome, which says to pick Student and brings them back here;
 *  - a teacher: "This invite is for students", no join (the database refuses it too);
 *  - a student with a code: the preview, looked up straight away; without one, the empty code box.
 * The saved code is cleared after a join, a cancel, and a preview that failed; only a good preview keeps it.
 */
export function JoinInvite() {
  const t = useT();
  const student = useStudent();
  const router = useRouter();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  // Read at load: after that the fragment is gone from the address, and the saved code is cleared by the handlers below.
  const [code, setCode] = useState(codeInPlay);

  // Save the invite code before anything else can lose it, then drop the fragment from the address (keeping Next's own
  // history state). A second invite link pasted into this tab only changes the fragment (no reload), so watch for that too.
  useEffect(() => {
    function takeFromAddress(): string | null {
      const fromAddress = parseInviteHash(window.location.hash);
      if (!fromAddress) return null;
      savePendingCode(fromAddress);
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
      return fromAddress;
    }
    takeFromAddress(); // an invite link just opened: `code` already holds it
    const onHashChange = () => {
      const next = takeFromAddress();
      if (next) setCode(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const step = inviteStep({ sessionChecked: mounted && student.ready && student.sessionChecked, signedIn: !!student.auth, role: student.role, code });

  // No role yet: /welcome asks for one (the code stays saved, so it can bring them back).
  useEffect(() => {
    if (step === "welcome") router.replace("/welcome");
  }, [step, router]);

  return (
    <div className="space-y-6">
      <h1 className={PAGE_TITLE}>{t("classroom.invite.title")}</h1>
      {step === "loading" || step === "welcome" ? (
        <div className="space-y-3">
          <p role="status" className="sr-only">
            {t("classroom.invite.checking")}
          </p>
          <div className="h-40 animate-pulse rounded-lg bg-zinc-100" />
          {student.error && (
            <p role="alert" className="text-sm text-urgent">
              {student.error}
            </p>
          )}
        </div>
      ) : step === "sign_in" ? (
        <div className="max-w-xl space-y-4">
          <p className={PAGE_INTRO}>{t("classroom.invite.signInIntro")}</p>
          <SignInButton className={buttonClass("primary", "md")}>{t("classroom.invite.signIn")}</SignInButton>
        </div>
      ) : step === "teacher" ? (
        <div className="max-w-xl space-y-4">
          <h2 className="font-display text-xl font-bold">{t("classroom.invite.teacherTitle")}</h2>
          <p className={PAGE_INTRO}>{t("classroom.invite.teacherBody")}</p>
          <Link href="/teacher/classes" className={buttonClass("secondary", "md")}>
            {t("classroom.invite.teacherLink")}
          </Link>
        </div>
      ) : (
        <div className="max-w-xl space-y-4">
          <p className={PAGE_INTRO}>{t(step === "preview" ? "classroom.invite.previewIntro" : "classroom.invite.noCodeIntro")}</p>
          <JoinBox
            key={code ?? "none"}
            initialCode={code ?? ""}
            autoPreview={step === "preview"}
            onJoined={() => {
              clearPendingCode();
              router.push("/counselor");
            }}
            onPreview={(r: CodeResult) => {
              if (!keepPendingAfter(r)) clearPendingCode();
            }}
            onCancel={() => clearPendingCode()}
          />
        </div>
      )}
    </div>
  );
}
