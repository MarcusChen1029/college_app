"use client";

import { useId, useState } from "react";
import { DeadlineChip } from "@/components/StatusPill";
import { relativeText } from "@/components/TeacherText";
import { focusAttr } from "@/lib/anchors";
import { filterConversations, pairClasses, shownConversations, shownPosts, sortPosts, type Conversation, type StudentPost } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MyTeacher } from "@/lib/links-api";
import { noteDate } from "@/lib/notes-view";
import { relativeTime } from "@/lib/roster-view";
import { shownTasks, sortStudentTasks, taskDays, type StudentTask } from "@/lib/tasks";
import { buttonClass, LABEL, toneClass } from "@/lib/ui";
import { AnchorChip } from "./AnchorChip";
import { LinkedText } from "./LinkedText";
import { WhatTheySee } from "./WhatTheySee";

const BADGE = "rounded-full border px-2 py-0.5 text-[13px] font-semibold";
/** The unread marker's slot: always there, so read and unread rows line up. */
const dot = (on: boolean): string => `mt-2 size-2 shrink-0 rounded-full ${on ? "bg-blue-600" : ""}`;

/** "Nov 2" / "11月2日", or "" for a time that cannot be read. */
function shortDate(iso: string | null, tag: string): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? "" : new Date(t).toLocaleDateString(tag, { month: "short", day: "numeric" });
}

/** One section of a card (Announcements, To do, Comments): a small heading and its rows. */
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2 border-t border-zinc-200 pt-4">
      <h3 id={id} className={LABEL}>
        {title}
      </h3>
      {children}
    </section>
  );
}

