"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Anchor } from "@/lib/anchors";
import { initialOf } from "@/lib/classes-home";
import { conversationMessages, markConversationRead, sendMessage, startConversation } from "@/lib/classroom-api";
import { CLASSROOM_LIMITS, findConversation, validateMessage, type Conversation, type Message } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { noteDate } from "@/lib/notes-view";
import { buttonClass, FIELD_CLASS, LABEL } from "@/lib/ui";
import { savedLabel } from "../anchorOptions";
import { classroomError } from "../ClassroomText";
import { LinkedText } from "../LinkedText";
import { refreshClassroomUnread } from "../useClassroomUnread";

/**
 * The "Private comments" box of a task page (spec 3.4): the conversation between this student and the task's teacher
 * about this one task (anchor `task:<id>`), oldest first, with a one-line reply box. The first comment starts the
 * conversation. Only the two of them see it. `conversations` is the page's list (useStudentClassroom); `onChanged` runs
 * after anything that changes it (a comment sent, the thread read) so the page reloads that list.
 */
export function PrivateComments({
  teacherId,
  teacherName,
  taskId,
  taskTitle,
  conversations,
  onChanged,
}: {
  teacherId: string;
  teacherName: string;
  taskId: string;
  taskTitle: string;
  conversations: Conversation[];
  onChanged: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const uid = useId();

  const anchor = useMemo<Anchor>(() => ({ kind: "task", ref: taskId }), [taskId]);
  const found = findConversation(conversations, teacherId, anchor);
  // The conversation this box just started, used until the page's list has it (a second comment must not start another).
  const [started, setStarted] = useState<string | null>(null);
  const conversationId = found?.id ?? started;
  const unread = found?.unread ?? 0;
  const resolved = found?.status === "resolved";
  const lastMessageAt = found?.lastMessageAt ?? null;

  const [thread, setThread] = useState<{ id: string; list: Message[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by Try again, to load the thread once more
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messages = thread && thread.id === conversationId ? thread.list : null;

  // The latest values for the effect below, which must run when the thread changes, not on every render.
  const latest = useRef({ onChanged, unread });
  useEffect(() => {
    latest.current = { onChanged, unread };
  });

  // Load the thread when there is one, and again when its last message moves (the teacher answered, or this student did).
  // A thread with unread comments is then marked read and the badges catch up. Reading is a convenience: a failure there is silent.
  useEffect(() => {
    if (!conversationId) return;
    let live = true;
    const hadUnread = latest.current.unread > 0;
    (async () => {
      try {
        const list = await conversationMessages(conversationId);
        if (!live) return;
        setThread({ id: conversationId, list });
        setLoadError(null);
      } catch (e) {
        if (live) setLoadError(classroomError(t, e));
        return;
      }
      if (!hadUnread) return;
      try {
        await markConversationRead(conversationId);
      } catch {
        return;
      }
      refreshClassroomUnread();
      latest.current.onChanged(); // the page's copy loses its unread count
    })();
    return () => {
      live = false;
    };
  }, [conversationId, lastMessageAt, attempt, t]);

  // The newest comment in view when the thread shows and whenever one is added.
  const listRef = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? -1;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateMessage(draft);
    if (!v.ok) {
      setError(classroomError(t, v.error));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let id = conversationId;
      if (id) await sendMessage(id, v.value);
      else {
        id = await startConversation(teacherId, anchor, savedLabel(taskTitle), v.value);
        setStarted(id);
      }
      setDraft("");
      // Show it at once; the reload below brings the stored thread.
      const sent: Message = { id: `sent-${Date.now()}`, author: "student", body: v.value, deleted: false, createdAt: new Date().toISOString() };
      const sentTo = id;
      setThread((cur) => ({ id: sentTo, list: [...(cur && cur.id === sentTo ? cur.list : []), sent] }));
      onChanged();
    } catch (err) {
      setError(classroomError(t, err));
    } finally {
      setBusy(false);
    }
  }

  const headingId = `${uid}-title`;
  return (
    <section aria-labelledby={headingId} className="rounded-[10px] border border-neutral-line bg-white p-4">
      <h2 id={headingId} className={LABEL}>
        {t("classroom.comments.title")}
      </h2>

      <div className="mt-3">
        {conversationId === null ? (
          <p className="text-sm text-neutral">{t("classroom.comments.empty", { name: teacherName })}</p>
        ) : messages === null ? (
          loadError ? (
            <p role="alert" className="text-sm text-urgent">
              {loadError}{" "}
              <button type="button" className="font-semibold underline underline-offset-4" onClick={() => setAttempt((n) => n + 1)}>
                {t("classroom.retry")}
              </button>
            </p>
          ) : (
            <div role="status" aria-busy="true" className="h-16 animate-pulse rounded-lg bg-neutral-bg">
              <span className="sr-only">{t("classroom.conv.loading")}</span>
            </div>
          )
        ) : (
          <div ref={listRef} className="max-h-80 overflow-y-auto pr-1">
            <ul className="space-y-3">
              {messages.map((m) => {
                const mine = m.author === "student";
                const who = mine ? t("classroom.conv.you") : teacherName;
                const removed = m.deleted || m.body === null;
                return (
                  <li key={m.id} className="flex gap-2.5">
                    <span
                      aria-hidden="true"
                      className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${mine ? "bg-mint text-ink" : "bg-ink text-white"}`}
                    >
                      {initialOf(who)}
                    </span>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="text-[13px] text-neutral">
                        <span className="font-semibold text-ink [overflow-wrap:anywhere]">{who}</span> ·{" "}
                        <time dateTime={m.createdAt}>{noteDate(m.createdAt, tag)}</time>
                      </p>
                      <div className={`[overflow-wrap:anywhere] ${removed ? "text-neutral italic" : "text-ink"}`}>
                        {removed ? t("classroom.conv.removed") : <LinkedText text={m.body ?? ""} />}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <form onSubmit={(e) => void submit(e)} className="mt-3 space-y-2">
        {resolved && <p className="text-[13px] text-neutral">{t("classroom.conv.resolvedNote")}</p>}
        <label htmlFor={`${uid}-reply`} className="sr-only">
          {t("classroom.comments.label", { name: teacherName })}
        </label>
        <div className="flex items-center gap-2">
          {/* Read-only while a write runs, so nothing typed meanwhile is lost when a sent comment clears the box. */}
          <input
            id={`${uid}-reply`}
            type="text"
            value={draft}
            readOnly={busy}
            maxLength={CLASSROOM_LIMITS.message}
            autoComplete="off"
            placeholder={t("classroom.comments.placeholder", { name: teacherName })}
            className={`${FIELD_CLASS} min-w-0 flex-1`}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {t("classroom.send")}
          </button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}
        <p className="text-[13px] text-neutral">{t("classroom.comments.visible", { name: teacherName })}</p>
      </form>
    </section>
  );
}
