"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { btn } from "@/components/TeacherClassCard";
import { addNote, deleteNote, listNotes, NOTE_MAX, updateNote, type TeacherNote } from "@/lib/links-api";
import { noteDate, noteEdited, noteErrorMessage, noteSaveable } from "@/lib/notes-view";

const area = "mt-1 block w-full rounded-md border border-zinc-300 px-3 py-2 text-sm";
const primary = "rounded-full bg-ink px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60";

type Run = (fn: () => Promise<unknown>) => Promise<boolean>;

/** One note: its text (never HTML), when it was written, and Edit / Delete. Edit swaps the text for a textarea. */
function NoteItem({ note, busy, run }: { note: TeacherNote; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const id = useId();
  const when = noteDate(note.createdAt);

  return (
    <li className="space-y-2 rounded-2xl border border-zinc-200 p-4">
      {editing ? (
        <div>
          <label htmlFor={id} className="sr-only">
            Edit note from {when}
          </label>
          <textarea id={id} value={draft} maxLength={NOTE_MAX} rows={4} onChange={(e) => setDraft(e.target.value)} className={area} />
          <p className="mt-1 text-xs text-zinc-500">
            {draft.length} / {NOTE_MAX}
          </p>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{note.body}</p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          <time dateTime={note.createdAt}>{when}</time>
          {noteEdited(note.createdAt, note.updatedAt) && <span> (edited)</span>}
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
                Save
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
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" disabled={busy} className={btn} aria-label={`Edit note from ${when}`} onClick={() => setEditing(true)}>
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                className={btn}
                aria-label={`Delete note from ${when}`}
                onClick={() => confirm("Delete this note? This can't be undone.") && void run(() => deleteNote(note.id))}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

/** The teacher's own notes about one student, newest first. Reloads the list after every change. */
export function TeacherNotes({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [data, setData] = useState<TeacherNote[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const id = useId();

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
    if (await run(() => addNote(studentId, draft))) setDraft("");
  }

  return (
    <section className="space-y-4" aria-labelledby={`${id}-heading`}>
      <div>
        <h2 id={`${id}-heading`} className="font-display text-xl font-bold">
          Private notes
        </h2>
        <p className="text-sm text-zinc-500">Only you can see these notes. They are deleted if the student leaves or you remove them from your list.</p>
      </div>

      {!data ? (
        error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
            <button type="button" className={btn} onClick={() => void refresh()}>
              Try again
            </button>
          </div>
        ) : (
          <div className="h-32 animate-pulse rounded-lg bg-zinc-100" />
        )
      ) : (
        <>
          <form onSubmit={submit} className="space-y-2 rounded-2xl border border-zinc-200 p-4">
            <label htmlFor={`${id}-new`} className="text-sm font-medium">
              New note about {studentName}
            </label>
            <textarea id={`${id}-new`} value={draft} maxLength={NOTE_MAX} rows={4} onChange={(e) => setDraft(e.target.value)} className={area} />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-zinc-500">
                {draft.length} / {NOTE_MAX}
              </p>
              <button type="submit" disabled={busy || !noteSaveable(draft, NOTE_MAX)} className={primary}>
                Add note
              </button>
            </div>
          </form>
          {actionError && (
            <p role="alert" className="text-sm text-rose-600">
              {actionError}
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}{" "}
              <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void refresh()}>
                Try again
              </button>
            </p>
          )}
          {data.length === 0 ? (
            <p className="text-sm text-zinc-500">No notes yet.</p>
          ) : (
            <ul className="space-y-3">
              {data.map((n) => (
                <NoteItem key={n.id} note={n} busy={busy} run={run} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
