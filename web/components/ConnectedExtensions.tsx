"use client";

import { useEffect, useState } from "react";
import { listExtensionTokens, revokeExtensionToken, type ExtensionToken } from "@/lib/extension-api";
import { fmtDate } from "@/lib/format";
import { buttonClass } from "@/lib/ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");
const day = (iso: string) => fmtDate(iso.slice(0, 10));
const isActive = (t: ExtensionToken) => !t.revokedAt && new Date(t.expiresAt).getTime() > Date.now();

/** Student settings: browser extensions that can read the transcript. Renders nothing when none are connected. */
export function ConnectedExtensions() {
  const [tokens, setTokens] = useState<ExtensionToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listExtensionTokens().then(
      (t) => live && setTokens(t.filter(isActive)),
      (e) => live && setError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, []);

  async function disconnect(t: ExtensionToken) {
    setBusy(t.id);
    setError(null);
    try {
      await revokeExtensionToken(t.id);
      setTokens((cur) => cur && cur.filter((x) => x.id !== t.id));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const active = tokens ?? [];
  if (active.length === 0 && !error) return null;

  return (
    <section id="extensions" aria-labelledby="extensions-heading" className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6">
      <h2 id="extensions-heading" className="mb-1 text-xl font-bold">Connected extensions</h2>
      <p className="mb-3 text-sm text-zinc-500">These can read your transcript (schools, courses, grades) and nothing else.</p>
      {error && (
        <p role="alert" className="mb-2 text-sm text-urgent">
          {error}
        </p>
      )}
      <ul className="divide-y divide-zinc-100">
        {active.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium">{t.label}</p>
              <p className="text-zinc-500">
                Connected {day(t.createdAt)} · {t.lastUsedAt ? `Last used ${day(t.lastUsedAt)}` : "Not used yet"}
              </p>
            </div>
            <button type="button" className={buttonClass("secondary", "sm")} disabled={busy === t.id} onClick={() => disconnect(t)}>
              {busy === t.id ? "Disconnecting…" : "Disconnect"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
