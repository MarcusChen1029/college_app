"use client";

import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { buttonClass } from "@/lib/ui";
import { archiveClass, newCode, removeFromClass, revokeCode, type LinkedStudent, type TeacherClass } from "@/lib/links-api";

export const btn = buttonClass("ghost", "sm");

/** Runs an action, then the parent reloads. */
export type Run = (fn: () => Promise<unknown>) => void;

type CodeBoxProps = {
  code: string | null;
  expiresAt: string | null;
  /** Page-load time in ms, so "expired" is not computed during render. */
  now: number;
  busy: boolean;
  turnOnLabel: string;
  /** Class name for screen-reader button names; omit for the one-on-one code. */
  subject?: string;
  onNew: () => void;
  onOff: () => void;
};

/** A join code as a large printed ticket with Copy / New code / Turn code off (or Turn code on when it is off). */
export function CodeBox({ code, expiresAt, now, busy, turnOnLabel, subject, onNew, onOff }: CodeBoxProps) {
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

  function renew() {
    if (confirm(t("teacher.classes.renewConfirm"))) onNew();
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
        <button type="button" className={btn} aria-label={subject ? t("teacher.classes.copyFor", { name: subject }) : t("teacher.classes.copyOwn")} onClick={copy}>
          {t("common.copy")}
        </button>
        <span role="status" className="text-sm text-zinc-500">
          {copied ? t("common.copied") : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={btn}
          aria-label={subject ? t("teacher.classes.newCodeFor", { name: subject }) : t("teacher.classes.newCodeOwn")}
          onClick={renew}
        >
          {t("teacher.classes.newCode")}
        </button>
        <button type="button" disabled={busy} className={btn} aria-label={subject ? t("teacher.classes.turnOffFor", { name: subject }) : t("teacher.classes.turnOffOwn")} onClick={onOff}>
          {t("teacher.classes.turnOff")}
        </button>
      </div>
    </div>
  );
}

type ClassCardProps = { cls: TeacherClass; members: LinkedStudent[]; now: number; busy: boolean; run: Run };

/** One class: name, code controls, archive, and an expandable member list. Archived classes show Restore only. */
export function ClassCard({ cls, members, now, busy, run }: ClassCardProps) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">{cls.name}</h3>
          {cls.schoolYear && <p className="text-sm text-zinc-500">{cls.schoolYear}</p>}
        </div>
        {cls.archived ? (
          <button type="button" disabled={busy} className={btn} aria-label={t("teacher.classes.restoreAria", { name: cls.name })} onClick={() => run(() => archiveClass(cls.id, false))}>
            {t("teacher.classes.restore")}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={btn}
            aria-label={t("teacher.classes.archiveAria", { name: cls.name })}
            onClick={() => confirm(t("teacher.classes.archiveConfirm", { name: cls.name })) && run(() => archiveClass(cls.id, true))}
          >
            {t("teacher.classes.archive")}
          </button>
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
          onOff={() => run(() => revokeCode("class", cls.id))}
        />
      )}
      <div className="mt-auto">
        <button
          type="button"
          aria-expanded={open}
          aria-label={t(open ? "teacher.classes.hideStudentsAria" : "teacher.classes.showStudentsAria", { n: members.length, name: cls.name })}
          className="text-sm font-semibold text-blue-700 underline underline-offset-4" onClick={() => setOpen(!open)}>
          {t(open ? "teacher.classes.hideStudents" : "teacher.classes.showStudents", { n: members.length })}
        </button>
        {open &&
          (members.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">{cls.archived ? t("teacher.classes.noStudentsArchived") : t("teacher.classes.noStudentsYet")}</p>
          ) : (
            <ul className="mt-2 divide-y divide-zinc-100">
              {members.map((s) => (
                <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium">{s.displayName}</span> <span className="text-zinc-500">{s.email}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    className={btn}
                    aria-label={t("teacher.classes.removeFromAria", { student: s.displayName, class: cls.name })}
                    onClick={() => confirm(t("teacher.classes.removeFromConfirm", { student: s.displayName, class: cls.name })) && run(() => removeFromClass(cls.id, s.studentId))}
                  >
                    {t("teacher.classes.removeFromClass")}
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </li>
  );
}
