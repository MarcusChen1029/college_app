"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { AnchorChip } from "@/components/classroom/AnchorChip";
import type { AnchorOption } from "@/components/classroom/anchorOptions";
import { LockIcon } from "@/components/classroom/icons";
import { btn } from "@/components/TeacherClassCard";
import { errorText } from "@/components/TeacherText";
import { anchorKey } from "@/lib/anchors";
import type { AnchorInfo } from "@/lib/classroom";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { addNote, deleteNote, listNotes, NOTE_MAX, updateNote, type TeacherNote } from "@/lib/links-api";
import { filterNotes, noteAbout, noteDate, noteEdited, noteErrorMessage, noteSaveable, type NoteFilter } from "@/lib/notes-view";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";

const area = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
const primary = buttonClass("primary", "sm");

type Run = (fn: () => Promise<unknown>) => Promise<boolean>;

const FILTERS: readonly (readonly [NoteFilter, MessageKey])[] = [
  ["all", "teacher.notes.filter.all"],
  ["general", "teacher.notes.filter.general"],
  ["item", "teacher.notes.filter.item"],
];

/** One note: what it is about, its text (never HTML), when it was written, and Edit / Delete. Edit swaps the text for a textarea. */
function NoteItem({ note, about, studentId, busy, run }: { note: TeacherNote; about: AnchorInfo | null; studentId: string; busy: boolean; run: Run }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const id = useId();
  const when = noteDate(note.createdAt);

  return (
    <li className="space-y-2 rounded-2xl border border-zinc-200 p-4">
      {about && <AnchorChip info={about} role="teacher" studentId={studentId} />}
      {editing ? (
        <div>
          <label htmlFor={id} className="sr-only">
            {t("teacher.notes.editAria", { when })}
          </label>
          <textarea id={id} value={draft} maxLength={NOTE_MAX} rows={4} onChange={(e) => setDraft(e.target.value)} className={area} />
          <p className="mt-1 text-[13px] text-zinc-500">
            {draft.length} / {NOTE_MAX}
          </p>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{note.body}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-zinc-500">
          <time dateTime={note.createdAt}>{when}</time>
          {noteEdited(note.createdAt, note.updatedAt) && <span> {t("teacher.notes.edited")}</span>}
        </p>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                type="button"
                disabled={busy || !noteSaveable(draft, NOTE_MAX)}
                className={btn}
                onClick={() => void run(() => updateNote(note.id, draft))}
              >
                {t("common.save")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                onClick={() => {
                  setEditing(false);
                  setDraft(note.body);
                }}
              >
                {t("common.cancel")}
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} className={btn} aria-label={t("teacher.notes.editAria", { when })} onClick={() => setEditing(true)}>
                {t("common.edit")}
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                aria-label={t("teacher.notes.deleteAria", { when })}
                onClick={() => confirm(t("teacher.notes.confirmDelete")) && void run(() => deleteNote(note.id))}
              >
                {t("common.delete")}
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

const GENERAL_KEY = "general";

/**
 * The teacher's own notes about one student, newest first: only the teacher can read them, so the page says so and has a
 * lock, no conversation and no Send. A note may be about an item (a chip that jumps to it) or about the student in
 * general; the filter shows all, general or item notes. Reloads the list after every change.
 *
 * `options` (teacherAnchorOptions) name the items for the chips and fill the form's "About" list. `preset` starts the form
 * on that item, once; `onPresetUsed` then lets the page forget it.
 */
export function TeacherNotes({
  studentId,
  studentName,
  options = [],
  preset,
  onPresetUsed,
}: {
  studentId: string;
  studentName: string;
  options?: AnchorOption[];
  preset?: AnchorOption | null;
  onPresetUsed?: () => void;
}) {
  const t = useT();
  const [data, setData] = useState<TeacherNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [about, setAbout] = useState(GENERAL_KEY);
  const [filter, setFilter] = useState<NoteFilter>("all");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [usedPreset, setUsedPreset] = useState<AnchorOption | null>(null);
  const id = useId();

  // A note keeps no name for its item: the chip's text comes from the student's record as loaded now.
  const labels = useMemo(() => new Map(options.map((o) => [anchorKey(o.anchor), o.label])), [options]);
  const items = useMemo(() => options.filter((o) => o.anchor.kind !== "general"), [options]);
  const chosen = items.find((o) => anchorKey(o.anchor) === about) ?? null;
  const shown = data ? filterNotes(data, filter) : [];

  if (preset && preset !== usedPreset) {
    setUsedPreset(preset);
    setAbout(anchorKey(preset.anchor));
  } else if (!preset && usedPreset) {
    setUsedPreset(null); // the page has forgotten the request: the same item asked for again is a new request
  }
  useEffect(() => {
    if (preset && preset === usedPreset) onPresetUsed?.();
  }, [preset, usedPreset, onPresetUsed]);

  // The list stays on screen while it reloads, so open edits, typing and focus survive every change.
  const refresh = useCallback(async () => {
    try {
      setData(await listNotes(studentId));
      setError(null);
    } catch (e) {
      setError(noteErrorMessage(e instanceof Error ? e.message : ""));
    }
  }, [studentId]);

  useEffect(() => {
    let live = true;
    listNotes(studentId).then(
      (n) => live && (setData(n), setError(null)),
      (e) => live && setError(noteErrorMessage(e instanceof Error ? e.message : "")),
    );
    return () => {
      live = false;
    };
  }, [studentId]);

  /** Runs a change, then reloads the list. Returns false and shows the error if the change fails. */
  const run: Run = async (fn) => {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(noteErrorMessage(e instanceof Error ? e.message : ""));
      setBusy(false);
      return false;
    }
    await refresh();
    setBusy(false);
    return true;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteSaveable(draft, NOTE_MAX)) return;
    if (await run(() => addNote(studentId, draft, chosen?.anchor ?? null))) {
      setDraft("");
      setAbout(GENERAL_KEY); // the next note is general unless the teacher picks an item again
    }
  }

  return (
    <section className="space-y-4" aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="flex items-center gap-2 font-display text-xl font-bold">
          <LockIcon />
          {t("teacher.notes.heading")}
        </h2>
        <p className="text-sm text-zinc-600">{t("teacher.notes.help")}</p>
      </div>

      {!data ? (
        error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-urgent">
              {errorText(t, error)}
            </p>
            <button type="button" className={btn} onClick={() => void refresh()}>
              {t("teacher.tryAgain")}
            </button>
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : (
        <>
          <form onSubmit={submit} className="space-y-2 rounded-2xl border border-zinc-200 p-4">
            <label htmlFor={`${id}-new`} className="text-sm font-medium">
              {t("teacher.notes.newNote", { name: studentName })}
            </label>
            <textarea id={`${id}-new`} value={draft} maxLength={NOTE_MAX} rows={4} onChange={(e) => setDraft(e.target.value)} className={area} />
            {items.length > 0 && (
              <div className="space-y-1">
                <label htmlFor={`${id}-about`} className="block text-sm font-medium">
                  {t("teacher.notes.about")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
                </label>
                <select id={`${id}-about`} value={chosen ? about : GENERAL_KEY} className={`${FIELD_CLASS} w-full sm:w-auto sm:min-w-64`} onChange={(e) => setAbout(e.target.value)}>
                  <option value={GENERAL_KEY}>{t("classroom.anchor.general")}</option>
                  {items.map((o) => (
                    <option key={anchorKey(o.anchor)} value={anchorKey(o.anchor)}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-zinc-500">
                {draft.length} / {NOTE_MAX}
              </p>
              <button type="submit" disabled={busy || !noteSaveable(draft, NOTE_MAX)} className={primary}>
                {t("teacher.notes.add")}
              </button>
            </div>
          </form>
          {actionError && (
            <p role="alert" className="text-sm text-urgent">
              {errorText(t, actionError)}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-urgent">
              {errorText(t, error)}{" "}
              <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void refresh()}>
                {t("teacher.tryAgain")}
              </button>
            </p>
          )}
          {data.length === 0 ? (
            <p className="text-sm text-zinc-500">{t("teacher.notes.empty")}</p>
          ) : (
            <>
              <div role="radiogroup" aria-labelledby={`${id}-show`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span id={`${id}-show`} className="text-[15px] font-semibold text-ink">
                  {t("teacher.notes.filter.show")}
                </span>
                {FILTERS.map(([value, label]) => (
                  <label key={value} className="inline-flex items-center gap-2 text-[15px] text-ink">
                    <input type="radio" name={`${id}-filter`} className="size-4" checked={filter === value} onChange={() => setFilter(value)} />
                    {t(label)}
                  </label>
                ))}
              </div>
              {shown.length === 0 ? (
                <p className="text-sm text-zinc-500">{t("teacher.notes.emptyFilter")}</p>
              ) : (
                <ul className="space-y-3">
                  {shown.map((n) => (
                    <NoteItem key={n.id} note={n} about={noteAbout(n.anchor, labels)} studentId={studentId} busy={busy} run={run} />
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
