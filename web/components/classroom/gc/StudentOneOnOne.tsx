"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { filterConversations, shownPosts, sortPosts, type StudentPost } from "@/lib/classroom";
import { themeFor } from "@/lib/class-theme";
import { oneOnOnePath } from "@/lib/classes-home";
import { useLocale, useT } from "@/lib/i18n/client";
import { collegeNames, leaveTeacher, setShareEssays } from "@/lib/links-api";
import { localDate } from "@/lib/roster";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";
import { studentAnchorOptions } from "../anchorOptions";
import { classroomError, shortDate } from "../ClassroomText";
import { ConversationPanel } from "../ConversationPanel";
import { LinkedText } from "../LinkedText";
import { NewConversation } from "../NewConversation";
import { refreshClassroomUnread } from "../useClassroomUnread";
import { WhatTheySee } from "../WhatTheySee";
import { ClassBanner } from "./ClassBanner";
import { ClassworkList } from "./ClassworkList";
import { ConversationRow } from "./ConversationRow";
import { GateSkeleton, StudentGate } from "./StudentGate";
import { useMarkPostsRead } from "./useMarkPostsRead";
import { useOpenConversation } from "./useOpenConversation";
import { useStudentClassroom } from "./useStudentClassroom";

const NO_NAMES: ReadonlyMap<string, string> = new Map();
const SECTION_TITLE = "font-display text-xl font-bold tracking-tight text-ink";
const BADGE = "rounded-full border px-2 py-0.5 text-[13px] font-semibold";

/**
 * One linked teacher's 1-on-1 page (`/counselor/teacher/<teacherId>`, spec 3.3): what they can see of the student and
 * Leave, the announcements they sent to all their students, the private tasks they gave this student, and the
 * comments between them. Only this student and the teacher see the tasks and comments. Opening the page marks the
 * announcements it shows as read. `?c=<id>` opens that conversation.
 */
export function StudentOneOnOne({ teacherId }: { teacherId: string }) {
  return (
    <StudentGate returnTo={oneOnOnePath(teacherId)}>
      <OneOnOne teacherId={teacherId} />
    </StudentGate>
  );
}

function PostItem({ post, fresh, tag }: { post: StudentPost; fresh: boolean; tag: string }) {
  const t = useT();
  return (
    <li className="rounded-[10px] border border-neutral-line bg-white p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="font-semibold text-ink [overflow-wrap:anywhere]">{post.title}</h3>
        {fresh && <span className={`${BADGE} ${toneClass("progress")}`}>{t("classroom.post.new")}</span>}
        {post.pinned && <span className={`${BADGE} ${toneClass("neutral")}`}>{t("classroom.post.pinned")}</span>}
      </div>
      <p className="text-[13px] text-neutral">
        <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
        {` · ${t("classroom.post.toAll")}`}
      </p>
      <div className="mt-2 space-y-2 text-sm leading-relaxed text-ink">
        <LinkedText text={post.body} />
        {post.link && (
          <p>
            <LinkedText text={post.link} />
          </p>
        )}
      </div>
    </li>
  );
}

