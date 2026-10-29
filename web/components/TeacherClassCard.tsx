"use client";

import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { ActionsMenu, type MenuAction } from "@/components/teacher/ActionsMenu";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { buttonClass } from "@/lib/ui";
import { archiveClass, newCode, revokeCode, type LinkedStudent, type TeacherClass } from "@/lib/links-api";

export const btn = buttonClass("ghost", "sm");

/** Runs an action, then the parent reloads. */
export type Run = (fn: () => Promise<unknown>) => void;

/** A live code's own actions, for a "⋯" menu: New code (asks first, the old code stops working) and Turn code off. */
export function codeActions(t: TFunction, code: string | null, onNew: () => void, onOff: () => void): MenuAction[] {
  if (!code) return [];
  return [
    { label: t("teacher.classes.newCode"), onSelect: () => confirm(t("teacher.classes.renewConfirm")) && onNew() },
    { label: t("teacher.classes.turnOff"), onSelect: onOff },
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

/** A join code as a large printed ticket with Copy beside it; New code / Turn code off live in the card's "⋯" menu. */
export function CodeBox({ code, expiresAt, now, busy, turnOnLabel, subject, onNew }: CodeBoxProps) {
  const t = useT();
  const [copied, setCopied] = useState(false);

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

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatCode(code ?? ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked: the code is on screen to read out.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* The code as a printed ticket: display face, wide tracking, a dashed edge to tear along. */}
      <span
        className={`rounded-xl border border-dashed border-zinc-300 px-3 py-1 font-display text-2xl font-bold tracking-[0.14em] tabular-nums ${expired ? "text-zinc-500 line-through" : "text-ink"}`}
      >
        {formatCode(code)}
      </span>
      {expired && <StatusPill tone="soon">{t("teacher.classes.expired")}</StatusPill>}
      <button type="button" className={btn} aria-label={subject ? t("teacher.classes.copyFor", { name: subject }) : t("teacher.classes.copyOwn")} onClick={copy}>
        {t("common.copy")}
      </button>
      <span role="status" className="text-sm text-zinc-500">
        {copied ? t("common.copied") : ""}
      </span>
    </div>
  );
}

type ClassCardProps = { cls: TeacherClass; members: LinkedStudent[]; now: number; busy: boolean; run: Run };

/** One class: name, the code with Copy, one "⋯" menu (new code, code off, archive) and how many students it has. */
export function ClassCard({ cls, members, now, busy, run }: ClassCardProps) {
  const t = useT();

  const actions: MenuAction[] = [
    ...codeActions(
      t,
      cls.code,
      () => run(() => newCode("class", cls.id)),
      () => run(() => revokeCode("class", cls.id)),
    ),
    {
      label: t("teacher.classes.archive"),
      danger: true,
      onSelect: () => confirm(t("teacher.classes.archiveConfirm", { name: cls.name })) && run(() => archiveClass(cls.id, true)),
    },
  ];

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold [overflow-wrap:anywhere]">{cls.name}</h3>
          {cls.schoolYear && <p className="text-sm text-zinc-500">{cls.schoolYear}</p>}
        </div>
        {cls.archived ? (
          <button type="button" disabled={busy} className={btn} aria-label={t("teacher.classes.restoreAria", { name: cls.name })} onClick={() => run(() => archiveClass(cls.id, false))}>
            {t("teacher.classes.restore")}
          </button>
        ) : (
          <ActionsMenu label={t("teacher.menu.more", { name: cls.name })} actions={actions} disabled={busy} />
        )}
      </div>
      {!cls.archived && (
        <CodeBox
          code={cls.code}
          expiresAt={cls.codeExpiresAt}
          now={now}
          busy={busy}
          turnOnLabel={t("teacher.classes.turnOn")}
          subject={cls.name}
          onNew={() => run(() => newCode("class", cls.id))}
        />
      )}
      {/* Who is in the class lives in the linked-students list below (each row says its classes), so the card only counts. */}
      <p className="mt-auto text-sm text-zinc-600">{t(members.length === 1 ? "teacher.classes.memberCount.one" : "teacher.classes.memberCount.other", { n: members.length })}</p>
    </li>
  );
}
