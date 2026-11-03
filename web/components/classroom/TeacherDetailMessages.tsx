"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { myConversations } from "@/lib/classroom-api";
import { filterConversations, findConversation, type Conversation } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { noteDate } from "@/lib/notes-view";
import { buttonClass } from "@/lib/ui";
import { AnchorChip } from "./AnchorChip";
import type { AnchorOption } from "./anchorOptions";
import { anchorText, classroomError, messageTime } from "./ClassroomText";
import { ConversationPanel } from "./ConversationPanel";
import { NewConversation } from "./NewConversation";

/** The unread marker's slot: always there, so read and unread rows line up. */
const dot = (on: boolean): string => `mt-2 size-2 shrink-0 rounded-full ${on ? "bg-blue-600" : ""}`;

type Open = { kind: "conversation"; id: string } | { kind: "new"; preset?: AnchorOption } | null;

/**
 * The Messages tab of one student's page (spec 5.2): the conversations this teacher has with this student, newest first,
 * "Shared with <student>" at the top (both of you can read them), and New message with an item picker.
 *
 * `options` are the items a message can be about (teacherAnchorOptions). `preset` is an item to start on, for instance
 * the one whose ⋯ menu was used: the existing conversation about it opens, or a new message about it is started. A
 * preset is used once, when the list is there; `onPresetUsed` then lets the page forget it, so coming back to this tab
 * does not open it again. `onChanged` runs when a message was sent, started or read, so the page can refresh its dot.
 */
export function TeacherDetailMessages({
  studentId,
  studentName,
  options,
  preset,
  onPresetUsed,
  onChanged,
}: {
  studentId: string;
  studentName: string;
  options: AnchorOption[];
  preset?: AnchorOption | null;
  onPresetUsed?: () => void;
  onChanged?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";

  const [list, setList] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [open, setOpen] = useState<Open>(null);
  const [usedPreset, setUsedPreset] = useState<AnchorOption | null>(null);
  const [now] = useState(() => new Date());

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const changed = useCallback(() => {
    reload();
    onChanged?.();
  }, [reload, onChanged]);

  useEffect(() => {
    let live = true;
    myConversations().then(
      (all) => {
        if (!live) return;
        setList(all);
        setLoadError(null);
      },
      (e) => {
        if (live) setLoadError(classroomError(t, e));
      },
    );
    return () => {
      live = false;
    };
  }, [nonce, t]);

  const mine = useMemo(() => filterConversations(list ?? [], "all", new Set([studentId])), [list, studentId]);

  // A preset opens the conversation about that item (or a new message about it) as soon as the list is here to look in.
  if (preset && list && preset !== usedPreset) {
    setUsedPreset(preset);
    const existing = findConversation(mine, studentId, preset.anchor);
    setOpen(existing ? { kind: "conversation", id: existing.id } : { kind: "new", preset });
  }
  useEffect(() => {
    if (preset && preset === usedPreset) onPresetUsed?.();
  }, [preset, usedPreset, onPresetUsed]);

  const openConversation = open?.kind === "conversation" ? (mine.find((c) => c.id === open.id) ?? null) : null;

  return (
    <section className="space-y-4" aria-labelledby={`dm-${studentId}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id={`dm-${studentId}`} className="font-display text-xl font-bold [overflow-wrap:anywhere]">
            {t("classroom.dm.sharedWith", { name: studentName })}
          </h2>
          <p className="text-sm text-zinc-600">{t("classroom.visible.teacher", { name: studentName })}</p>
        </div>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => setOpen({ kind: "new" })}>
          {t("classroom.new.title")}
        </button>
      </div>

      {list === null ? (
        loadError ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-urgent">
              {loadError}
            </p>
            <button type="button" className={buttonClass("secondary", "sm")} onClick={reload}>
              {t("classroom.retry")}
            </button>
          </div>
        ) : (
          <div role="status" aria-busy="true" className="h-32 animate-pulse rounded-2xl bg-zinc-100">
            <span className="sr-only">{t("classroom.msgs.loading")}</span>
          </div>
        )
      ) : (
        <>
          {loadError && (
            <p role="alert" className="text-sm text-urgent">
              {loadError}{" "}
              <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
                {t("classroom.retry")}
              </button>
            </p>
          )}
          {mine.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 p-5 text-[15px] text-zinc-700">{t("classroom.dm.empty", { name: studentName })}</p>
          ) : (
            <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
              {mine.map((c) => {
                const unread = c.unread > 0;
                const body = c.lastBody === null ? t("classroom.conv.removed") : c.lastBody;
                const snippet = c.lastAuthor === "teacher" ? `${t("classroom.conv.you")}: ${body}` : body;
                return (
                  <li key={c.id} className="flex items-start gap-2 px-4 py-3">
                    <span aria-hidden="true" className={dot(unread)} />
                    <div className="min-w-0 flex-1 space-y-1">
                      {unread && <span className="sr-only">{t("classroom.row.unread")}</span>}
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        {c.about.anchor.kind === "general" ? (
                          <span className="text-[15px] text-zinc-600">{anchorText(t, c.about, "teacher")}</span>
                        ) : (
                          <AnchorChip info={c.about} role="teacher" studentId={studentId} />
                        )}
                        <time dateTime={c.lastMessageAt} title={noteDate(c.lastMessageAt, tag)} className="shrink-0 text-[13px] text-zinc-600">
                          {messageTime(t, c.lastMessageAt, now, tag)}
                        </time>
                      </div>
                      <button type="button" className="block w-full text-left" onClick={() => setOpen({ kind: "conversation", id: c.id })}>
                        <span className={`line-clamp-2 text-sm [overflow-wrap:anywhere] ${unread ? "font-semibold text-ink" : "text-zinc-700"}`}>{snippet}</span>
                        {c.status === "resolved" && <span className="block text-[13px] text-zinc-600">{t("classroom.row.resolved")}</span>}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {open?.kind === "new" && (
        <NewConversation
          key={open.preset ? "preset" : "blank"}
          role="teacher"
          otherId={studentId}
          otherName={studentName}
          options={options}
          preset={open.preset}
          onStarted={(id) => {
            setOpen({ kind: "conversation", id });
            changed();
          }}
          onCancel={() => setOpen(null)}
        />
      )}
      {openConversation && <ConversationPanel key={openConversation.id} conversation={openConversation} role="teacher" studentId={studentId} onClose={() => setOpen(null)} onChanged={changed} />}
    </section>
  );
}