/** "Show all (6)" / "Show less" under a list that shows only its newest rows. Nothing when the list is already complete. */
function MoreButton({ total, shown, open, onToggle }: { total: number; shown: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  if (total <= shown) return null;
  return (
    <button type="button" aria-expanded={open} className={buttonClass("quiet", "sm")} onClick={onToggle}>
      {open ? t("classroom.card.showLess") : t("classroom.card.showAll", { n: total })}
    </button>
  );
}

function PostRow({ post, fresh, tag }: { post: StudentPost; fresh: boolean; tag: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const audience = post.classId ? (post.className ?? "") : t("classroom.post.toAll");
  return (
    <li className="py-2">
      <button type="button" aria-expanded={open} className="flex w-full items-start gap-2 text-left" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true" className={dot(fresh)} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink [overflow-wrap:anywhere]">{post.title}</span>
            {fresh && <span className={`${BADGE} ${toneClass("progress")}`}>{t("classroom.post.new")}</span>}
            {post.pinned && <span className={`${BADGE} ${toneClass("neutral")}`}>{t("classroom.post.pinned")}</span>}
          </span>
          <span className="block text-[13px] text-zinc-600 [overflow-wrap:anywhere]">
            <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
            {audience ? ` · ${audience}` : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="mt-2 ml-4 space-y-2 text-sm text-ink">
          <LinkedText text={post.body} />
          {post.link && (
            <p>
              <LinkedText text={post.link} />
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function TaskRow({ task, now, tag, onToggle }: { task: StudentTask; now: Date; tag: string; onToggle: (done: boolean) => void }) {
  const t = useT();
  const days = taskDays(task, now);
  return (
    // A jump link to a task (?focus=task:<id>) lands on this row.
    <li data-focus={focusAttr({ kind: "task", ref: task.id })} className="py-2.5">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
        <label className="flex min-w-0 flex-1 basis-56 items-start gap-3">
          <input type="checkbox" className="mt-1 size-4 shrink-0" checked={task.done} onChange={(e) => onToggle(e.target.checked)} />
          <span className="min-w-0">
            <span className={`block font-medium [overflow-wrap:anywhere] ${task.done ? "text-zinc-600 line-through" : "text-ink"}`}>{task.title}</span>
            {task.details && <span className="mt-0.5 block text-sm whitespace-pre-line text-zinc-700 [overflow-wrap:anywhere]">{task.details}</span>}
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-zinc-700">
          {task.about && <AnchorChip info={task.about} role="student" />}
          {task.done ? (
            <span>{t("classroom.task.doneOn", { date: shortDate(task.doneAt, tag) })}</span>
          ) : (
            // DeadlineChip's tone is taskTone's for an open task: overdue and the last week are urgent.
            task.dueOn && days != null && <DeadlineChip date={task.dueOn} days={days} done={false} label={t("classroom.task.due")} />
          )}
          {task.classId ? task.className && <span className="[overflow-wrap:anywhere]">{task.className}</span> : <span>{t("classroom.task.onlyYou")}</span>}
        </div>
      </div>
    </li>
  );
}

function CommentRow({ conversation: c, now, tag, onOpen }: { conversation: Conversation; now: Date; tag: string; onOpen: () => void }) {
  const t = useT();
  const unread = c.unread > 0;
  const body = c.lastBody === null ? t("classroom.conv.removed") : c.lastBody;
  const snippet = c.lastAuthor === "student" ? `${t("classroom.conv.you")}: ${body}` : body;
  const when = relativeText(t, relativeTime(c.lastMessageAt, now));
  return (
    <li className="flex items-start gap-2 py-2">
      <span aria-hidden="true" className={dot(unread)} />
      <div className="min-w-0 flex-1 space-y-1">
        <AnchorChip info={c.about} role="student" conversationId={c.id} />
        <button type="button" className="block w-full text-left" onClick={onOpen}>
          {/* Inside the button, so a screen reader announces "Unread" with the row it opens. */}
          {unread && <span className="sr-only">{t("classroom.row.unread")}</span>}
          <span className={`line-clamp-2 text-sm [overflow-wrap:anywhere] ${unread ? "font-semibold text-ink" : "text-zinc-700"}`}>{snippet}</span>
          <span className="block text-[13px] text-zinc-600">
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

/**
 * Everything about one linked teacher (spec 4.1): who they are and the classes the student is in with them (each with
 * Leave class), their announcements, the tasks they gave, the comments between them, and what they can see. Lists show
 * every unread item plus the latest read ones, three in all, with Show all. The page does the loading and writing;
 * `posts`, `tasks` and `conversations` are this teacher's only. `fresh` holds the announcements that were unread when
 * the page opened, so they keep their New badge for this visit. A task being jumped to (`focusTaskId`) opens the list.
 */
export function TeacherCard({
  teacher,
  posts,
  tasks,
  conversations,
  fresh,
  focusTaskId,
  now,
  busy,
  onAsk,
  onOpenConversation,
  onToggleTask,
  onShareEssays,
  onLeaveClass,
  onLeave,
}: {
  teacher: MyTeacher;
  posts: StudentPost[];
  tasks: StudentTask[];
  conversations: Conversation[];
  fresh: ReadonlySet<string>;
  focusTaskId: string | null;
  now: Date;
  busy: boolean;
  onAsk: () => void;
  onOpenConversation: (id: string) => void;
  onToggleTask: (task: StudentTask, done: boolean) => void;
  onShareEssays: (value: boolean) => void;
  onLeaveClass: (cls: { id: string; name: string }) => void;
  onLeave: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const headingId = useId();
  const name = teacher.displayName;
  const [allPosts, setAllPosts] = useState(false);
  const [allTasks, setAllTasks] = useState(false);
  const [allComments, setAllComments] = useState(false);

  const classes = pairClasses(teacher.classNames, teacher.classIds);
  const linked = new Date(teacher.linkedAt).toLocaleDateString(tag);

  const postsShort = shownPosts(posts);
  const postRows = allPosts ? sortPosts(posts) : postsShort;
  const taskShort = shownTasks(tasks);
  const tasksOpen = allTasks || (focusTaskId !== null && tasks.some((x) => x.id === focusTaskId));
  const taskRows = tasksOpen ? sortStudentTasks(tasks) : taskShort;
  const commentsShort = shownConversations(conversations);
  const commentRows = allComments ? filterConversations(conversations, "all", null) : commentsShort;

  return (
    <section aria-labelledby={headingId} className="space-y-4 rounded-3xl bg-zinc-50 p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-60 space-y-1">
          <h2 id={headingId} className="font-display text-xl font-bold tracking-tight text-ink [overflow-wrap:anywhere]">
            {name}
          </h2>
          <p className="text-sm text-zinc-700 [overflow-wrap:anywhere]">{[teacher.school, t("classroom.card.linked", { date: linked })].filter(Boolean).join(" · ")}</p>
          {classes.length > 0 && (
            <ul className="flex flex-wrap gap-x-3 gap-y-2 pt-1">
              {classes.map((c, i) => (
                <li key={c.id ?? `${c.name}-${i}`} className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-zinc-200 bg-white px-2.5 py-0.5 text-[13px] font-semibold text-ink [overflow-wrap:anywhere]">{c.name}</span>
                  {c.id && (
                    <button
                      type="button"
                      disabled={busy}
                      className={buttonClass("ghost", "sm")}
                      aria-label={t("classroom.card.leaveClassLabel", { class: c.name })}
                      onClick={() => onLeaveClass({ id: c.id!, name: c.name })}
                    >
                      {t("classroom.card.leaveClass")}
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={onAsk}>
          {t("classroom.card.ask", { name })}
        </button>
      </header>

      <Block title={t("classroom.card.announcements")}>
        {postRows.length === 0 ? (
          <p className="text-[15px] text-zinc-700">{t("classroom.card.noPosts")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {postRows.map((p) => (
              <PostRow key={p.id} post={p} fresh={fresh.has(p.id)} tag={tag} />
            ))}
          </ul>
        )}
        <MoreButton total={posts.length} shown={postsShort.length} open={allPosts} onToggle={() => setAllPosts((v) => !v)} />
      </Block>

      <Block title={t("classroom.card.todo")}>
        {taskRows.length === 0 ? (
          <p className="text-[15px] text-zinc-700">{t("classroom.card.noTasks")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {taskRows.map((x) => (
              <TaskRow key={x.id} task={x} now={now} tag={tag} onToggle={(done) => onToggleTask(x, done)} />
            ))}
          </ul>
        )}
        <MoreButton total={tasks.length} shown={taskShort.length} open={tasksOpen} onToggle={() => setAllTasks(!tasksOpen)} />
      </Block>

      <Block title={t("classroom.card.comments")}>
        {commentRows.length === 0 ? (
          <p className="text-[15px] text-zinc-700">{t("classroom.card.noComments")}</p>
        ) : (
          <ul className="divide-y divide-zinc-200">
            {commentRows.map((c) => (
              <CommentRow key={c.id} conversation={c} now={now} tag={tag} onOpen={() => onOpenConversation(c.id)} />
            ))}
          </ul>
        )}
        <MoreButton total={conversations.length} shown={commentsShort.length} open={allComments} onToggle={() => setAllComments((v) => !v)} />
        <div>
          <button type="button" className={buttonClass("ghost", "sm")} onClick={onAsk}>
            {t("classroom.card.newMessage")}
          </button>
        </div>
      </Block>

      <WhatTheySee teacher={teacher} busy={busy} onShareEssays={onShareEssays} onLeave={onLeave} />
    </section>
  );
}
