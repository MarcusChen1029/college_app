"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AnchorChip } from "@/components/classroom/AnchorChip";
import type { AnchorOption } from "@/components/classroom/anchorOptions";
import { LockIcon } from "@/components/classroom/icons";
import { focusField } from "@/components/classroom/useFocusTarget";
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
    <li data-focus={`note:${note.id}`} className="space-y-2 rounded-2xl border border-zinc-200 p-4">
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
 * on that item, once (filter "All", the form scrolled into view and its text box focused); `onPresetUsed` then lets the
 * page forget it. A note just added is never hidden by the filter. Every note row carries `data-focus="note:<id>"`, so a
 * marker on an item can scroll to it; `reveal` (a new object each time a marker is followed) makes sure the "General"
 * filter is not hiding item notes. `onChanged` runs after a note was added, edited or deleted, so the page can refresh its markers.
 */
export function TeacherNotes({
  studentId,
  studentName,
  options = [],
  preset,
  onPresetUsed,
  reveal,
  onChanged,
}: {
  studentId: string;
  studentName: string;
  options?: AnchorOption[];
  preset?: AnchorOption | null;
  onPresetUsed?: () => void;
  reveal?: object | null;
  onChanged?: () => void;
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
  const [seenReveal, setSeenReveal] = useState<object | null>(null);
  const [focusAsk, setFocusAsk] = useState(0); // goes up each time a preset should bring the form into view
  const newRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();

  // A note keeps no name for its item: the chip's text comes from the student's record as loaded now.
  const labels = useMemo(() => new Map(options.map((o) => [anchorKey(o.anchor), o.label])), [options]);
  const items = useMemo(() => options.filter((o) => o.anchor.kind !== "general"), [options]);
  const chosen = items.find((o) => anchorKey(o.anchor) === about) ?? null;
  const shown = data ? filterNotes(data, filter) : [];

  if (preset && preset !== usedPreset) {
    setUsedPreset(preset);
    setAbout(anchorKey(preset.anchor));
    setFilter("all"); // so the note about to be written shows once it is added
    setFocusAsk((n) => n + 1);
  } else if (!preset && usedPreset) {
    setUsedPreset(null); // the page has forgotten the request: the same item asked for again is a new request
  }
  useEffect(() => {
    if (preset && preset === usedPreset) onPresetUsed?.();
  }, [preset, usedPreset, onPresetUsed]);

  // The pre-filled form into view, its text box focused: once the notes have loaded (the form shows then) and the tab is shown.
  const ready = data !== null;
  useEffect(() => {
    if (focusAsk === 0 || !ready) return;
    return focusField(() => newRef.current);
  }, [focusAsk, ready]);

  // Following a marker to an item's note: those notes must not be filtered out (the "General" filter hides them).
  if (reveal && reveal !== seenReveal) {
    setSeenReveal(reveal);
    if (filter === "general") setFilter("all");
  }

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
    onChanged?.();
    return true;
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!noteSaveable(draft, NOTE_MAX)) return;
    const anchor = chosen?.anchor ?? null;
    if (await run(() => addNote(studentId, draft, anchor))) {
      setDraft("");
      setAbout(GENERAL_KEY); // the next note is general unless the teacher picks an item again
      if (filterNotes([{ anchor }], filter).length === 0) setFilter("all"); // the new note must not be filtered out
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
            <textarea ref={newRef} id={`${id}-new`} value={draft} maxLength={NOTE_MAX} rows={4} onChange={(e) => setDraft(e.target.value)} className={area} />
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
