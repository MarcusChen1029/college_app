"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { AccessLists } from "@/components/ai-access/AccessLists";
import { AiSlip as Slip, AiSlipSkeleton as SlipSkeleton } from "@/components/ai-access/AiSlip";
import { SlipActions } from "@/components/extension-connect/Slip";
import { isAuthorizationId, isKnownAiHost, redirectHost, safeReturnUrl } from "@/lib/connect-ai";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass } from "@/lib/ui";
import { GoogleSignIn } from "./GoogleSignIn";

const noop = () => () => {};
// The error state's own sentinel; the slip shows it in the visitor's language (misc.consent.badReturn).
const BAD_RETURN = "This app's return address isn't a normal web address, so Trakur won't send you there. Don't connect this app.";

type Load = { state: "loading" } | { state: "redirecting" } | { state: "error"; message: string } | { state: "ready"; details: OAuthAuthorizationDetails };

/**
 * Where Supabase's OAuth server sends the student to approve an AI's request (authorization path /oauth/consent).
 * A permission slip on the site's ticket stationery, like the extension's (/extension/connect): the body says who is
 * asking, where it sends you back and what it can and can't do; the stub carries who is signing and the decision.
 */
export function OAuthConsent() {
  const t = useT();
  const raw = useSearchParams().get("authorization_id");
  const id = isAuthorizationId(raw) ? raw : null; // a malformed id never reaches Supabase
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const signedIn = mounted && student.ready && !!student.auth;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const [vouched, setVouched] = useState(false);

  useEffect(() => {
    if (!id || !signedIn) return;
    let live = true;
    browserSupabase()
      .auth.oauth.getAuthorizationDetails(id)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) return setLoad({ state: "error", message: error?.message ?? "No details came back." });
        // Already approved earlier: Supabase hands back the redirect straight away.
        if ("redirect_url" in data) {
          const next = safeReturnUrl(data.redirect_url);
          if (!next) return setLoad({ state: "error", message: BAD_RETURN });
          setLoad({ state: "redirecting" });
          window.location.assign(next);
        } else if (!safeReturnUrl(data.redirect_uri)) setLoad({ state: "error", message: BAD_RETURN });
        else setLoad({ state: "ready", details: data });
      })
      .catch((e: Error) => live && setLoad({ state: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, [id, signedIn]);

  const decide = async (approve: boolean) => {
    if (!id) return;
    setBusy(approve ? "approve" : "deny");
    const oauth = browserSupabase().auth.oauth;
    const { data, error } = await (approve ? oauth.approveAuthorization(id, { skipBrowserRedirect: true }) : oauth.denyAuthorization(id, { skipBrowserRedirect: true }));
    if (error || !data) {
      setBusy(null);
      setLoad({ state: "error", message: error?.message ?? "No redirect came back." });
      return;
    }
    const next = safeReturnUrl(data.redirect_url);
    if (!next) {
      setBusy(null);
      setLoad({ state: "error", message: BAD_RETURN });
      return;
    }
    window.location.assign(next);
  };

  const toConnect = (variant: "primary" | "secondary") => (
    <Link href="/connect-ai" className={buttonClass(variant)}>
      {t("misc.consent.toConnect")}
    </Link>
  );

  if (!id) {
    return (
      <Slip title={t("misc.consent.invalidTitle")} stub={<SlipActions who={null}>{toConnect("primary")}</SlipActions>}>
        <p>{t("misc.consent.invalidBody")}</p>
      </Slip>
    );
  }
  if (!mounted || !student.ready) return <SlipSkeleton label={t("misc.consent.loading")} />;

  if (!student.auth) {
    return (
      <Slip
        title={t("misc.consent.signInTitle")}
        stub={
          <SlipActions who={t("misc.consent.undo")}>
            <GoogleSignIn returnTo={`/oauth/consent?authorization_id=${encodeURIComponent(id)}`} />
          </SlipActions>
        }
      >
        <p>{t("misc.consent.signInBody")}</p>
      </Slip>
    );
  }

  if (load.state === "error") {
    return (
      <Slip title={t("misc.consent.errorTitle")} stub={<SlipActions who={t("misc.consent.errorHint")}>{toConnect("secondary")}</SlipActions>}>
        <p role="alert" className="rounded-xl bg-urgent-bg px-4 py-3 text-urgent [overflow-wrap:anywhere]">
          {load.message === BAD_RETURN ? t("misc.consent.badReturn") : load.message}
        </p>
      </Slip>
    );
  }
  if (load.state === "redirecting") {
    return (
      <Slip title={t("misc.consent.returningTitle")}>
        <p role="status">{t("misc.consent.returningBody")}</p>
      </Slip>
    );
  }
  if (load.state !== "ready") return <SlipSkeleton label={t("misc.consent.loading")} />;

  const senior = student.plan.key === "senior"; // the plan in force today (store: pass windows, Taipei date)
  const { client, redirect_uri } = load.details;
  const host = redirectHost(redirect_uri) ?? redirect_uri;
  const known = isKnownAiHost(redirect_uri);
  return (
    <Slip
      title={t("misc.consent.title", { name: client.name })}
      stub={
        <div className="space-y-4">
          {!senior && (
            <p className="rounded-xl bg-soon-bg px-4 py-3 text-base text-soon">
              {t("misc.consent.needPass", { plan: t(`payments.planName.${student.plan.key}`) })}{" "}
              <Link href="/pricing" className="font-semibold underline underline-offset-4">
                {t("misc.consent.getPass")}
              </Link>
            </p>
          )}
          <SlipActions
            who={
              <>
                <p className="[overflow-wrap:anywhere]">
                  {t("extension.signedInAs")} <span className="font-semibold text-ink">{student.auth.email}</span>
                </p>
                <p className="mt-1 text-sm text-zinc-600">{t("misc.consent.undo")}</p>
              </>
            }
          >
            <button type="button" className={buttonClass("primary")} disabled={!senior || busy != null || (!known && !vouched)} onClick={() => decide(true)}>
              {busy === "approve" ? t("misc.consent.approving") : t("misc.consent.approve")}
            </button>
            <button type="button" className={buttonClass("secondary")} disabled={busy != null} onClick={() => decide(false)}>
              {busy === "deny" ? t("misc.consent.denying") : t("misc.consent.deny")}
            </button>
          </SlipActions>
        </div>
      }
    >
      {/* The lead beside where the approval sends the student: a known AI on a white card, an unknown app in the urgent pair. */}
      <div className="grid items-start gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
      <p className="text-lg leading-snug text-ink sm:text-xl">{t("misc.consent.lead", { name: client.name })}</p>
      <div className={`rounded-xl px-5 py-4 ${known ? "bg-white" : "bg-urgent-bg text-urgent"}`}>
        <p className="text-sm">{t("misc.consent.returnTo")}</p>
        <p className={`font-display text-2xl font-bold leading-tight [overflow-wrap:anywhere] ${known ? "text-ink" : ""}`}>{host}</p>
        {client.uri && <p className="mt-1 text-sm [overflow-wrap:anywhere]">{t("misc.consent.website", { uri: client.uri })}</p>}
        {known ? (
          <p className="mt-3 text-sm">{t("misc.consent.knownNote")}</p>
        ) : (
          <>
            <p className="mt-3 font-semibold">{t("misc.consent.unknownNote", { name: client.name, host })}</p>
            <label className="mt-3 flex items-start gap-2.5">
              <input type="checkbox" checked={vouched} onChange={(e) => setVouched(e.target.checked)} className="mt-1 size-4 shrink-0" />
              <span>{t("misc.consent.vouch", { host })}</span>
            </label>
          </>
        )}
      </div>
      </div>
      <AccessLists onSky canTitle={t("misc.consent.canTitle", { name: client.name })} cannotTitle={t("misc.consent.cannotTitle")} />
    </Slip>
  );
}
