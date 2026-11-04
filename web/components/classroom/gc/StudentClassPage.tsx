"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { classView, isToAllStudents } from "@/lib/class-page";
import { tabHref } from "@/lib/class-tab";
import { classPath, initialOf, taskPath } from "@/lib/classes-home";
import type { StudentPost } from "@/lib/classroom";
import { dueState, streamOf, upcoming } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { setShareEssays } from "@/lib/links-api";
import { localDate } from "@/lib/roster";
import type { StudentTask } from "@/lib/tasks";
import { buttonClass, toneClass } from "@/lib/ui";
import { savedLabel, type AnchorOption } from "../anchorOptions";
import { classroomError, dueLabel, shortDate } from "../ClassroomText";
import { ConversationPanel } from "../ConversationPanel";
import { BubbleIcon } from "../icons";
import { LinkedText } from "../LinkedText";
import { NewConversation } from "../NewConversation";
import { WhatTheySee } from "../WhatTheySee";
import { ClassBanner } from "./ClassBanner";
import { ClassTabs, classPanelProps, useClassTab } from "./ClassTabs";
import { ClassworkList } from "./ClassworkList";
import { CheckIcon, ClipboardIcon } from "./gcIcons";
import { LoadFailed, NotAvailable, PageProblem } from "./PageStates";
import { GateSkeleton, StudentGate } from "./StudentGate";
import { UpcomingBox } from "./UpcomingBox";
import { useMarkPostsRead } from "./useMarkPostsRead";
import { useOpenConversation } from "./useOpenConversation";
import { useStudentClassroom } from "./useStudentClassroom";

const TABS = ["stream", "classwork", "people"] as const;
/** How many Stream items show before "Show older". */
const PAGE_SIZE = 20;
const NO_POSTS: readonly StudentPost[] = [];
/** A reply to an announcement is a general conversation, so the "About" list offers nothing else. */
const NO_OPTIONS: AnchorOption[] = [];
const BADGE = "rounded-full border px-2 py-0.5 text-[13px] font-semibold";
const CARD = "rounded-[10px] border border-neutral-line bg-white";

/**
 * A class (`/counselor/class/<classId>`, spec 3.2): its banner and three tabs. Stream merges the class's announcements
 * (and the teacher's announcements to all their students, tagged) with its new tasks; Classwork lists its tasks by topic;
 * People shows the teacher, never classmates. A student cannot post or comment here: "Reply privately" starts a general
 * conversation with the teacher. Opening the Stream marks the announcements it shows as read. `?c=<id>` opens that
 * conversation. A class the student is not in, or that is archived, gets the "isn't available" page.
 */
export function StudentClassPage({ classId }: { classId: string }) {
  return (
    <StudentGate returnTo={classPath(classId)}>
      <ClassPage classId={classId} />
    </StudentGate>
  );
}

