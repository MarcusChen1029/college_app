"use client";

import { useEffect, useRef, useState } from "react";
import { classroomError, shortDate } from "@/components/classroom/ClassroomText";
import { ShowCodeDialog } from "@/components/classroom/ShowCodeDialog";
import { StatusPill } from "@/components/StatusPill";
import { ActionsMenu, type MenuAction } from "@/components/teacher/ActionsMenu";
import { NAME_LIMITS, type TeacherPost } from "@/lib/classroom";
import type { TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { formatCode } from "@/lib/join-codes";
import { inviteUrl } from "@/lib/join-invite";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { archiveClass, newCode, renameClass, revokeCode, type LinkedStudent, type TeacherClass } from "@/lib/links-api";

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

/**
 * The class name as a one-field form (Rename). Enter or Save renames it; Esc or Cancel leaves it. A refused name stays in
 * the box with the reason under it. When the rename went through, `run` reloads the page's data and then `onDone` closes
 * the form, so the new name is already on the card.
 */
function RenameForm({ cls, run, onDone }: { cls: TeacherClass; run: Run; onDone: () => void }) {
  const t = useT();
  const field = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(cls.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = name.trim();
    if (!v) return setError(t("teacher.classes.giveName"));
    if (v === cls.name) return onDone();
    setBusy(true);
    setError(null);
    try {
      await renameClass(cls.id, v);
    } catch (err) {
      setError(classroomError(t, err));
      setBusy(false);
      return;
    }
    run(async () => undefined, onDone); // nothing left to do: reload so the card shows the new name, then close
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="min-w-0 flex-1 space-y-2">
      <label className="block text-sm font-medium">
        {t("teacher.classes.className")}
        <input
          ref={field}
          value={name}
          disabled={busy}
          maxLength={NAME_LIMITS.className}
          autoComplete="off"
          className={`${FIELD_CLASS} mt-1 w-full`}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && !busy && onDone()}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
          {busy ? t("common.saving") : t("common.save")}
        </button>
        <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={onDone}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}

/** A class's latest announcement (title, date, who has read it), or a note that there is none yet. */
function ClassPostLine({ post }: { post: TeacherPost | null }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2 text-sm">
      {post ? (
        <>
          <p className="text-[13px] font-medium text-zinc-600">{t("classroom.classPost.latest")}</p>
          <p className="font-semibold text-ink [overflow-wrap:anywhere]">{post.title}</p>
          <p className="text-[13px] text-zinc-600">
            <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
            {" · "}
            {post.audience === 0 ? t("classroom.ann.noAudience") : t("classroom.ann.readBy", { read: post.readCount, total: post.audience })}
          </p>
        </>
      ) : (
        <p className="text-zinc-600">{t("classroom.classPost.none")}</p>
      )}
    </div>
  );
}

type ClassCardProps = {
  cls: TeacherClass;
  /** The name that tells this class apart from a same-named one (year or code added); defaults to its name. */
  label?: string;
  members: LinkedStudent[];
  now: number;
  busy: boolean;
  run: Run;
  /** This class's newest announcement; null when it has none, undefined when announcements could not be loaded (the line is left out). */
  latest?: TeacherPost | null;
  /** Opens the announcement form on this class; omitted for an archived class. */
  onPost?: () => void;
  /** Called after Archive took the card out of its list, so focus can land on the next card. */
  onRemoved?: () => void;
};

/**
 * One class: name, the code with its copy / invite link / show-on-screen buttons, one "⋯" menu (rename, new code, code off,
 * archive), its latest announcement with Post, and how many students it has.
 */
export function ClassCard({ cls, label = cls.name, members, now, busy, run, latest, onPost, onRemoved }: ClassCardProps) {
  const t = useT();
  const card = useRef<HTMLLIElement>(null);
  const [renaming, setRenaming] = useState(false);

  // Closing the rename form puts focus back on the card's "⋯" button (the form it was in is gone).
  function closeRename() {
    setRenaming(false);
    setTimeout(() => card.current?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')?.focus(), 0);
  }

  const actions: MenuAction[] = [
    { id: "rename", label: t("classroom.rename.menu"), onSelect: () => setRenaming(true) },
    ...codeActions(
      t,
      cls.code,
      () => run(() => newCode("class", cls.id)),
      () => run(() => revokeCode("class", cls.id)),
    ),
    {
      id: "archive",
      label: t("teacher.classes.archive"),
      danger: true,
      onSelect: () => confirm(t("teacher.classes.archiveConfirm", { name: label })) && run(() => archiveClass(cls.id, true), onRemoved),
    },
  ];

  return (
    <li ref={card} className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="flex items-start justify-between gap-2">
        {renaming ? (
          <RenameForm cls={cls} run={run} onDone={closeRename} />
        ) : (
          <>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold [overflow-wrap:anywhere]">{cls.name}</h3>
              {cls.schoolYear && <p className="text-sm text-zinc-500">{cls.schoolYear}</p>}
            </div>
            {cls.archived ? (
              <button type="button" disabled={busy} className={btn} aria-label={t("teacher.classes.restoreAria", { name: cls.name })} onClick={() => run(() => archiveClass(cls.id, false))}>
                {t("teacher.classes.restore")}
              </button>
            ) : (
              <ActionsMenu label={t("teacher.menu.more", { name: label })} actions={actions} disabled={busy} />
            )}
          </>
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
      {!cls.archived && latest !== undefined && <ClassPostLine post={latest} />}
      {/* Who is in the class lives in the linked-students list below (each row says its classes), so the card only counts. */}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <p className="text-sm text-zinc-600">{t(members.length === 1 ? "teacher.classes.memberCount.one" : "teacher.classes.memberCount.other", { n: members.length })}</p>
        {!cls.archived && onPost && (
          <button type="button" disabled={busy} className={btn} aria-label={t("classroom.classPost.postAria", { name: label })} onClick={onPost}>
            {t("classroom.classPost.post")}
          </button>
        )}
      </div>
    </li>
  );
}
