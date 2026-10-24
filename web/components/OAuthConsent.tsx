"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { OAuthAuthorizationDetails } from "@supabase/supabase-js";
import { AI_CAN, AI_CANNOT, isAuthorizationId, redirectHost } from "@/lib/connect-ai";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass, toneClass } from "@/lib/ui";
import { GoogleSignIn } from "./AccountPanel";

const noop = () => () => {};
const card = "mx-auto max-w-xl space-y-4 rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800";

type Load = { state: "loading" } | { state: "redirecting" } | { state: "error"; message: string } | { state: "ready"; details: OAuthAuthorizationDetails };

/** Where Supabase's OAuth server sends the student to approve an AI's request (authorization path /oauth/consent). */
export function OAuthConsent() {
  const raw = useSearchParams().get("authorization_id");
  const id = isAuthorizationId(raw) ? raw : null; // a malformed id never reaches Supabase
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const signedIn = mounted && student.ready && !!student.auth;
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);

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
          setLoad({ state: "redirecting" });
          window.location.assign(data.redirect_url);
        } else setLoad({ state: "ready", details: data });
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
    window.location.assign(data.redirect_url);
  };

  if (!id) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">This link is invalid or has expired</h1>
        <p className="text-sm text-zinc-600">This page opens when an AI asks to connect. Start again from your AI, or from the Connect AI page.</p>
        <Link href="/connect-ai" className="text-sm font-semibold text-blue-700 underline underline-offset-4">
          Go to Connect AI
        </Link>
      </div>
    );
  }
  if (!mounted || !student.ready) return <div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" />;

  if (!student.auth) {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">Sign in to continue</h1>
        <p className="text-sm text-zinc-600">An AI is asking to connect to your College Tracker account. Sign in first, then you can approve or decline.</p>
        <GoogleSignIn returnTo={`/oauth/consent?authorization_id=${encodeURIComponent(id)}`} />
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div className={card}>
        <h1 className="font-display text-2xl font-bold">Couldn&apos;t load this request</h1>
        <p className="text-sm text-urgent">{load.message}</p>
        <p className="text-sm text-zinc-600">The request may have expired. Go back to your AI and start the connection again.</p>
      </div>
    );
  }
  if (load.state !== "ready") return <div className="mx-auto h-60 max-w-xl animate-pulse rounded-2xl bg-zinc-100" aria-label={load.state === "redirecting" ? "Returning to your AI" : "Loading"} />;

  const senior = student.plan.key === "senior";
  const { client, redirect_uri } = load.details;
  const host = redirectHost(redirect_uri);
  return (
    <div className={card}>
      <h1 className="font-display text-2xl font-bold">Connect {client.name} to College Tracker?</h1>
      <p className="text-sm text-zinc-600">
        Signed in as <span className="font-medium">{student.auth.email}</span>. If you approve, {client.name} can use your tracker data until you disconnect it on the Connect AI page.
      </p>
      <div className={`rounded-lg border p-3 text-sm ${toneClass("soon")}`}>
        <p>
          After you allow, you&apos;ll be sent back to: <strong className="break-all text-base">{host ?? redirect_uri}</strong>
        </p>
        {client.uri && <p className="mt-1 break-all text-xs">App website: {client.uri}</p>}
        <p className="mt-1 text-xs">Only allow if you started this from ChatGPT or Claude yourself.</p>
      </div>
      <div className="grid gap-4 text-sm sm:grid-cols-2">
        <div>
          <h2 className="font-semibold">It can</h2>
          <ul className="mt-1 space-y-1.5">
            {AI_CAN.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-done">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="font-semibold">It can&apos;t</h2>
          <ul className="mt-1 space-y-1.5">
            {AI_CANNOT.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-urgent">✕</span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {!senior && (
        <p className={`rounded-md border p-3 text-sm ${toneClass("soon")}`}>
          Connect AI is a Senior plan feature and you&apos;re on the {student.plan.name} plan.{" "}
          <Link href="/pricing" className="font-semibold underline">
            Upgrade
          </Link>
          , then start the connection again.
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className={buttonClass("primary")}
          disabled={!senior || busy != null}
          onClick={() => decide(true)}
        >
          {busy === "approve" ? "Approving…" : "Approve"}
        </button>
        <button
          className={buttonClass("secondary")}
          disabled={busy != null}
          onClick={() => decide(false)}
        >
          {busy === "deny" ? "Declining…" : "Deny"}
        </button>
      </div>
    </div>
  );
}
