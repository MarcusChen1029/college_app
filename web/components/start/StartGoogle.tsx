"use client";

// "Continue with Google" for the wizard's last step: components/GoogleSignIn.tsx at the wizard's size (a 56px button,
// the consent line at 14px). It adds nothing itself; the wizard brings the student back to its last step afterwards.
import { useState } from "react";
import { LegalRich } from "@/components/LegalRich";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

export function StartGoogle({ returnTo }: { returnTo: string }) {
  const student = useStudent();
  const t = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
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
        className="inline-flex h-14 w-full items-center justify-center gap-3 rounded-full bg-white px-7 text-base font-semibold text-ink transition-[background-color,transform] duration-200 hover:bg-zinc-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
      >
        <GoogleMark />
        {busy ? t("signIn.opening") : t("signIn.google")}
      </button>
      {error && <p className="text-base text-urgent">{error}</p>}
      <p className="text-sm leading-snug text-zinc-600">
        <LegalRich text={t("legal.signIn.consent")} newTab linkClassName="font-semibold underline underline-offset-2 hover:text-ink" />
      </p>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
