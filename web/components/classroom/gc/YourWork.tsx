"use client";

import { useId, useState } from "react";
import { DONE_LIMITS, dueState, validateDone } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { localDate } from "@/lib/roster";
import type { StudentTask } from "@/lib/tasks";
import { setTaskDone } from "@/lib/tasks-api";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { classroomError, dueLabel, TEXTAREA_CLASS } from "../ClassroomText";
import { LinkedText } from "../LinkedText";
import { CheckIcon } from "./gcIcons";

/**
 * The "Your work" box of a task page (spec 3.4): the task's status (Assigned, Missing, Done <date>) and the student's way
 * to finish it. An open task takes an optional note and link, then Mark as done. A done task shows the note and link it
 * was finished with and offers Edit (change them and Save; the done date stays) and Undo (which removes the completion,
 * note and link with it). Both go to the task's teacher only. Buttons are disabled while a save runs. `onChanged` runs
 * after anything is saved, so the page reloads the task.
 *
 * Every "done" call sends the note and link as they are now (set_task_done replaces them on each one), never nothing.
 */
export function YourWork({ task, onChanged }: { task: StudentTask; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const uid = useId();
  const [today] = useState(() => localDate(new Date()));
  const [note, setNote] = useState(task.note ?? "");
  const [link, setLink] = useState(task.link ?? "");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the server holds now. When it changes (the reload after a save or an Undo, or another device) the form starts
  // over from it, so the inputs never show an old note.
  const stored = `${task.id}\n${task.done}\n${task.note ?? ""}\n${task.link ?? ""}`;
  const [seen, setSeen] = useState(stored);
  if (seen !== stored) {
    setSeen(stored);
    setNote(task.note ?? "");
    setLink(task.link ?? "");
    setEditing(false);
    setError(null);
  }

  // The note and link just saved, shown until the stored values change (the reload after a save, which may fail).
  const [saved, setSaved] = useState<{ base: string; note: string | null; link: string | null } | null>(null);
  const shown = saved && saved.base === stored ? saved : { note: task.note, link: task.link };

  const state = dueState(task, today);
  const done = state.kind === "done";
  const status = state.kind === "none" || state.kind === "due" ? t("classroom.work.assigned") : dueLabel(t, state, locale, today);
  const name = task.teacherName;
  const form = !done || editing;

  /** Runs one write with the busy flag; shows its error and returns whether it worked. */
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(classroomError(t, e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  /** Mark as done (an open task) and Save (a done one): both finish the task with the note and link in the boxes. */
  async function finish() {
    if (busy) return;
    const v = validateDone({ note, link });
    if (!v.ok) {
      setError(t(v.error === "note" ? "classroom.work.err.note" : "classroom.work.err.link", { n: DONE_LIMITS[v.error] }));
      return;
    }
    if (await run(() => setTaskDone(task.id, true, v.note, v.link))) {
      setSaved({ base: stored, note: v.note, link: v.link });
      setEditing(false);
      onChanged();
    }
  }

  async function undo() {
    if (busy) return;
    if (await run(() => setTaskDone(task.id, false))) onChanged();
  }

  function cancelEdit() {
    setNote(shown.note ?? "");
    setLink(shown.link ?? "");
    setError(null);
    setEditing(false);
  }

  const headingId = `${uid}-title`;
  return (
    <section aria-labelledby={headingId} className="rounded-[10px] border border-neutral-line bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={headingId} className="font-display text-lg font-bold text-ink">
          {t("classroom.work.title")}
        </h2>
        <p className={`inline-flex items-center gap-1 text-[13px] font-semibold ${state.kind === "missing" ? "text-urgent" : "text-ink"}`}>
          {done && <CheckIcon className="size-4 shrink-0" />}
          {status}
        </p>
      </div>

      {form ? (
        <form
          className="mt-3 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void finish();
          }}
        >
          <div className="space-y-1">
            <label htmlFor={`${uid}-note`} className="block text-[13px] font-semibold text-ink">
              {t("classroom.work.noteLabel", { name })}
            </label>
            {/* Read-only while a save runs, so nothing typed meanwhile is lost. */}
            <textarea
              id={`${uid}-note`}
              value={note}
              readOnly={busy}
              rows={3}
              maxLength={DONE_LIMITS.note}
              className={TEXTAREA_CLASS}
              onChange={(e) => setNote(e.target.value)}
            />
            <p className="text-right text-[13px] text-neutral">
              {note.length} / {DONE_LIMITS.note}
            </p>
          </div>
          <div className="space-y-1">
            <label htmlFor={`${uid}-link`} className="block text-[13px] font-semibold text-ink">
              {t("classroom.work.linkLabel")}
            </label>
            <input
              id={`${uid}-link`}
              type="text"
              inputMode="url"
              autoComplete="off"
              value={link}
              readOnly={busy}
              maxLength={DONE_LIMITS.link}
              placeholder="https://"
              className={`${FIELD_CLASS} w-full`}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <p className="text-[13px] text-neutral">{t("classroom.work.visible", { name })}</p>
          {error && (
            <p role="alert" className="text-sm text-urgent">
              {error}
            </p>
          )}
          {done ? (
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
                {t("classroom.work.save")}
              </button>
              <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={cancelEdit}>
                {t("common.cancel")}
              </button>
            </div>
          ) : (
            <button type="submit" disabled={busy} className={`${buttonClass("primary", "md")} w-full`}>
              {t("classroom.work.markDone")}
            </button>
          )}
        </form>
      ) : (
        <div className="mt-3 space-y-3">
          {shown.note || shown.link ? (
            <dl className="space-y-2 text-sm text-ink">
              {shown.note && (
                <div>
                  <dt className="text-[13px] font-semibold text-neutral">{t("classroom.work.note")}</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    <LinkedText text={shown.note} />
                  </dd>
                </div>
              )}
              {shown.link && (
                <div>
                  <dt className="text-[13px] font-semibold text-neutral">{t("classroom.work.link")}</dt>
                  <dd className="[overflow-wrap:anywhere]">
                    <LinkedText text={shown.link} />
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-sm text-neutral">{t("classroom.work.noExtras")}</p>
          )}
          <p className="text-[13px] text-neutral">{t("classroom.work.visible", { name })}</p>
          {error && (
            <p role="alert" className="text-sm text-urgent">
              {error}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} className={buttonClass("secondary", "sm")} onClick={() => setEditing(true)}>
              {t("classroom.work.edit")}
            </button>
            <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={() => void undo()}>
              {t("classroom.work.undo")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
