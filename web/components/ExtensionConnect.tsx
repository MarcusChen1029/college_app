"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { openSignIn } from "@/components/SignInDialog";
import { createExtensionToken, extensionDenyRedirect, extensionRedirect } from "@/lib/extension-api";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const card = "mx-auto max-w-xl space-y-4 rounded-2xl border border-zinc-200 p-6";
const skeleton = <div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

/**
 * Where the Chrome extension's sign-in (chrome.identity.launchWebAuthFlow) lands: /extension/connect?redirect_uri=...
 * A signed-in student allows it, gets a transcript-only token and is sent back to the extension's own address with the
 * token in the URL fragment. The token is never logged, stored, or put in a query string.
 */
export function ExtensionConnect() {
  const redirectUri = useSearchParams().get("redirect_uri");
  const extensionId = process.env.NEXT_PUBLIC_EXTENSION_ID ?? "";
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!extensionId) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">Extension sign-in isn&apos;t set up yet.</h1>
      </div>
    );
  }
  // Refuse before asking for anything: only the extension's own address is ever redirected to.
  if (extensionRedirect(redirectUri, extensionId, "x") === null) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">This link didn&apos;t come from the extension.</h1>
        <p className="text-sm text-zinc-600">Open the Common App filler extension and choose Connect to start again.</p>
      </div>
    );
  }
  if (!mounted || !student.ready || !student.sessionChecked) return skeleton;

  if (!student.auth) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">Sign in to continue</h1>
        <p className="text-sm text-zinc-600">The Common App filler extension is asking to connect. Sign in first, then you can allow or cancel.</p>
        <button type="button" className={buttonClass("primary")} onClick={openSignIn}>
          Sign in
        </button>
      </div>
    );
  }
  if (student.role === "teacher") {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">This extension is for students.</h1>
      </div>
    );
  }
  if (student.role === null) {
    // No account type yet. This page is exempt from the /welcome redirect (redirectFor) so the popup is not lost; say what to do instead.
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">Choose your account type first</h1>
        <p className="text-sm text-zinc-600">
          Choose &apos;Student&apos; first at <Link href="/welcome" className="font-medium underline">/welcome</Link>, then click Sign in in the extension again.
        </p>
        <Link href="/welcome" className={buttonClass("primary")}>
          Go to /welcome
        </Link>
      </div>
    );
  }
  if (student.role !== "student") return skeleton; // role still loading

  async function allow() {
    setBusy(true);
    setError(null);
    try {
      const token = await createExtensionToken();
      const target = extensionRedirect(redirectUri, extensionId, token);
      if (!target) throw new Error("This link didn't come from the extension.");
      setDone(true);
      window.location.replace(target);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  function cancel() {
    const target = extensionDenyRedirect(redirectUri, extensionId);
    if (target) window.location.replace(target);
  }

  return (
    <div className={card}>
      <h1 className="font-display text-2xl font-bold">Connect the extension</h1>
      <p className="text-sm text-zinc-700">
        <strong>Common App filler</strong> wants to read your transcript (schools, courses, grades). It cannot see anything else in your account.
      </p>
      <p className="text-sm text-zinc-600">
        Signed in as <span className="font-medium">{student.auth.email}</span>. You can disconnect it any time in Settings.
      </p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      {done ? (
        <p className="text-sm text-zinc-600">Returning to the extension…</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass("primary")} disabled={busy} onClick={allow}>
            {busy ? "Allowing…" : "Allow"}
          </button>
          <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