function OneOnOne({ teacherId }: { teacherId: string }) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const router = useRouter();
  const student = useStudent();
  const { ready, error, teachers, posts, tasks, conversations, reload } = useStudentClassroom();
  const [conversationId, openConversation] = useOpenConversation(oneOnOnePath(teacherId));
  const [now] = useState(() => new Date());
  const today = localDate(now);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [allPosts, setAllPosts] = useState(false);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(NO_NAMES);
  // The essays switch as just written, shown until the reloaded teacher says the same (or something else).
  const [essays, setEssays] = useState<{ from: boolean; to: boolean } | null>(null);
  const announcementsId = useId();
  const tasksId = useId();
  const commentsId = useId();

  const teacher = teachers.find((x) => x.teacherId === teacherId);
  // Only what this teacher sent to all their students (class announcements live on the class pages) and what only this student gets.
  const toAll = useMemo(() => posts.filter((p) => p.teacherId === teacherId && p.classId === null), [posts, teacherId]);
  const privateTasks = useMemo(() => tasks.filter((x) => x.teacherId === teacherId && x.classId === null), [tasks, teacherId]);
  const comments = useMemo(() => filterConversations(conversations.filter((c) => c.otherId === teacherId), "all", null), [conversations, teacherId]);
  const fresh = useMarkPostsRead(toAll);

  const openConv = conversationId ? (comments.find((c) => c.id === conversationId) ?? null) : null; // an unknown id is ignored

  // Display names of the colleges on the list, for the "About" choices of a new message. Without them the slugs show.
  const slugKey = student.list
    .filter((e) => !e.custom)
    .map((e) => e.slug)
    .sort()
    .join(",");
  useEffect(() => {
    if (!askOpen || !slugKey) return;
    let live = true;
    collegeNames(slugKey.split(",")).then(
      (m) => live && setNames(m),
      () => {}, // the choices then show slugs
    );
    return () => {
      live = false;
    };
  }, [askOpen, slugKey]);

  // The Classes cards link to #private-tasks and #comments; the sections exist only once the data is in.
  const found = teacher !== undefined;
  useEffect(() => {
    if (!ready || !found) return;
    try {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (id) document.getElementById(id)?.scrollIntoView();
    } catch {
      // a malformed hash: stay at the top
    }
  }, [ready, found]);

  /** Runs a write with the page's busy flag, shows its error, and returns whether it worked. */
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

  if (!ready) {
    return error ? (
      <div className="max-w-xl space-y-3">
        <p role="alert" className="text-sm text-urgent">
          {error}
        </p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={reload}>
          {t("classroom.retry")}
        </button>
      </div>
    ) : (
      <GateSkeleton label={t("classroom.page.loading")} />
    );
  }

  if (!teacher) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="font-display text-2xl font-bold text-ink">{t("classroom.oneOnOne.missing")}</h1>
        <p className="text-base text-ink">{t("classroom.oneOnOne.missingBody")}</p>
        <Link href="/counselor" className={buttonClass("secondary", "sm")}>
          {t("classroom.back.classes")}
        </Link>
      </div>
    );
  }

  const name = teacher.displayName;
  const shareEssays = essays && essays.from === teacher.shareEssays ? essays.to : teacher.shareEssays;
  const shownToAll = allPosts ? sortPosts(toAll) : shownPosts(toAll);

  async function toggleEssays(value: boolean) {
    if (!teacher) return;
    setEssays({ from: teacher.shareEssays, to: value });
    if (await run(() => setShareEssays(teacherId, value))) reload();
    else setEssays(null);
  }

  async function onLeave() {
    if (!confirm(t("classroom.sees.leaveConfirm", { name }))) return;
    if (await run(() => leaveTeacher(teacherId))) {
      refreshClassroomUnread();
      router.push("/counselor");
    }
  }

  return (
    <div className="space-y-5">
      <Link href="/counselor" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink underline-offset-4 hover:underline">
        <span aria-hidden="true">←</span>
        {t("classroom.page.title")}
      </Link>

      <ClassBanner
        theme={themeFor(teacherId)}
        size="page"
        title={t("classroom.oneOnOne.title", { name })}
        subtitle={[teacher.school, t("classroom.oneOnOne.subtitle")].filter(Boolean).join(" · ")}
      />

      {(actionError || error) && (
        <p role="alert" className="text-sm text-urgent">
          {actionError ?? error}
          {!actionError && (
            <>
              {" "}
              <button type="button" className="font-semibold underline underline-offset-4" onClick={reload}>
                {t("classroom.retry")}
              </button>
            </>
          )}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[19rem_minmax(0,1fr)] lg:items-start">
        <div className="order-2 lg:order-1">
          <WhatTheySee teacher={{ ...teacher, shareEssays }} busy={busy} onShareEssays={(v) => void toggleEssays(v)} onLeave={() => void onLeave()} />
        </div>

        <div className="order-1 min-w-0 space-y-8 lg:order-2">
          {toAll.length > 0 && (
            <section aria-labelledby={announcementsId} className="space-y-3">
              <h2 id={announcementsId} className={SECTION_TITLE}>
                {t("classroom.card.announcements")}
              </h2>
              <ul className="space-y-3">
                {shownToAll.map((p) => (
                  <PostItem key={p.id} post={p} fresh={fresh.has(p.id)} tag={tag} />
                ))}
              </ul>
              {toAll.length > shownToAll.length || allPosts ? (
                <button type="button" aria-expanded={allPosts} className={buttonClass("quiet", "sm")} onClick={() => setAllPosts((v) => !v)}>
                  {allPosts ? t("classroom.card.showLess") : t("classroom.card.showAll", { n: toAll.length })}
                </button>
              ) : null}
            </section>
          )}

          <section id="private-tasks" aria-labelledby={tasksId} className="scroll-mt-4 space-y-3">
            <div className="space-y-0.5">
              <h2 id={tasksId} className={SECTION_TITLE}>
                {t("classroom.oneOnOne.tasks")}
              </h2>
              <p className="text-[13px] text-neutral">{t("classroom.visible.student", { name })}</p>
            </div>
            {privateTasks.length === 0 ? <p className="text-[15px] text-neutral">{t("classroom.card.noTasks")}</p> : <ClassworkList tasks={privateTasks} today={today} />}
          </section>

          <section id="comments" aria-labelledby={commentsId} className="scroll-mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="space-y-0.5">
                <h2 id={commentsId} className={SECTION_TITLE}>
                  {t("classroom.card.comments")}
                </h2>
                <p className="text-[13px] text-neutral">{t("classroom.visible.student", { name })}</p>
              </div>
              <button type="button" aria-haspopup="dialog" className={buttonClass("secondary", "sm")} onClick={() => setAskOpen(true)}>
                {t("classroom.card.ask", { name })}
              </button>
            </div>
            {comments.length === 0 ? (
              <p className="text-[15px] text-neutral">{t("classroom.card.noComments")}</p>
            ) : (
              <ul className="divide-y divide-neutral-bg rounded-[10px] border border-neutral-line bg-white">
                {comments.map((c) => (
                  <ConversationRow key={c.id} conversation={c} now={now} onOpen={() => openConversation(c.id)} />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {askOpen && (
        <NewConversation
          key={teacherId}
          role="student"
          otherId={teacherId}
          otherName={name}
          options={studentAnchorOptions(student, shareEssays, t, names)}
          onStarted={(id) => {
            setAskOpen(false);
            openConversation(id);
            reload();
          }}
          onCancel={() => setAskOpen(false)}
        />
      )}

      {openConv && <ConversationPanel key={openConv.id} conversation={openConv} role="student" onClose={() => openConversation(null)} onChanged={reload} />}
    </div>
  );
}
