"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { openSignIn } from "@/components/SignInDialog";
import { createExtensionToken, extensionDenyRedirect, extensionRedirect } from "@/lib/extension-api";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const card = "mx-auto max-w-xl space-y-4 rounded-2xl border border-zinc-200 p-6";
const skeleton = <div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />;

/**
 * Where the Chrome extension's sign-in (chrome.identity.launchWebAuthFlow) lands: /extension/connect?redirect_uri=...
 * A signed-in student allows it, gets a token that reads only the transcript and the activities and honors, and is sent back to the extension's own address with the
 * token in the URL fragment. The token is never logged, stored, or put in a query string.
 */
export function ExtensionConnect() {
  const t = useT();
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
        <h1 className="font-display text-2xl font-bold">{t("extension.notSetUp")}</h1>
      </div>
    );
  }
  // Refuse before asking for anything: only the extension's own address is ever redirected to.
  if (extensionRedirect(redirectUri, extensionId, "x") === null) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">{t("extension.wrongLink")}</h1>
        <p className="text-sm text-zinc-600">{t("extension.wrongLinkBody")}</p>
      </div>
    );
  }
  if (!mounted || !student.ready || !student.sessionChecked) return skeleton;

  if (!student.auth) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">{t("extension.signInTitle")}</h1>
        <p className="text-sm text-zinc-600">{t("extension.signInBody")}</p>
        <button type="button" className={buttonClass("primary")} onClick={openSignIn}>
          {t("account.signIn")}
        </button>
      </div>
    );
  }
  if (student.role === "teacher") {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">{t("extension.studentsOnly")}</h1>
      </div>
    );
  }
  if (student.role === null) {
    // No account type yet. This page is exempt from the /welcome redirect (redirectFor) so the popup is not lost; say what to do instead.
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">{t("extension.roleTitle")}</h1>
        <p className="text-sm text-zinc-600">
          {t("extension.roleBefore")}{" "}
          <Link href="/welcome" className="font-medium underline">
            /welcome
          </Link>
          {t("extension.roleAfter")}
        </p>
        <Link href="/welcome" className={buttonClass("primary")}>
          {t("extension.roleGo")}
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
      if (!target) throw new Error(t("extension.wrongLink"));
      setDone(true);
      window.location.replace(target);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.tryAgain"));
      setBusy(false);
    }
  }

  function cancel() {
    const target = extensionDenyRedirect(redirectUri, extensionId);
    if (target) window.location.replace(target);
  }

  return (
    <div className={card}>
      <h1 className="font-display text-2xl font-bold">{t("extension.title")}</h1>
      <p className="text-sm text-zinc-700">
        <strong>{t("extension.name")}</strong> {t("extension.consent")}
      </p>
      <p className="text-sm text-zinc-600">
        {t("extension.signedInAs")} <span className="font-medium">{student.auth.email}</span>. {t("extension.disconnectAnyTime")}
      </p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      {done ? (
        <p className="text-sm text-zinc-600">{t("extension.returning")}</p>
      ) : (
        <div className="flex flex-wrap gap-3">
          <button type="button" className={buttonClass("primary")} disabled={busy} onClick={allow}>
            {busy ? t("extension.allowing") : t("extension.allow")}
          </button>
          <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={cancel}>
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}
