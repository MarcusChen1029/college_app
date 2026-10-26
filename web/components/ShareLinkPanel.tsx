"use client";

import { useEffect, useState } from "react";
import { createShareLink, listShareLinks, revokeShareLink, type ShareLink } from "@/lib/share-api";
import { lastViewedText, shareUrl, type ShareKind } from "@/lib/share-links";
import { fmtDate } from "@/lib/format";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong. Please try again.");

const COPY: Record<ShareKind, { heading: string; intro: string; create: string }> = {
  parent: {
    heading: "Share with a parent",
    intro:
      "A read-only page with your college list, plans, deadlines, checklist progress and decisions. It never shows your essays, notes, portal logins, transcript, aid offers or email.",
    create: "Create parent link",
  },
  portfolio: {
    heading: "Share as a portfolio link",
    intro:
      "A public page with your name, school, class year and activities, shown the way this résumé shows them (hours and scores only if they are switched on here). It never shows your email, phone or address.",
    create: "Create portfolio link",
  },
};

/** Create / copy / turn off the one active share link of a kind. Students only; the caller checks the role. */
export function ShareLinkPanel({ kind, id }: { kind: ShareKind; id?: string }) {
  const [links, setLinks] = useState<ShareLink[] | null>(null);
  const [url, setUrl] = useState<string | null>(null); // only right after creating; the token is never stored
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const text = COPY[kind];

  useEffect(() => {
    let live = true;
    listShareLinks(kind).then(
      (l) => live && setLinks(l),
      (e) => live && setError(errMsg(e)),
    );
    return () => {
      live = false;
    };
  }, [kind]);

  const active = links?.find((l) => !l.revokedAt) ?? null;

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
      setError("Couldn't copy. Select the link and copy it yourself.");
    }
  }

  return (
    <section id={id} aria-labelledby={`share-${kind}-heading`} className="scroll-mt-4 rounded-2xl border border-zinc-200 p-6 print:hidden">
      <h2 id={`share-${kind}-heading`} className="mb-1 text-xl font-bold">
        {text.heading}
      </h2>
      <p className="mb-3 text-sm text-zinc-500">{text.intro}</p>
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
                Your link (copy it now: for safety it is shown only once)
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
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}
          {active ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-zinc-600">
                Link on since {fmtDate(active.createdAt.slice(0, 10))} · {lastViewedText(active.lastViewedAt)}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={create}>
                  New link
                </button>
                <button type="button" className={buttonClass("danger", "sm")} disabled={busy} onClick={() => revoke(active)}>
                  Turn off
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className={buttonClass("secondary", "sm")} disabled={busy} onClick={create}>
              {busy ? "Creating…" : text.create}
            </button>
          )}
          {active && !url && <p className="text-xs text-zinc-500">Lost the link? Make a new one; the old link stops working.</p>}
        </div>
      )}
    </section>
  );
}

/** The résumé page's portfolio control: only for a signed-in student (links live in the account). */
export function PortfolioShare() {
  const { auth, role } = useStudent();
  if (!auth || role !== "student") return null;
  return <ShareLinkPanel kind="portfolio" id="share" />;
}
