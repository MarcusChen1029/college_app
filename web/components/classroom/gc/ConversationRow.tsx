"use client";

import { relativeText } from "@/components/TeacherText";
import type { Conversation } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { noteDate } from "@/lib/notes-view";
import { relativeTime } from "@/lib/roster-view";
import { AnchorChip } from "../AnchorChip";

/**
 * One conversation in a list (the 1-on-1 page's Comments): what it is about, the last message, when, and a dot while it
 * has unread messages. The snippet opens the conversation (`onOpen`). `now` is the page's clock, for "3 days ago".
 */
export function ConversationRow({ conversation: c, now, onOpen }: { conversation: Conversation; now: Date; onOpen: () => void }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const unread = c.unread > 0;
  const body = c.lastBody === null ? t("classroom.conv.removed") : c.lastBody;
  const snippet = c.lastAuthor === "student" ? `${t("classroom.conv.you")}: ${body}` : body;
  const when = relativeText(t, relativeTime(c.lastMessageAt, now));
  return (
    <li className="flex items-start gap-2.5 px-3 py-3">
      {/* The unread marker's slot is always there, so read and unread rows line up. */}
      <span aria-hidden="true" className={`mt-2 size-2.5 shrink-0 rounded-full ${unread ? "bg-coral outline outline-1 outline-ink/40" : ""}`} />
      <div className="min-w-0 flex-1 space-y-1">
        <AnchorChip info={c.about} role="student" conversationId={c.id} />
        <button type="button" className="block w-full rounded-md text-left hover:bg-neutral-bg" onClick={onOpen}>
          {/* Inside the button, so a screen reader announces "Unread" with the row it opens. */}
          {unread && <span className="sr-only">{t("classroom.row.unread")}</span>}
          <span className={`line-clamp-2 text-sm [overflow-wrap:anywhere] ${unread ? "font-semibold text-ink" : "text-neutral"}`}>{snippet}</span>
          <span className="block text-[13px] text-neutral">
            <time dateTime={c.lastMessageAt} title={noteDate(c.lastMessageAt, tag)}>
              {when}
            </time>
            {c.status === "resolved" ? ` · ${t("classroom.row.resolved")}` : ""}
          </span>
        </button>
      </div>
    </li>
  );
}
