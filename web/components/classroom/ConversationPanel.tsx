"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Modal } from "@/components/Modal";
import { conversationMessages, deleteMessage, markConversationRead, sendMessage, setConversationStatus } from "@/lib/classroom-api";
import { CLASSROOM_LIMITS, validateMessage, type Conversation, type Message } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { noteDate } from "@/lib/notes-view";
import { buttonClass } from "@/lib/ui";
import { AnchorChip } from "./AnchorChip";
import { anchorText, classroomError, TEXTAREA_CLASS } from "./ClassroomText";
import { LinkedText } from "./LinkedText";
import { refreshClassroomUnread } from "./useClassroomUnread";

/**
 * One conversation, as a dialog over the page (spec 4.2): who it is with and what it is about, the messages oldest
 * first, a reply box, and Mark resolved / Reopen. Opening it marks it read. `onChanged` runs after anything that
 * changes the conversation (a message sent or removed, the status, the unread count) so the page behind can reload
 * its list. Either side can resolve it; a new message reopens it; you can delete your own messages but not edit them.
 */
export function ConversationPanel({
  conversation,
  role,
  studentId,
  onClose,
  onChanged,
}: {
  conversation: Conversation;
  role: "teacher" | "student";
  /** The student's id, for a teacher's jump links. Defaults to the other person in the conversation. */
  studentId?: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const uid = useId();
  const id = conversation.id;
  const name = conversation.otherName;
  const general = conversation.about.anchor.kind === "general";

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The status we just wrote, shown until the page hands us a conversation whose status has moved on (a reloaded list,
  // or the other side's change); then the page's copy takes over.
  const [written, setWritten] = useState<{ from: Conversation["status"]; to: Conversation["status"] } | null>(null);
  if (written && written.from !== conversation.status) setWritten(null);
  const status = written ? written.to : conversation.status;

  // The latest values for the effect below, which must run once per conversation, not once per render.
  const latest = useRef({ onChanged, unread: conversation.unread });
  useEffect(() => {
    latest.current = { onChanged, unread: conversation.unread };
  });

  // Newest message in view when the thread first shows and whenever a message is added.
  const listRef = useRef<HTMLDivElement>(null);
  const count = messages?.length ?? -1;
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  // The list stays on screen while it reloads, so the draft, scroll position and focus survive every change.
  const reload = useCallback(async () => {
    try {
      setMessages(await conversationMessages(id));
      setLoadError(null);
    } catch (e) {
      setLoadError(classroomError(t, e));
    }
  }, [id, t]);

  // Open: load the thread, then mark it read and refresh the badges. Reading is a convenience, so a failure there is silent.
  useEffect(() => {
    let live = true;
    const hadUnread = latest.current.unread > 0;
    (async () => {
      try {
        const list = await conversationMessages(id);
        if (!live) return;
        setMessages(list);
        setLoadError(null);
      } catch (e) {
        if (live) setLoadError(classroomError(t, e));
        return;
      }
      try {
        await markConversationRead(id);
      } catch {
        return;
      }
      refreshClassroomUnread();
      if (hadUnread) latest.current.onChanged(); // the page's row loses its unread dot
    })();
    return () => {
      live = false;
    };
  }, [id, t]);

  /** Runs one write. Returns false (and shows the error) when it fails. */
  async function run(fn: () => Promise<void>): Promise<boolean> {
    setBusy(true);
    setActionError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setActionError(classroomError(t, e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy) return;
    const v = validateMessage(draft);
    if (!v.ok) {
      setActionError(classroomError(t, v.error));
      return;
    }
    const ok = await run(async () => {
      await sendMessage(id, v.value);
      setDraft("");
      setWritten({ from: conversation.status, to: "open" }); // a new message reopens it
      await reload();
    });
    if (ok) onChanged();
  }

  async function toggleStatus() {
    const next = status === "open" ? "resolved" : "open";
    const ok = await run(async () => {
      await setConversationStatus(id, next);
      setWritten({ from: conversation.status, to: next });
    });
    if (ok) onChanged();
  }

  async function remove(m: Message) {
    if (!confirm(t("classroom.conv.confirmDelete"))) return;
    const ok = await run(async () => {
      await deleteMessage(m.id);
      await reload();
    });
    if (ok) onChanged();
  }

  const title = (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <h2 className="min-w-0 text-lg font-semibold [overflow-wrap:anywhere]">{name}</h2>
        <span aria-hidden="true" className="text-zinc-400">
          ·
        </span>
        {general ? (
          <span className="text-[15px] text-zinc-600">{anchorText(t, conversation.about, role)}</span>
        ) : (
          <AnchorChip info={conversation.about} role={role} studentId={studentId ?? (role === "teacher" ? conversation.otherId : undefined)} onFollow={onClose} />
        )}
      </div>
      <button type="button" disabled={busy || messages === null} className={buttonClass("ghost", "sm")} onClick={() => void toggleStatus()}>
        {status === "open" ? t("classroom.conv.resolve") : t("classroom.conv.reopen")}
      </button>
    </div>
  );

  return (
    <Modal title={title} onClose={onClose} className="w-[min(36rem,calc(100vw-2rem))]">
      {messages === null ? (
        loadError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-urgent">
              {loadError}
            </p>
            <button type="button" className={buttonClass("ghost", "sm")} onClick={() => void reload()}>
              {t("classroom.retry")}
            </button>
          </div>
        ) : (
          <div role="status" aria-busy="true" className="h-32 animate-pulse rounded-lg bg-zinc-100">
            <span className="sr-only">{t("classroom.conv.loading")}</span>
          </div>
        )
      ) : (
        <div className="space-y-4">
          <div ref={listRef} className="max-h-[min(24rem,50vh)] overflow-y-auto pr-1">
            <ul className="space-y-4">
              {messages.map((m) => {
                const mine = m.author === role;
                const when = noteDate(m.createdAt, tag);
                const removed = m.deleted || m.body === null;
                return (
                  <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                    <p className="text-[13px] text-zinc-600">
                      {mine ? t("classroom.conv.you") : name} · <time dateTime={m.createdAt}>{when}</time>
                    </p>
                    <div
                      className={`mt-1 max-w-[85%] min-w-0 rounded-2xl px-3 py-2 text-sm ${
                        removed ? "border border-dashed border-zinc-300 text-zinc-600 italic" : mine ? "bg-zinc-100" : "border border-zinc-200 bg-white"
                      }`}
                    >
                      {removed ? t("classroom.conv.removed") : <LinkedText text={m.body ?? ""} />}
                    </div>
                    {mine && !removed && (
                      <button
                        type="button"
                        disabled={busy}
                        className="mt-1 text-[13px] text-zinc-600 underline-offset-4 hover:underline disabled:opacity-50"
                        aria-label={t("classroom.conv.deleteAria", { when })}
                        onClick={() => void remove(m)}
                      >
                        {t("common.delete")}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          <form onSubmit={(e) => void submit(e)} className="space-y-2 border-t border-zinc-200 pt-4">
            {status === "resolved" && <p className="text-[13px] text-zinc-600">{t("classroom.conv.resolvedNote")}</p>}
            <label htmlFor={`${uid}-reply`} className="sr-only">
              {t("classroom.conv.replyLabel", { name })}
            </label>
            <textarea
              id={`${uid}-reply`}
              value={draft}
              rows={3}
              maxLength={CLASSROOM_LIMITS.message}
              placeholder={t("classroom.conv.replyPlaceholder")}
              className={TEXTAREA_CLASS}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void submit();
                }
              }}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-[13px] text-zinc-600">{role === "teacher" ? t("classroom.visible.teacher", { name }) : t("classroom.visible.student", { name })}</p>
              <div className="flex items-center gap-3">
                <span className="text-[13px] text-zinc-600">
                  {draft.length} / {CLASSROOM_LIMITS.message}
                </span>
                <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
                  {t("classroom.send")}
                </button>
              </div>
            </div>
            {actionError && (
              <p role="alert" className="text-sm text-urgent">
                {actionError}
              </p>
            )}
            {loadError && (
              <p role="alert" className="text-sm text-urgent">
                {loadError}{" "}
                <button type="button" className="font-semibold underline underline-offset-4" onClick={() => void reload()}>
                  {t("classroom.retry")}
                </button>
              </p>
            )}
          </form>
        </div>
      )}
    </Modal>
  );
}
