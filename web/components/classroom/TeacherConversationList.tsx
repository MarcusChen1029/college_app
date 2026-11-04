"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { myConversations } from "@/lib/classroom-api";
import { filterConversations, type Conversation, type ConversationFilter } from "@/lib/classroom";
import type { MessageKey } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { listStudents, loadTeacherOverview, type LinkedStudent, type TeacherClass } from "@/lib/links-api";
import { noteDate } from "@/lib/notes-view";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { AnchorChip } from "./AnchorChip";
import { classroomError, messageTime } from "./ClassroomText";
import { ConversationPanel } from "./ConversationPanel";

const FILTERS: readonly (readonly [ConversationFilter, MessageKey, MessageKey])[] = [
  ["needs_reply", "classroom.msgs.filter.needsReply", "classroom.msgs.empty.needsReply"],
  ["open", "classroom.msgs.filter.open", "classroom.msgs.empty.open"],
  ["resolved", "classroom.msgs.filter.resolved", "classroom.msgs.empty.resolved"],
  ["all", "classroom.msgs.filter.all", "classroom.msgs.empty.all"],
];

/** The unread marker's slot: always there, so read and unread rows line up. */
const dot = (on: boolean): string => `mt-2 size-2 shrink-0 rounded-full ${on ? "bg-blue-600" : ""}`;

type Roster = { students: LinkedStudent[]; classes: TeacherClass[] };

/**
 * The Conversations tab of the teacher's Messages page (spec 5.3): every conversation with the teacher's students,
 * newest first, filtered by Needs reply (the default), Open, Resolved or All and by class. A row names the student and
 * what it is about (a link to that item on the student's page), then the last message; clicking it opens the
 * conversation. `openId` is the open conversation (the page keeps it in the address as ?c=); an id that is not in the
 * list opens nothing. The class filter needs the students' classes and is left out when they can't be loaded.
 */
export function TeacherConversationList({ openId, onOpen }: { openId: string | null; onOpen: (id: string | null) => void }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const uid = useId();

  const [list, setList] = useState<Conversation[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [roster, setRoster] = useState<Roster | null>(null);
  const [filter, setFilter] = useState<ConversationFilter>("needs_reply");
  const [classId, setClassId] = useState("");
  const [now] = useState(() => new Date());

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    myConversations().then(
      (c) => {
        if (!live) return;
        setList(c);
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

  // Which students are in which class changes rarely, so it loads once per visit. A failure only hides the class filter.
  useEffect(() => {
    let live = true;
    Promise.all([listStudents(), loadTeacherOverview()]).then(
      ([students, overview]) => {
        if (live) setRoster({ students, classes: overview.classes.filter((c) => !c.archived) });
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, []);

  // A class that has since been archived or left the list no longer filters.
  const classes = roster?.classes ?? [];
  const activeClass = classes.some((c) => c.id === classId) ? classId : "";
  const studentIds = useMemo(
    () => (activeClass && roster ? new Set(roster.students.filter((s) => s.classIds.includes(activeClass)).map((s) => s.studentId)) : null),
    [activeClass, roster],
  );
  const shown = useMemo(() => filterConversations(list ?? [], filter, studentIds), [list, filter, studentIds]);
  const emptyKey = FILTERS.find(([f]) => f === filter)?.[2] ?? "classroom.msgs.empty.all";
  const openConv = list && openId ? (list.find((c) => c.id === openId) ?? null) : null;

  if (list === null) {
    return loadError ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {loadError}
        </p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={reload}>
          {t("classroom.retry")}
        </button>
      </div>
    ) : (
      <div role="status" aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-zinc-100">
        <span className="sr-only">{t("classroom.msgs.loading")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div role="radiogroup" aria-labelledby={`${uid}-show`} className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span id={`${uid}-show`} className="text-[15px] font-semibold text-ink">
            {t("classroom.msgs.show")}
          </span>
          {FILTERS.map(([value, label]) => (
            <label key={value} className="inline-flex items-center gap-2 text-[15px] text-ink">
              <input type="radio" name={`${uid}-filter`} className="size-4" checked={filter === value} onChange={() => setFilter(value)} />
              {t(label)}
            </label>
          ))}
        </div>
        {classes.length > 0 && (
          <div className="flex items-center gap-2">
            <label htmlFor={`${uid}-class`} className="text-[15px] font-semibold text-ink">
              {t("classroom.msgs.class")}
            </label>
            <select id={`${uid}-class`} value={activeClass} className={`${FIELD_CLASS} max-w-56`} onChange={(e) => setClassId(e.target.value)}>
              <option value="">{t("classroom.msgs.allClasses")}</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loadError && (
        <p role="alert" className="text-sm text-urgent">
          {loadError}{" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
            {t("classroom.retry")}
          </button>
        </p>
      )}

      {shown.length === 0 ? (
        <p className="rounded-2xl bg-zinc-50 p-5 text-[15px] text-zinc-700">{t(emptyKey)}</p>
      ) : (
        <ul className="divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white">
          {shown.map((c) => {
            const unread = c.unread > 0;
            const body = c.lastBody === null ? t("classroom.conv.removed") : c.lastBody;
            const snippet = c.lastAuthor === "teacher" ? `${t("classroom.conv.you")}: ${body}` : body;
            return (
              <li key={c.id} className="flex items-start gap-2 px-4 py-3">
                <span aria-hidden="true" className={dot(unread)} />
                <div className="min-w-0 flex-1 space-y-1">
                  {unread && <span className="sr-only">{t("classroom.row.unread")}</span>}
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold text-ink [overflow-wrap:anywhere]">{c.otherName}</span>
                      <AnchorChip info={c.about} role="teacher" studentId={c.otherId} />
                    </div>
                    <time dateTime={c.lastMessageAt} title={noteDate(c.lastMessageAt, tag)} className="shrink-0 text-[13px] text-zinc-600">
                      {messageTime(t, c.lastMessageAt, now, tag)}
                    </time>
                  </div>
                  <button type="button" className="block w-full text-left" onClick={() => onOpen(c.id)}>
                    <span className={`line-clamp-2 text-sm [overflow-wrap:anywhere] ${unread ? "font-semibold text-ink" : "text-zinc-700"}`}>{snippet}</span>
                    {c.status === "resolved" && <span className="block text-[13px] text-zinc-600">{t("classroom.row.resolved")}</span>}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {openConv && <ConversationPanel key={openConv.id} conversation={openConv} role="teacher" studentId={openConv.otherId} onClose={() => onOpen(null)} onChanged={reload} />}
    </div>
  );
}
