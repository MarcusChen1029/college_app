"use client";

import { useEffect, useState } from "react";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { fmtDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { createShareLink, listShareLinks, revokeShareLink, type ShareLink } from "@/lib/share-api";
import { shareUrl, type ShareKind } from "@/lib/share-links";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const COPY: Record<ShareKind, { heading: MessageKey; intro: MessageKey; create: MessageKey }> = {
  parent: { heading: "settings.share.parentHeading", intro: "settings.share.parentIntro", create: "settings.share.parentCreate" },
  portfolio: { heading: "settings.share.portfolioHeading", intro: "settings.share.portfolioIntro", create: "settings.share.portfolioCreate" },
};

/** Create / copy / turn off the one active share link of a kind. Students only; the caller checks the role. */
export function ShareLinkPanel({ kind, id, layout = "card" }: { kind: ShareKind; id?: string; layout?: "card" | "row" }) {
  const t = useT();
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [url, setUrl] = useState<string | null>(null); // only right after creating; the token is never stored
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = COPY[kind];
  const errMsg = (e: unknown) => (e instanceof Error ? e.message : t("common.tryAgain"));

  useEffect(() => {
    let live = true;
    listShareLinks(kind).then(
      (l) => live && setLinks(l),
      (e) => live && setError(e instanceof Error ? e.message : t("common.tryAgain")),
    );
    return () => {
      live = false;
    };
  }, [kind, t]);

  const active = links?.find((l) => !l.revokedAt && !l.expired) ?? null;
  // The newest link ran out on its own (180 days) rather than being turned off: say so next to the create button.
  const lapsed = !active && links?.[0] && !links[0].revokedAt && links[0].expired ? links[0] : null;

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const token = await createShareLink(kind);
      setUrl(shareUrl(window.location.origin, kind, token));
      setLinks(await listShareLinks(kind));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(link: ShareLink) {
    setBusy(true);
    setError(null);
    try {
      await revokeShareLink(link.id);
      setUrl(null);
      setLinks(await listShareLinks(kind));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(t("settings.share.copyFailed"));
    }
  }

  // lib/share-links.ts lastViewedText, in the visitor's language.
  const lastViewed = (iso: string | null | undefined) =>
    iso ? t("settings.share.lastOpened", { date: fmtDate(iso.slice(0, 10)) }) : t("settings.share.neverOpened");

  const body = (
    <>
      {error && (
        <p role="alert" className="mb-2 text-sm text-urgent">
          {error}
        </p>
      )}
      {links === null && !error ? (
        <div className="h-10 animate-pulse rounded-lg bg-zinc-100" />
      ) : (
        <div className="space-y-3 text-sm">
          {url && (
            <div className="space-y-2">
              <label className="block font-medium" htmlFor={`share-${kind}-url`}>
                {t("settings.share.yourLink")}
              </label>
              <div className="flex flex-wrap gap-2">
                <input
                  id={`share-${kind}-url`}
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 font-mono text-xs"
                />
                <button type="button" className={buttonClass("primary", "sm")} onClick={copy}>
                  {copied ? t("common.copied") : t("common.copy")}
                </button>
              </div>
            </div>
          )}
          {active ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-zinc-600">
                {t("settings.share.onSince", { date: fmtDate(active.createdAt.slice(0, 10)) })} · {lastViewed(active.lastViewedAt)}
                {active.expiresAt && <> · {t("settings.share.expires", { date: fmtDate(active.expiresAt.slice(0, 10)) })}</>}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={create}>
                  {t("settings.share.newLink")}
                </button>
                <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => revoke(active)}>
                  {t("settings.share.turnOff")}
                </button>
              </div>
            </div>
          ) : (
            <>
              {lapsed?.expiresAt && <p className="text-zinc-600">{t("settings.share.expired", { date: fmtDate(lapsed.expiresAt.slice(0, 10)) })}</p>}
              <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={create}>
                {busy ? t("settings.share.creating") : t(text.create)}
              </button>
            </>
          )}
          {active && !url && <p className="text-xs text-zinc-500">{t("settings.share.lost")}</p>}
        </div>
      )}
    </>
  );
  if (layout === "row") {
    return (
      <SettingsRow id={id} headingId={`share-${kind}-heading`} title={t(text.heading)} description={<p>{t(text.intro)}</p>} className="print:hidden">
        {body}
      </SettingsRow>
    );
  }
  return (
    <section id={id} aria-labelledby={`share-${kind}-heading`} className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6 print:hidden">
      <h2 id={`share-${kind}-heading`} className="mb-1 text-xl font-bold">
        {t(text.heading)}
      </h2>
      <p className="mb-3 text-sm text-zinc-500">{t(text.intro)}</p>
      {body}
    </section>
  );
}

/** The résumé page's portfolio control: only for a signed-in student (links live in the account). */
export function PortfolioShare() {
  const { auth, role } = useStudent();
  if (!auth || role !== "student") return null;
  return <ShareLinkPanel kind="portfolio" id="share" />;
}
