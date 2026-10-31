"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { AccessLists } from "@/components/ai-access/AccessLists";
import { AI_EXAMPLES, MCP_PATH } from "@/lib/connect-ai";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass, PAGE_INTRO, PAGE_TITLE, PANEL } from "@/lib/ui";
import { GoogleSignIn } from "./GoogleSignIn";

const noop = () => () => {};
const button = buttonClass("primary", "sm");
// A block's own heading on this screen: the display face at 20px, one step under the page title.
const BLOCK_TITLE = "font-display text-xl font-bold tracking-tight text-ink";

/**
 * /connect-ai: the job for this visitor first (sign in, get the pass, or the connector address and the steps for Claude
 * and ChatGPT), beside what is connected now, things to say and `copy`, the copy-as-text alternative for students who
 * don't connect (rendered by the page, it reads server data); then what an AI can and can't do.
 */
export function ConnectAi({ copy }: { copy?: ReactNode }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const ready = mounted && student.ready;
  const senior = student.plan.key === "senior"; // the plan in force today (store: pass windows, Taipei date)
  // Beside the setup (with the pass) or beside the sign-in panel (no connected list there); on the free plan it sits
  // under the pass panel, as the case for connecting. Placement only: each column then ends near the other.
  const sayBeside = ready && (!student.auth || senior);
  const say = (
    <section aria-labelledby="connect-say" className={`${PANEL} p-6`}>
      <h2 id="connect-say" className={BLOCK_TITLE}>
        {t("misc.connect.examplesTitle")}
      </h2>
      <ul className="mt-4 space-y-3">
        {AI_EXAMPLES.map((e, i) => (
          <li key={e} className="text-[17px] leading-snug text-ink">
            &ldquo;{t(`misc.connect.ex.${i}` as MessageKey) || e}&rdquo;
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className={PAGE_TITLE}>{t("misc.connect.title")}</h1>
        <p className={PAGE_INTRO}>{t("misc.connect.intro")}</p>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="space-y-6">
          {!ready ? (
            <div className={`h-72 animate-pulse ${PANEL}`} />
          ) : !student.auth ? (
            <section aria-labelledby="connect-signin" className={`${PANEL} space-y-4 p-6 sm:p-8`}>
              <h2 id="connect-signin" className={BLOCK_TITLE}>
                {t("misc.connect.signInTitle")}
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.signInBody")}</p>
              <GoogleSignIn returnTo="/connect-ai" />
            </section>
          ) : !senior ? (
            <section aria-labelledby="connect-pass" className="space-y-4 rounded-3xl bg-blue-50 p-6 sm:p-8">
              <h2 id="connect-pass" className={BLOCK_TITLE}>
                {t("misc.connect.seniorTitle")}
              </h2>
              <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.seniorBody", { name: t(`payments.planName.${student.plan.key}`) })}</p>
              <Link href="/pricing" className={buttonClass("primary")}>
                {t("misc.connect.seePlans")}
              </Link>
            </section>
          ) : (
            <Setup />
          )}
          {!sayBeside && say}
        </div>

        <div className="space-y-6">
          {/* Every plan can still disconnect: an app approved during a pass keeps its grant after the pass ends. */}
          {ready && student.auth && <Connected />}
          {sayBeside && say}
          {copy}
        </div>
      </div>

      <AccessLists canTitle={t("misc.connect.canTitle")} cannotTitle={t("misc.connect.cannotTitle")} />
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
    <section aria-labelledby="connect-setup" className="space-y-6">
      <h2 id="connect-setup" className={BLOCK_TITLE}>
        {t("misc.connect.setupTitle")}
      </h2>
      {/* The address is the ticket the student hands their AI: the body holds it, the stub is where it is copied. */}
      <div>
        <div className="ticket-body bg-blue-100 px-6 pb-7 pt-6 sm:px-8">
          <p className="text-sm font-semibold text-ink">{t("misc.connect.addressLabel")}</p>
          <code className="mt-2 block font-display text-xl font-bold tracking-tight text-ink [overflow-wrap:anywhere] sm:text-2xl">{url}</code>
        </div>
        <div className="ticket-stub flex flex-wrap items-center gap-x-4 gap-y-2 bg-blue-100 px-6 py-4 sm:px-8">
          <button type="button" className={button} onClick={copy}>
            {t("common.copy")}
          </button>
          {copied ? (
            <span role="status" className="text-sm font-semibold text-ink">
              {copied === "copied" ? t("misc.connect.copied") : t("misc.connect.copyFailed")}
            </span>
          ) : (
            <span className="text-sm text-ink">{t("misc.connect.pasteHint")}</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div>
          <h3 className="font-display text-lg font-bold text-ink">Claude</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-base leading-snug text-ink marker:font-semibold">
            <li>{t("misc.connect.claude.1")}</li>
            <li>{t("misc.connect.claude.2")}</li>
            <li>{t("misc.connect.claude.3")}</li>
            <li>{t("misc.connect.claude.4")}</li>
          </ol>
          <p className="mt-3 text-sm text-zinc-600">{t("misc.connect.claude.note")}</p>
        </div>
        <div>
          <h3 className="font-display text-lg font-bold text-ink">ChatGPT</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-base leading-snug text-ink marker:font-semibold">
            <li>{t("misc.connect.chatgpt.1")}</li>
            <li>{t("misc.connect.chatgpt.2")}</li>
            <li>{t("misc.connect.chatgpt.3")}</li>
          </ol>
          <p className="mt-3 text-sm text-zinc-600">{t("misc.connect.chatgpt.note")}</p>
        </div>
      </div>
    </section>
  );
}

type Load = { state: "loading" } | { state: "done"; grants: OAuthGrant[] } | { state: "error"; message: string };

function Connected() {
  const t = useT();
  const locale = useLocale();
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
    <section aria-labelledby="connect-connected" className={`${PANEL} p-6`}>
      <h2 id="connect-connected" className={BLOCK_TITLE}>
        {t("misc.connect.connectedTitle")}
      </h2>
      {load.state === "loading" && <div className="mt-4 h-11 animate-pulse rounded-xl bg-zinc-100" />}
      {load.state === "error" && <p className="mt-3 text-base text-ink">{t("misc.connect.loadError", { message: load.message })}</p>}
      {load.state === "done" && load.grants.length === 0 && <p className="mt-3 text-base text-zinc-700">{t("misc.connect.none")}</p>}
      {load.state === "done" && load.grants.length > 0 && (
        <ul className="mt-3 divide-y divide-zinc-200">
          {load.grants.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{g.client.name}</p>
                <p className="text-sm text-zinc-600">{t("misc.connect.connectedOn", { date: new Date(g.granted_at).toLocaleDateString(locale === "zh-TW" ? "zh-TW" : "en-US", { month: "short", day: "numeric", year: "numeric" }) })}</p>
              </div>
              <button className={buttonClass("ghost", "sm")} disabled={busy === g.client.id} onClick={() => disconnect(g)}>
                {busy === g.client.id ? t("misc.connect.disconnecting") : t("misc.connect.disconnect")}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-sm text-urgent">{error}</p>}
    </section>
  );
}
