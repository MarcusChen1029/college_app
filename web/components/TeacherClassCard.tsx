"use client";

import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { formatCode } from "@/lib/join-codes";
import { archiveClass, newCode, removeFromClass, revokeCode, type LinkedStudent, type TeacherClass } from "@/lib/links-api";

export const btn = "rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-60";

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

/** A join code in large mono text with Copy / New code / Turn code off (or Turn code on when it is off). */
export function CodeBox({ code, expiresAt, now, busy, turnOnLabel, subject, onNew, onOff }: CodeBoxProps) {
  const [copied, setCopied] = useState(false);

  if (!code) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-zinc-500">The join code is off, so nobody can join.</p>
        <button type="button" disabled={busy} className={btn} aria-label={subject ? `Turn code on for ${subject}` : undefined} onClick={onNew}>
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
    if (confirm("The current code will stop working. Make a new one?")) onNew();
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`font-mono text-2xl font-bold tracking-widest ${expired ? "text-zinc-400 line-through" : ""}`}>{formatCode(code)}</span>
        {expired && <StatusPill tone="soon">Expired</StatusPill>}
        <button type="button" className={btn} aria-label={subject ? `Copy code for ${subject}` : "Copy your one-on-one code"} onClick={copy}>
          Copy
        </button>
        <span role="status" className="text-sm text-zinc-500">
          {copied ? "Copied" : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          className={btn}
          aria-label={subject ? `Generate a new code for ${subject}` : "Generate a new code to replace your one-on-one code"}
          onClick={renew}
        >
          New code
        </button>
        <button type="button" disabled={busy} className={btn} aria-label={subject ? `Turn code off for ${subject}` : "Turn code off for your one-on-one code"} onClick={onOff}>
          Turn code off
        </button>
      </div>
    </div>
  );
}

type ClassCardProps = { cls: TeacherClass; members: LinkedStudent[]; now: number; busy: boolean; run: Run };

/** One class: name, code controls, archive, and an expandable member list. Archived classes show Restore only. */
export function ClassCard({ cls, members, now, busy, run }: ClassCardProps) {
  const [open, setOpen] = useState(false);

  return (
    <li className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">{cls.name}</h3>
          {cls.schoolYear && <p className="text-sm text-zinc-500">{cls.schoolYear}</p>}
        </div>
        {cls.archived ? (
          <button type="button" disabled={busy} className={btn} aria-label={`Restore ${cls.name}`} onClick={() => run(() => archiveClass(cls.id, false))}>
            Restore
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            className={btn}
            aria-label={`Archive ${cls.name}`}
            onClick={() => confirm(`Archive "${cls.name}"? Its join code stops working; students stay linked to you.`) && run(() => archiveClass(cls.id, true))}
          >
            Archive
          </button>
        )}
      </div>
      {!cls.archived && (
        <CodeBox
          code={cls.code}
          expiresAt={cls.codeExpiresAt}
          now={now}
          busy={busy}
          turnOnLabel="Turn code on"
          subject={cls.name}
          onNew={() => run(() => newCode("class", cls.id))}
          onOff={() => run(() => revokeCode("class", cls.id))}
        />
      )}
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? "Hide" : "Show"} students (${members.length}) in ${cls.name}`}
          className="text-sm font-semibold text-blue-700 underline underline-offset-4" onClick={() => setOpen(!open)}>
          {open ? "Hide" : "Show"} students ({members.length})
        </button>
        {open &&
          (members.length === 0 ? (
            <p className="mt-2 text-sm text-zinc-500">{cls.archived ? "No students in this class." : "No students yet. Share the code above."}</p>
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
                    aria-label={`Remove from class: ${s.displayName} in ${cls.name}`}
                    onClick={() => confirm(`Remove ${s.displayName} from "${cls.name}"?`) && run(() => removeFromClass(cls.id, s.studentId))}
                  >
                    Remove from class
                  </button>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </li>
  );
}
