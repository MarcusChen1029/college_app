"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { OAuthGrant } from "@supabase/supabase-js";
import { AI_CAN, AI_CANNOT, AI_EXAMPLES, MCP_PATH } from "@/lib/connect-ai";
import { useStudent } from "@/lib/student-store";
import { browserSupabase } from "@/lib/supabase-browser";
import { buttonClass } from "@/lib/ui";
import { GoogleSignIn } from "./AccountPanel";

const noop = () => () => {};
const card = "rounded-2xl border border-zinc-200 p-5";
const button = buttonClass("primary", "sm");

export function ConnectAi() {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const ready = mounted && student.ready;
  const senior = student.plan.key === "senior";

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold">Connect AI</h1>
        <p className="mt-2 text-zinc-600">
          Link your own ChatGPT or Claude to your tracker and update your applications by talking to it. The AI reads and changes the same data the
          website shows, so the two never disagree.
        </p>
      </div>

      <section className={card}>
        <h2 className="font-semibold">Things you can say</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          {AI_EXAMPLES.map((e) => (
            <li key={e}>&ldquo;{e}&rdquo;</li>
          ))}
        </ul>
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <section className={card}>
          <h2 className="font-semibold">What the AI can do</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {AI_CAN.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-done">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </section>
        <section className={card}>
          <h2 className="font-semibold">What it can&apos;t</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {AI_CANNOT.map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-urgent">✕</span>
                {t}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {!ready ? (
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-100" />
      ) : !student.auth ? (
        <section className={`${card} space-y-3`}>
          <h2 className="font-semibold">Sign in to connect</h2>
          <p className="text-sm text-zinc-600">Connect AI works with your account, so your list has to be saved there. Your list and scores in this browser will be saved to it.</p>
          <GoogleSignIn returnTo="/connect-ai" />
        </section>
      ) : !senior ? (
        <section className={`${card} space-y-3 border-blue-200 bg-blue-50/50`}>
          <h2 className="font-semibold">Connect AI is a Senior plan feature</h2>
          <p className="text-sm text-zinc-600">You&apos;re on the {student.plan.name} plan. Switch to Senior to connect ChatGPT or Claude.</p>
          <Link href="/pricing" className={button}>
            See plans
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
      <h2 className="font-semibold">Connect your AI</h2>
      <div>
        <p className="mb-1 text-sm text-zinc-600">Your connector address</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-md bg-zinc-100 px-3 py-2 text-sm break-all">{url}</code>
          <button className={button} onClick={copy}>
            Copy
          </button>
          {copied && (
            <span role="status" className="text-xs text-zinc-500">
              {copied === "copied" ? "Copied." : "Couldn't copy. Select the address and press Ctrl+C."}
            </span>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold">Claude</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Open Claude, then Settings, then Connectors.</li>
          <li>Choose Add custom connector. Name it College Tracker and paste the address above.</li>
          <li>Click Connect. You&apos;ll come back to this site to approve access with your Google account.</li>
          <li>Start a chat and ask &ldquo;What&apos;s on my college list?&rdquo;</li>
        </ol>
        <p className="mt-1 text-xs text-zinc-500">Works on every Claude plan. The Free plan allows one custom connector.</p>
      </div>

      <div>
        <h3 className="text-sm font-semibold">ChatGPT</h3>
        <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-zinc-700">
          <li>Open ChatGPT, then Settings, then Apps &amp; Connectors, and turn on Developer mode if it&apos;s offered.</li>
          <li>Create a connector, paste the address above, and choose OAuth when asked how to sign in.</li>
          <li>Approve access on this site, then enable the connector in a new chat.</li>
        </ol>
        <p className="mt-1 text-xs text-zinc-500">
          Custom connectors that can make changes are limited to some ChatGPT plans (Business, Enterprise and Edu at the time of writing). On Plus and
          Pro the connector may be read-only. That&apos;s a ChatGPT plan limit, not something this site can change, and ChatGPT&apos;s rules change
          often, so check OpenAI&apos;s help pages.
        </p>
      </div>
    </section>
  );
}

type Load = { state: "loading" } | { state: "done"; grants: OAuthGrant[] } | { state: "error"; message: string };

function Connected() {
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
    if (!window.confirm(`Disconnect ${g.client.name}? It will stop being able to read or change your tracker.`)) return;
    setBusy(g.client.id);
    setError(null);
    const { error } = await browserSupabase().auth.oauth.revokeGrant({ clientId: g.client.id });
    setBusy(null);
    if (error) setError(error.message);
    else setLoad((l) => (l.state === "done" ? { state: "done", grants: l.grants.filter((x) => x.client.id !== g.client.id) } : l));
  };

  return (
    <section className={`${card} space-y-3`}>
      <h2 className="font-semibold">Connected AIs</h2>
      {load.state === "loading" && <div className="h-10 animate-pulse rounded-md bg-zinc-100" />}
      {load.state === "error" && <p className="text-sm text-zinc-500">Couldn&apos;t load your connected AIs ({load.message}).</p>}
      {load.state === "done" && load.grants.length === 0 && <p className="text-sm text-zinc-500">Nothing connected yet.</p>}
      {load.state === "done" && load.grants.length > 0 && (
        <ul className="divide-y divide-zinc-200 text-sm">
          {load.grants.map((g) => (
            <li key={g.client.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="font-medium">{g.client.name}</span>
              <span className="text-xs text-zinc-500">connected {new Date(g.granted_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <button
                className={`ml-auto ${buttonClass("danger", "sm")}`}
                disabled={busy === g.client.id}
                onClick={() => disconnect(g)}
              >
                {busy === g.client.id ? "Disconnecting…" : "Disconnect"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-urgent">{error}</p>}
    </section>
  );
}