function Avatar({ initial, className = "" }: { initial: string; className?: string }) {
  return (
    <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full bg-ink text-base font-bold text-white ${className}`}>
      {initial}
    </span>
  );
}

function PostEntry({
  post,
  teacherName,
  fresh,
  tag,
  onReply,
}: {
  post: StudentPost;
  teacherName: string;
  fresh: boolean;
  tag: string;
  onReply: () => void;
}) {
  const t = useT();
  return (
    <li className={CARD}>
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <Avatar initial={initialOf(teacherName)} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-ink [overflow-wrap:anywhere]">{t("classroom.stream.postedAnnouncement", { name: teacherName })}</p>
            {fresh && <span className={`${BADGE} ${toneClass("progress")}`}>{t("classroom.post.new")}</span>}
            {post.pinned && <span className={`${BADGE} ${toneClass("neutral")}`}>{t("classroom.post.pinned")}</span>}
          </div>
          <p className="text-[13px] text-neutral [overflow-wrap:anywhere]">
            <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
            {isToAllStudents(post) ? ` · ${t("classroom.stream.toAll", { name: teacherName })}` : ""}
          </p>
        </div>
      </div>
      <div className="space-y-2 px-4 pb-4 text-sm leading-relaxed text-ink sm:pl-[4.25rem]">
        <h3 className="font-semibold [overflow-wrap:anywhere]">{post.title}</h3>
        <LinkedText text={post.body} />
        {post.link && (
          <p>
            <LinkedText text={post.link} />
          </p>
        )}
      </div>
      <div className="border-t border-neutral-bg px-4 py-2 sm:pl-[4.25rem]">
        <button type="button" className="inline-flex items-center gap-2 rounded-md py-1 text-[13px] font-semibold text-neutral hover:text-ink" onClick={onReply}>
          <BubbleIcon className="size-4 shrink-0" />
          <span className="text-left [overflow-wrap:anywhere]">{t("classroom.stream.reply", { name: teacherName })}</span>
        </button>
      </div>
    </li>
  );
}

function TaskEntry({ task, teacherName, today, tag }: { task: StudentTask; teacherName: string; today: string; tag: string }) {
  const t = useT();
  const locale = useLocale();
  const state = dueState(task, today);
  const done = state.kind === "done";
  return (
    <li className={CARD}>
      <Link href={taskPath(task.id)} className="flex items-center gap-3 rounded-[10px] px-4 py-3.5 hover:bg-neutral-bg">
        <span aria-hidden="true" className={`grid size-9 shrink-0 place-items-center rounded-full ${done ? "bg-mint text-ink" : "bg-ink text-white"}`}>
          {done ? <CheckIcon className="size-5" /> : <ClipboardIcon className="size-[18px]" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-ink [overflow-wrap:anywhere]">
            {t("classroom.stream.postedTask", { name: teacherName })} <span className="font-semibold">{task.title}</span>
          </span>
          <span className="block text-[13px] text-neutral">
            {shortDate(task.createdAt, tag)}
            {" · "}
            <span className={state.kind === "missing" ? "font-semibold text-urgent" : ""}>{dueLabel(t, state, locale, today)}</span>
          </span>
        </span>
      </Link>
    </li>
  );
}

function ClassPage({ classId }: { classId: string }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const { ready, error, teachers, posts, tasks, conversations, reload } = useStudentClassroom();
  const path = classPath(classId);
  const [conversationId, openConversation] = useOpenConversation(path);
  const tab = useClassTab(TABS);
  const [today] = useState(() => localDate(new Date()));
  const [replyTo, setReplyTo] = useState<StudentPost | null>(null);
  const [shown, setShown] = useState(PAGE_SIZE);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  // The essays switch as just written, shown until the reloaded teacher says the same (or something else).
  const [essays, setEssays] = useState<{ from: boolean; to: boolean } | null>(null);
  const peopleId = useId();

  const view = useMemo(() => classView({ teachers, posts, tasks }, classId), [teachers, posts, tasks, classId]);
  const stream = useMemo(() => (view ? streamOf(view.posts, view.tasks) : []), [view]);
  const next = useMemo(() => (view ? upcoming(view.tasks, today, 3) : []), [view, today]);
  // Opening the Stream is what reads its announcements; the other tabs show none.
  const fresh = useMarkPostsRead(tab === "stream" && view ? view.posts : NO_POSTS);
  const teacherId = view?.teacher.teacherId;
  const openConv = conversationId && teacherId ? (conversations.find((c) => c.id === conversationId && c.otherId === teacherId) ?? null) : null; // an unknown id is ignored

  async function toggleEssays(value: boolean) {
    if (!view) return;
    const { teacher } = view;
    setEssays({ from: teacher.shareEssays, to: value });
    setBusy(true);
    setActionError(null);
    try {
      await setShareEssays(teacher.teacherId, value);
      reload();
    } catch (e) {
      setActionError(classroomError(t, e));
      setEssays(null);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return error ? <LoadFailed error={error} onRetry={reload} /> : <GateSkeleton label={t("classroom.page.loading")} />;
  if (!view) return <NotAvailable title={t("classroom.class.unavailable")} body={t("classroom.class.unavailableBody")} />;

  const { teacher } = view;
  const name = teacher.displayName;
  const shareEssays = essays && essays.from === teacher.shareEssays ? essays.to : teacher.shareEssays;
  const subtitle = [view.year, name, teacher.school].filter(Boolean).join(" · ");
  const tabs = [
    { id: "stream", label: t("classroom.card.stream") },
    { id: "classwork", label: t("classroom.card.classwork") },
    { id: "people", label: t("classroom.class.people") },
  ];
  const visible = stream.slice(0, shown);

  return (
    <div className="space-y-5">
      <Link href="/counselor" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">
        <span aria-hidden="true">←</span>
        {t("classroom.page.title")}
      </Link>

      <ClassBanner theme={view.theme} size="page" title={view.name} subtitle={subtitle} />

      <PageProblem actionError={actionError} loadError={error} onRetry={reload} />

      <div>
        <ClassTabs tabs={tabs} />
        <div {...classPanelProps(tab)} className="pt-5">
          {tab === "stream" && (
            <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
              <div className="order-2 space-y-4 lg:order-1">
                <UpcomingBox items={next} today={today} hrefFor={taskPath} viewAllHref={tabHref(path, "classwork")} />
                <WhatTheySee teacher={{ ...teacher, shareEssays }} busy={busy} onShareEssays={(v) => void toggleEssays(v)} />
              </div>
              <div className="order-1 min-w-0 lg:order-2">
                {stream.length === 0 ? (
                  <p className="text-[15px] text-neutral">{t("classroom.stream.empty", { name })}</p>
                ) : (
                  <ul className="space-y-4">
                    {visible.map((entry) =>
                      entry.kind === "post" ? (
                        <PostEntry key={`post:${entry.post.id}`} post={entry.post} teacherName={name} fresh={fresh.has(entry.post.id)} tag={tag} onReply={() => setReplyTo(entry.post)} />
                      ) : (
                        <TaskEntry key={`task:${entry.task.id}`} task={entry.task} teacherName={name} today={today} tag={tag} />
                      ),
                    )}
                  </ul>
                )}
                {stream.length > visible.length && (
                  <button type="button" className={`${buttonClass("secondary", "sm")} mt-4`} onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    {t("classroom.stream.older")}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "classwork" && (
            <div className="max-w-3xl">
              {view.tasks.length === 0 ? <p className="text-[15px] text-neutral">{t("classroom.classwork.empty")}</p> : <ClassworkList tasks={view.tasks} today={today} />}
            </div>
          )}

          {tab === "people" && (
            <section aria-labelledby={peopleId} className="max-w-3xl space-y-3">
              <h2 id={peopleId} className="border-b border-ink pb-2 font-display text-xl font-bold text-ink">
                {t("classroom.people.teacher")}
              </h2>
              <div className="flex items-center gap-3 py-1">
                <Avatar initial={initialOf(name)} />
                <div className="min-w-0">
                  <p className="font-semibold text-ink [overflow-wrap:anywhere]">{name}</p>
                  {teacher.school && <p className="text-[13px] text-neutral [overflow-wrap:anywhere]">{teacher.school}</p>}
                </div>
              </div>
              <p className="text-[13px] text-neutral">{t("classroom.people.private")}</p>
            </section>
          )}
        </div>
      </div>

      {replyTo && (
        <NewConversation
          key={replyTo.id}
          role="student"
          otherId={teacher.teacherId}
          otherName={name}
          options={NO_OPTIONS}
          initialMessage={`${t("classroom.stream.replyQuote", { title: savedLabel(replyTo.title) ?? "" })}\n`}
          onStarted={(id) => {
            setReplyTo(null);
            openConversation(id);
            reload();
          }}
          onCancel={() => setReplyTo(null)}
        />
      )}

      {openConv && <ConversationPanel key={openConv.id} conversation={openConv} role="student" onClose={() => openConversation(null)} onChanged={reload} />}
    </div>
  );
}
