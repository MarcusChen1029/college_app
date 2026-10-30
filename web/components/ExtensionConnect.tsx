"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Permissions, Slip, SlipActions } from "@/components/extension-connect/Slip";
import { StatusIcon } from "@/components/StatusPill";
import { openSignIn } from "@/components/SignInDialog";
import { createExtensionToken, extensionDenyRedirect, extensionRedirect } from "@/lib/extension-api";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};
const skeleton = <div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />;

/**
 * Where the Chrome extension's sign-in (chrome.identity.launchWebAuthFlow) lands: /extension/connect?redirect_uri=...
 * A signed-in student allows it, gets a token that reads only the transcript and the activities and honors, and is sent back to the extension's own address with the
 * token in the URL fragment. The token is never logged, stored, or put in a query string.
 * The page is drawn as a permission slip (components/extension-connect/Slip.tsx); every check and step below is unchanged.
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
  // After a failed request the Allow button is enabled again: put focus back on it (it was disabled while busy).
  const allowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (error) allowRef.current?.focus();
  }, [error]);

  if (!extensionId) {
    return (
      <Slip
        title={t("extension.notSetUp")}
        stub={
          <SlipActions who={null}>
            <Link href="/tools" className={buttonClass("primary")}>
              {t("extension.toTools")}
            </Link>
          </SlipActions>
        }
      >
        <p>{t("extension.notSetUpBody")}</p>
      </Slip>
    );
  }
  // Refuse before asking for anything: only the extension's own address is ever redirected to.
  if (extensionRedirect(redirectUri, extensionId, "x") === null) {
    return (
      <Slip title={t("extension.wrongLink")}>
        <p>{t("extension.wrongLinkBody")}</p>
      </Slip>
    );
  }
  if (!mounted || !student.ready || !student.sessionChecked) return skeleton;

  if (!student.auth) {
    return (
      <Slip
        title={t("extension.signInTitle")}
        stub={
          <SlipActions who={t("extension.revoke")}>
            <button type="button" className={buttonClass("primary")} onClick={openSignIn}>
              {t("account.signIn")}
            </button>
          </SlipActions>
        }
      >
        <p>{t("extension.signInBody")}</p>
        <Permissions />
      </Slip>
    );
  }
  if (student.role === "teacher") {
    return (
      <Slip
        title={t("extension.studentsOnly")}
        stub={
          <SlipActions who={null}>
            <Link href="/teacher" className={buttonClass("primary")}>
              {t("extension.toTeacher")}
            </Link>
          </SlipActions>
        }
      >
        <p>{t("extension.studentsOnlyBody")}</p>
      </Slip>
    );
  }
  if (student.role === null) {
    // No account type yet. This page is exempt from the /welcome redirect (redirectFor) so the popup is not lost; say what to do instead.
    return (
      <Slip
        title={t("extension.roleTitle")}
        stub={
          <SlipActions who={null}>
            <Link href="/welcome" className={buttonClass("primary")}>
              {t("extension.roleGo")}
            </Link>
          </SlipActions>
        }
      >
        <p>
          {t("extension.roleBefore")}{" "}
          <Link href="/welcome" className="font-semibold text-blue-700 underline underline-offset-4">
            /welcome
          </Link>
          {t("extension.roleAfter")}
        </p>
      </Slip>
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
    <Slip
      title={t("extension.slipTitle", { name: t("extension.name") })}
      stub={
        <div className="space-y-4">
          {error && (
            <p role="alert" className="rounded-xl bg-urgent-bg px-4 py-3 text-base text-urgent">
              {/* The server's own wording is not shown: one plain sentence (the link check keeps its own). */}
              {error === t("extension.wrongLink") ? error : t("extension.mintFailed")}
            </p>
          )}
          <SlipActions
            who={
              <>
                <p className="[overflow-wrap:anywhere]">
                  {t("extension.signedInAs")} <span className="font-semibold text-ink">{student.auth.email}</span>
                </p>
                <p className="mt-1">{t("extension.revoke")}</p>
                <p className="mt-1">{t("extension.lifetime")}</p>
              </>
            }
          >
            {/* The live region is on the page (empty) from the start, so filling it is announced. */}
            <p role="status" className={done ? "inline-flex items-center gap-2 text-base font-semibold text-ink" : "sr-only"}>
              {done && (
                <>
                  <StatusIcon tone="done" />
                  {t("extension.returning")}
                </>
              )}
            </p>
            {!done && (
              <>
                <button ref={allowRef} type="button" className={buttonClass("primary")} disabled={busy} aria-busy={busy} onClick={allow}>
                  {busy ? t("extension.allowing") : t("extension.allow")}
                </button>
                <button type="button" className={buttonClass("secondary")} disabled={busy} onClick={cancel}>
                  {t("common.cancel")}
                </button>
              </>
            )}
          </SlipActions>
        </div>
      }
    >
      <p>{t("extension.slipLead")}</p>
      <Permissions />
    </Slip>
  );
}
