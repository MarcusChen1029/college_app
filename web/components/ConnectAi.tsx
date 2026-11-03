"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { AccessLists } from "@/components/ai-access/AccessLists";
import { AiDataNote } from "@/components/AiDataNote";
import { AiPlanTable } from "@/components/AiPlanTable";
import { AGE_RULES } from "@/lib/ai-plans";
import { AI_EXAMPLES, AI_TRIAL_WRITES, MCP_PATH, PUBLIC_MCP_PATH } from "@/lib/connect-ai";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { useAiTrial } from "@/lib/use-ai-trial";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass, PAGE_INTRO, PAGE_TITLE, PANEL } from "@/lib/ui";
import { GoogleSignIn } from "./GoogleSignIn";

const noop = () => () => {};
const button = buttonClass("primary", "sm");
// A block's own heading on this screen: the display face at 20px, one step under the page title.
const BLOCK_TITLE = "font-display text-xl font-bold tracking-tight text-ink";
// Two blocks side by side on a wide screen, stacked on a phone (the main block and the smaller one beside it).
const TWO_COL = "grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]";

/** The address as this site is actually served (localhost, preview or production); the bare path while rendering on the server. */
const useAddress = (path: string) => useSyncExternalStore(noop, () => `${window.location.origin}${path}`, () => path);

function useCopy(text: string) {
  const [copied, setCopied] = useState<"copied" | "failed" | null>(null);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      setCopied("failed");
    }
  };
  return [copied, copy] as const;
}

/**
 * /connect-ai, for everyone: the free way first (Copy for AI works with any chatbot), then what connecting does, how, which AI
 * plans can, and what data and ages are involved. A signed-in pass holder gets their own connector address (at the top) and the
 * list of connected apps; so does a signed-in Free student while the free trial is on (the database counter answers, migration
 * 0051), with a box saying how many of the free changes are left. Everyone else (signed out, a teacher, a Free account on a
 * database without the counter) gets the way there (sign in, the pass) below the explanation. `copy` is the copy-as-text card
 * and the ready-made questions (rendered by the page, it reads server data).
 */
export function ConnectAi({ copy }: { copy?: ReactNode }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const ready = mounted && student.ready;
  const senior = student.plan.key === "senior"; // the plan in force today (store: pass windows, Taipei date)
  const freeStudent = ready && !!student.auth && student.role === "student" && !senior;
  const trial = useAiTrial(freeStudent);
  // Their own address at the top: a pass holder, or a Free student whose trial counter is readable (the skeleton holds the place while it loads).
  const trialOn = freeStudent && trial.state !== "unavailable";
  const hasAddress = ready && !!student.auth && (senior || trialOn);

  // The visitor's own way in: the address with the pass (or with the trial); sign-in or the pass panel without it. The list of
  // connected apps follows every signed-in account: an app approved during a pass keeps its grant after the pass ends, and can still be removed.
  const status = !ready ? (
    <div className={`h-72 animate-pulse ${PANEL}`} />
  ) : (
    <div className={TWO_COL}>
      {!student.auth ? (
        <section aria-labelledby="connect-signin" className={`${PANEL} space-y-4 p-6 sm:p-8`}>
          <h2 id="connect-signin" className={BLOCK_TITLE}>
            {t("misc.connect.signInTitle")}
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.signInBody")}</p>
          <GoogleSignIn returnTo="/connect-ai" />
        </section>
      ) : senior ? (
        <Setup />
      ) : trial.state === "ready" && freeStudent ? (
        <div className="space-y-6">
          <Setup />
          <TrialBox left={trial.left} />
        </div>
      ) : trialOn ? (
        <div className={`h-72 animate-pulse ${PANEL}`} />
      ) : (
        <section aria-labelledby="connect-pass" className="space-y-4 rounded-3xl bg-blue-50 p-6 sm:p-8">
          <h2 id="connect-pass" className={BLOCK_TITLE}>
            {t("misc.connect.seniorTitle")}
          </h2>
          <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.seniorBody", { name: t(`payments.planName.${student.plan.key}`) })}</p>
          <Link href="/pricing" className={buttonClass("primary")}>
            {t("misc.connect.seePlans")}
          </Link>
        </section>
      )}
      {student.auth && <Connected />}
    </div>
  );

  return (
    <div className="space-y-10">
      <div className="space-y-3">
        <h1 className={PAGE_TITLE}>{t("misc.connect.title")}</h1>
        <p className={PAGE_INTRO}>{t("misc.connect.intro")}</p>
      </div>

      {hasAddress && status}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <NoSetup />
        <div className="space-y-6">{copy}</div>
      </div>

      <section aria-labelledby="connect-say" className={`${PANEL} p-6`}>
        <h2 id="connect-say" className={BLOCK_TITLE}>
          {t("misc.connect.examplesTitle")}
        </h2>
        <ul className="mt-4 grid gap-x-8 gap-y-3 md:grid-cols-2">
          {AI_EXAMPLES.map((e, i) => (
            <li key={e} className="text-[17px] leading-snug text-ink">
              &ldquo;{t(`misc.connect.ex.${i}` as MessageKey) || e}&rdquo;
            </li>
          ))}
        </ul>
      </section>

      <AccessLists canTitle={t("misc.connect.canTitle")} cannotTitle={t("misc.connect.cannotTitle")} />

      <Steps hasAddress={hasAddress} />

      <div className={TWO_COL}>
        <AiPlanTable />
        <AiDataNote />
      </div>

      {!hasAddress && status}
    </div>
  );
}

