"use client";

import { useEffect, useState } from "react";
import { GoogleSignIn } from "@/components/AccountPanel";
import { Modal } from "@/components/Modal";
import { useStudent } from "@/lib/student-store";

const OPEN_SIGN_IN_EVENT = "open-sign-in";

/** Opens the sign-in dialog from anywhere (the host is mounted once in the root layout). */
export function openSignIn() {
  window.dispatchEvent(new Event(OPEN_SIGN_IN_EVENT));
}

/** A button that opens the sign-in dialog; style it with `className`. */
export function SignInButton({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={openSignIn}>
      {children}
    </button>
  );
}

/** The dialog itself. `returnTo` (the page the visitor was on) is captured when it opens; null means closed. */
export function SignInDialogHost() {
  const student = useStudent();
  const [returnTo, setReturnTo] = useState<string | null>(null);

  useEffect(() => {
    const show = () => setReturnTo(window.location.pathname + window.location.search);
    window.addEventListener(OPEN_SIGN_IN_EVENT, show);
    return () => window.removeEventListener(OPEN_SIGN_IN_EVENT, show);
  }, []);

  // Signing in (or already being signed in) closes it.
  if (student.auth && returnTo !== null) setReturnTo(null);
  if (returnTo === null) return null;

  return (
    <Modal title={<h2 className="font-display text-lg font-bold">Sign in</h2>} onClose={() => setReturnTo(null)} className="w-[min(26rem,calc(100vw-2rem))]">
      <div className="space-y-3">
        <GoogleSignIn returnTo={returnTo} />
        <p className="text-sm text-zinc-600">Your list and scores on this device are saved to your account when you sign in.</p>
      </div>
    </Modal>
  );
}
