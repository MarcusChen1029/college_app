"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { AI_CAN, AI_CANNOT, AI_EXAMPLES, MCP_PATH } from "@/lib/connect-ai";
import { useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass } from "@/lib/ui";
import { GoogleSignIn } from "./GoogleSignIn";

const noop = () => () => {};
const card = "rounded-2xl border border-zinc-200 p-5";
const button = buttonClass("primary", "sm");

export function ConnectAi() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const ready = mounted && student.ready;
  const senior = student.plan.key === "senior";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">{t("misc.connect.title")}</h1>
        <p className="mt-2 text-zinc-600">
          {t("misc.connect.intro")}
        </p>
      </div>

      <section className={card}>
        <h2 className="font-semibold">{t("misc.connect.examplesTitle")}</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          {AI_EXAMPLES.map((e, i) => (
            <li key={e}>&ldquo;{t(`misc.connect.ex.${i}` as MessageKey) || e}&rdquo;</li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">{t("misc.connect.canTitle")}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {AI_CAN.map((text, i) => (
              <li key={text} className="flex gap-2">
                <span className="text-done">✓</span>
                {t(`misc.connect.can.${i}` as MessageKey) || text}
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">{t("misc.connect.cannotTitle")}</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {AI_CANNOT.map((text, i) => (
              <li key={text} className="flex gap-2">
                <span className="text-urgent">✕</span>
                {t(`misc.connect.cannot.${i}` as MessageKey) || text}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!ready ? (
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
      ) : !student.auth ? (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">{t("misc.connect.signInTitle")}</h2>
          <p className="text-sm text-zinc-600">{t("misc.connect.signInBody")}</p>
          <GoogleSignIn returnTo="/connect-ai" />
        </section>
      ) : !senior ? (
        <section className={`${card} space-y-3 border-blue-200 bg-blue-50/50`}>
          <h2 className="font-semibold">{t("misc.connect.seniorTitle")}</h2>
          <p className="text-sm text-zinc-600">{t("misc.connect.seniorBody", { name: student.plan.name })}</p>
          <Link href="/pricing" className={button}>
            {t("misc.connect.seePlans")}
          </Link>
        </section>
      ) : (
        <>
          <Setup />
          <Connected />
        </>
      )}
    </div>
  );
}

function Setup() {
  const t = useT();
  // Built on the client so it is the address this site is actually served from (localhost, preview or production).
  const url = useSyncExternalStore(noop, () => `${window.location.origin}${MCP_PATH}`, () => MCP_PATH);
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };
  return (
    <section className={`${card} space-y-4`}>
      <h2 className="font-semibold">{t("misc.connect.setupTitle")}</h2>
      <div>
        <p className="mb-1 text-sm text-zinc-600">{t("misc.connect.addressLabel")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-zinc-100 px-3 py-2 text-sm break-all">{url}</code>
          <button className={button} onClick={copy}>
            {t("common.copy")}
          </button>
          {copied && (
            <span role="status" className="text-xs text-zinc-500">
              {copied === "copied" ? t("misc.connect.copied") : t("misc.connect.copyFailed")}
            </span>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Claude</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>{t("misc.connect.claude.1")}</li>
          <li>{t("misc.connect.claude.2")}</li>
          <li>{t("misc.connect.claude.3")}</li>
          <li>{t("misc.connect.claude.4")}</li>
        </ol>
        <p className="mt-1 text-xs text-zinc-500">{t("misc.connect.claude.note")}</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">ChatGPT</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>{t("misc.connect.chatgpt.1")}</li>
          <li>{t("misc.connect.chatgpt.2")}</li>
          <li>{t("misc.connect.chatgpt.3")}</li>
        </ol>
        <p className="mt-1 text-xs text-zinc-500">
          {t("misc.connect.chatgpt.note")}
        </p>
      </div>
    </section>
  );
}

type Load = { state: "loading" } | { state: "done"; grants: OAuthGrant[] } | { state: "error"; message: string };

function Connected() {
  const t = useT();
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    browserSupabase()
      .auth.oauth.listGrants()
      .then(({ data, error }) => {
        if (live) setLoad(error ? { state: "error", message: error.message } : { state: "done", grants: data ?? [] });
      })
      .catch((e: Error) => live && setLoad({ state: "error", message: e.message }));
    return () => {
      live = false;
    };
  }, []);

  const disconnect = async (g: OAuthGrant) => {
    if (!window.confirm(t("misc.connect.confirmDisconnect", { name: g.client.name }))) return;
    setBusy(g.client.id);
    setError(null);
    const { error } = await browserSupabase().auth.oauth.revokeGrant({ clientId: g.client.id });
    setBusy(null);
    if (error) setError(error.message);
    else setLoad((l) => (l.state === "done" ? { state: "done", grants: l.grants.filter((x) => x.client.id !== g.client.id) } : l));
  };

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="font-semibold">{t("misc.connect.connectedTitle")}</h2>
      {load.state === "loading" && <div className="h-10 animate-pulse rounded-md bg-zinc-100" />}
      {load.state === "error" && <p className="text-sm text-zinc-500">{t("misc.connect.loadError", { message: load.message })}</p>}
      {load.state === "done" && load.grants.length === 0 && <p className="text-sm text-zinc-500">{t("misc.connect.none")}</p>}
      {load.state === "done" && load.grants.length > 0 && (
        <ul className="divide-y divide-zinc-200 text-sm">
          {load.grants.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium">{g.client.name}</span>
              <span className="text-xs text-zinc-500">{t("misc.connect.connectedOn", { date: new Date(g.granted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) })}</span>
              <button
                className={`ml-auto ${buttonClass("danger", "sm")}`}
                disabled={busy === g.client.id}
                onClick={() => disconnect(g)}
              >
                {busy === g.client.id ? t("misc.connect.disconnecting") : t("misc.connect.disconnect")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-urgent">{error}</p>}
    </section>
  );
}