/** The free way in, first for everyone: no account, no plan, no age check on our side. Its button scrolls to the questions (`#ai`). */
function NoSetup() {
  const t = useT();
  return (
    <section aria-labelledby="connect-nosetup" className="space-y-4 rounded-3xl bg-blue-50 p-6 sm:p-8">
      <h2 id="connect-nosetup" className={BLOCK_TITLE}>
        {t("misc.connect.noSetupTitle")}
      </h2>
      <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.noSetupBody")}</p>
      <p className="max-w-xl text-base leading-relaxed text-ink">{t("misc.connect.noSetupNote")}</p>
      <a href="#ai" className={buttonClass("primary")}>
        {t("misc.connect.noSetupCta")}
      </a>
    </section>
  );
}

/** A Free student's trial: how many of the free changes are left, and the way to the pass. Reads are never limited. */
function TrialBox({ left }: { left: number }) {
  const t = useT();
  const open = left > 0;
  return (
    <section aria-labelledby="connect-trial" className="space-y-3 rounded-3xl bg-blue-50 p-6 sm:p-8">
      <h2 id="connect-trial" className={BLOCK_TITLE}>
        {open ? t("misc.connect.trialTitle", { n: AI_TRIAL_WRITES }) : t("misc.connect.trialUsedTitle", { n: AI_TRIAL_WRITES })}
      </h2>
      {open && <p className="text-base font-semibold text-ink">{t("misc.connect.trialLeft", { left, n: AI_TRIAL_WRITES })}</p>}
      <p className="max-w-xl text-base leading-relaxed text-ink">{open ? t("misc.connect.trialBody", { n: AI_TRIAL_WRITES }) : t("misc.connect.trialUsedBody")}</p>
      <Link href="/pricing" className={buttonClass(open ? "secondary" : "primary")}>
        {t("misc.connect.seePlans")}
      </Link>
    </section>
  );
}

/** A student's own connector address (a pass holder, or a Free student on the trial): the ticket the student hands their AI. */
function Setup() {
  const t = useT();
  const url = useAddress(MCP_PATH);
  const [copied, copy] = useCopy(url);
  return (
    <section aria-labelledby="connect-setup" className="space-y-6">
      <h2 id="connect-setup" className={BLOCK_TITLE}>
        {t("misc.connect.setupTitle")}
      </h2>
      {/* The body holds the address, the stub is where it is copied. */}
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
    </section>
  );
}

/** The steps in Claude and ChatGPT, the same for everyone, and the public address that needs no account. */
function Steps({ hasAddress }: { hasAddress: boolean }) {
  const t = useT();
  const claudeAge = AGE_RULES.find((a) => a.vendor === "Claude")?.minAge ?? "";
  return (
    <section aria-labelledby="connect-steps" className={`${PANEL} space-y-6 p-6`}>
      <div className="space-y-1.5">
        <h2 id="connect-steps" className={BLOCK_TITLE}>
          {t("misc.connect.stepsTitle")}
        </h2>
        <p className="text-base leading-relaxed text-ink">{hasAddress ? t("misc.connect.stepsHave") : t("misc.connect.stepsNeed")}</p>
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
          <p className="mt-3 text-sm text-zinc-600">{t("misc.connect.claude.note", { age: claudeAge })}</p>
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

      <PublicAddress />
    </section>
  );
}

/** The no-account lookup connector: college facts with sources, nothing from anyone's list. The same for every visitor. */
function PublicAddress() {
  const t = useT();
  const url = useAddress(PUBLIC_MCP_PATH);
  const [copied, copy] = useCopy(url);
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-sm font-semibold text-ink">{t("misc.connect.publicLabel")}</p>
      <code className="mt-1 block text-base font-semibold text-ink [overflow-wrap:anywhere]">{url}</code>
      <p className="mt-1 text-sm leading-snug text-zinc-700">{t("misc.connect.publicLine")}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className={buttonClass("secondary", "sm")} onClick={copy}>
          {t("common.copy")}
        </button>
        {copied && (
          <span role="status" className="text-sm font-semibold text-ink">
            {copied === "copied" ? t("misc.connect.copied") : t("misc.connect.copyFailed")}
          </span>
        )}
      </div>
    </div>
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
