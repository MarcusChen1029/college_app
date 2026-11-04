"use client";

import { useState } from "react";
import { ShowCodeDialog } from "@/components/classroom/ShowCodeDialog";
import { StatusPill } from "@/components/StatusPill";
import type { MenuAction } from "@/components/teacher/ActionsMenu";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { inviteUrl } from "@/lib/join-invite";
import { buttonClass } from "@/lib/ui";

export const btn = buttonClass("ghost", "sm");

/** Runs an action, then the parent reloads; then (optional) runs after both, e.g. to put focus back. */
export type Run = (fn: () => Promise<unknown>, then?: () => void) => void;

/** A live code's own actions, for a "⋯" menu: New code (asks first, the old code stops working) and Turn code off. */
export function codeActions(t: TFunction, code: string | null, onNew: () => void, onOff: () => void): MenuAction[] {
  if (!code) return [];
  return [
    { id: "new-code", label: t("teacher.classes.newCode"), onSelect: () => confirm(t("teacher.classes.renewConfirm")) && onNew() },
    { id: "code-off", label: t("teacher.classes.turnOff"), onSelect: onOff },
  ];
}

type CodeBoxProps = {
  code: string | null;
  expiresAt: string | null;
  /** Page-load time in ms, so "expired" is not computed during render. */
  now: number;
  busy: boolean;
  turnOnLabel: string;
  /** Class name for screen-reader button names; omit for the one-on-one code. */
  subject?: string;
  /** Turns the code on when it is off (the only action shown then). */
  onNew: () => void;
};

/** What the status line beside the code says: a copy that worked (and which one), or one the browser refused. */
type Flash = "code" | "link" | "failed";

/**
 * A join code as a large printed ticket with Copy beside it, then Copy invite link and Show on screen (a full-screen code
 * for a projector); New code / Turn code off live in the card's "⋯" menu. The invite link is built from this page's own
 * address when it is clicked, so it works on localhost and on the live site.
 */
export function CodeBox({ code, expiresAt, now, busy, turnOnLabel, subject, onNew }: CodeBoxProps) {
  const t = useT();
  const [flash, setFlash] = useState<Flash | null>(null);
  const [screenUrl, setScreenUrl] = useState<string | null>(null);

  if (!code) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-500">{t("teacher.classes.codeOff")}</p>
        <button type="button" disabled={busy} className={btn} aria-label={subject ? t("teacher.classes.turnOnFor", { name: subject }) : undefined} onClick={onNew}>
          {turnOnLabel}
        </button>
      </div>
    );
  }

  const expired = expiresAt !== null && Date.parse(expiresAt) < now;

  async function copy(text: string, kind: "code" | "link") {
    try {
      await navigator.clipboard.writeText(text);
      setFlash(kind);
      setTimeout(() => setFlash(null), 1500);
    } catch {
      // Clipboard blocked: the status line says so, and Show on screen puts the code and the link in big type.
      setFlash("failed");
      setTimeout(() => setFlash(null), 5000);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {/* The code as a printed ticket: display face, wide tracking, a dashed edge to tear along. */}
        <span
          className={`rounded-xl border border-dashed border-zinc-300 px-3 py-1 font-display text-2xl font-bold tracking-[0.14em] tabular-nums ${expired ? "text-zinc-500 line-through" : "text-ink"}`}
        >
          {formatCode(code)}
        </span>
        {expired && <StatusPill tone="soon">{t("teacher.classes.expired")}</StatusPill>}
        <button type="button" className={btn} aria-label={subject ? t("teacher.classes.copyFor", { name: subject }) : t("teacher.classes.copyOwn")} onClick={() => void copy(formatCode(code), "code")}>
          {t("common.copy")}
        </button>
        <span role="status" className="text-sm text-zinc-500">
          {flash === "code" ? t("common.copied") : flash === "link" ? t("classroom.invite.linkCopied") : flash === "failed" ? t("classroom.invite.copyFailed") : ""}
        </span>
      </div>
      {/* An expired code would only lead students to "that code isn't valid", so it offers neither. */}
      {!expired && (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={btn}
            aria-label={subject ? t("classroom.invite.copyLinkFor", { name: subject }) : t("classroom.invite.copyLinkOwn")}
            onClick={() => void copy(inviteUrl(window.location.origin, code), "link")}
          >
            {t("classroom.invite.copyLink")}
          </button>
          <button
            type="button"
            className={btn}
            aria-label={subject ? t("classroom.invite.showFor", { name: subject }) : t("classroom.invite.showOwn")}
            onClick={() => setScreenUrl(inviteUrl(window.location.origin, code))}
          >
            {t("classroom.invite.show")}
          </button>
        </div>
      )}
      {screenUrl !== null && <ShowCodeDialog code={code} url={screenUrl} label={subject} onClose={() => setScreenUrl(null)} />}
    </div>
  );
}
