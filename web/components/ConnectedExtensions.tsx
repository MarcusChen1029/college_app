"use client";

import { useEffect, useState } from "react";
import { listExtensionTokens, revokeExtensionToken, type ExtensionToken } from "@/lib/extension-api";
import { fmtDate } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";

const day = (iso: string) => fmtDate(iso.slice(0, 10));
const isActive = (t: ExtensionToken) => !t.revokedAt && new Date(t.expiresAt).getTime() > Date.now();

/** Student settings: browser extensions that can read the transcript. Renders nothing when none are connected. */
export function ConnectedExtensions() {
  const t = useT();
  const [tokens, setTokens] = useState<ExtensionToken[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listExtensionTokens().then(
      (list) => live && setTokens(list.filter(isActive)),
      (e) => live && setError(e instanceof Error ? e.message : t("common.tryAgain")),
    );
    return () => {
      live = false;
    };
  }, [t]);

  async function disconnect(token: ExtensionToken) {
    setBusy(token.id);
    setError(null);
    try {
      await revokeExtensionToken(token.id);
      setTokens((cur) => cur && cur.filter((x) => x.id !== token.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("common.tryAgain"));
    } finally {
      setBusy(null);
    }
  }

  const active = tokens ?? [];
  if (active.length === 0 && !error) return null;

  return (
    <section id="extensions" aria-labelledby="extensions-heading" className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6">
      <h2 id="extensions-heading" className="mb-1 text-xl font-bold">{t("settings.ext.title")}</h2>
      <p className="mb-3 text-sm text-zinc-500">{t("settings.ext.intro")}</p>
      {error && (
        <p role="alert" className="mb-2 text-sm text-urgent">
          {error}
        </p>
      )}
      <ul className="divide-y divide-zinc-100">
        {active.map((token) => (
          <li key={token.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
            <div>
              <p className="font-medium">{token.label}</p>
              <p className="text-zinc-500">
                {t("settings.ext.connected", { date: day(token.createdAt) })} ·{" "}
                {token.lastUsedAt ? t("settings.ext.lastUsed", { date: day(token.lastUsedAt) }) : t("settings.ext.notUsed")}
              </p>
            </div>
            <button type="button" className={buttonClass("secondary", "sm")} disabled={busy === token.id} onClick={() => disconnect(token)}>
              {busy === token.id ? t("settings.ext.disconnecting") : t("settings.ext.disconnect")}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
