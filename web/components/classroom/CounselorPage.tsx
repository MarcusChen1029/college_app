"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import type { Anchor } from "@/lib/anchors";
import { markPostsRead, myConversations, myPosts } from "@/lib/classroom-api";
import { byRecentActivity, type Conversation, type StudentPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { collegeNames, leaveClass, leaveTeacher, myTeachers, setShareEssays, type MyTeacher } from "@/lib/links-api";
import { useStudent } from "@/lib/student-store";
import type { StudentTask } from "@/lib/tasks";
import { myTasks, setTaskDone } from "@/lib/tasks-api";
import { buttonClass, PAGE_TITLE } from "@/lib/ui";
import { studentAnchorOptions } from "./anchorOptions";
import { classroomError } from "./ClassroomText";
import { ConversationPanel } from "./ConversationPanel";
import { JoinBox } from "./JoinBox";
import { NewConversation } from "./NewConversation";
import { TeacherCard } from "./TeacherCard";
import { useFocusTarget } from "./useFocusTarget";
import { refreshClassroomUnread } from "./useClassroomUnread";

const noop = () => () => {};
const CARD = "rounded-3xl bg-zinc-50 p-5 sm:p-6";
const NO_NAMES: ReadonlyMap<string, string> = new Map();

type Data = { teachers: MyTeacher[]; tasks: StudentTask[]; posts: StudentPost[]; conversations: Conversation[] };

const loadAll = async (): Promise<Data> => {
  const [teachers, tasks, posts, conversations] = await Promise.all([myTeachers(), myTasks(), myPosts(), myConversations()]);
  return { teachers, tasks, posts, conversations };
};

/** The page's own address for an open conversation, so a reload or a shared link comes back to it (spec 4.2). */
const conversationUrl = (id: string | null): string => (id ? `/counselor?c=${encodeURIComponent(id)}` : "/counselor");

/**
 * The student's Counselors page (spec 4.1): one card per linked teacher, or the join box when there is none. Needs a
 * signed-in student; anyone else gets a skeleton (the role gate sends them on) or a sign-in prompt.
 */
export function CounselorPage() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  if (!mounted || !student.ready || !student.sessionChecked) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;
  if (!student.auth) {
    return (
      <div className="max-w-xl space-y-4">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
        <p className="text-base text-ink">{t("classroom.page.signIn")}</p>
        <GoogleSignIn returnTo="/counselor" />
      </div>
    );
  }
  // A teacher, or an account that has not chosen a role yet: RoleGate is already sending them elsewhere.
  if (student.role !== "student") return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;
  return <Counselors key={student.auth.userId} />;
}

function Counselors() {
  const t = useT();
  const student = useStudent();
  const params = useSearchParams();

  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busy, setBusy] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [askFor, setAskFor] = useState<MyTeacher | null>(null);
  const [forceTask, setForceTask] = useState<string | null>(null);
  // Announcements that were unread when they first arrived on this page. Reading them (below) clears their unread state
  // on the server, but they keep their New badge until the student leaves.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const [now] = useState(() => new Date());
  const [names, setNames] = useState<ReadonlyMap<string, string>>(NO_NAMES);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    loadAll().then(
      (d) => {
        if (!live) return;
        setData(d);
        setLoadError(null);
        setFresh((cur) => {
          const unread = d.posts.filter((p) => !p.read && !cur.has(p.id));
          return unread.length === 0 ? cur : new Set([...cur, ...unread.map((p) => p.id)]);
        });
      },
      (e) => {
        if (live) setLoadError(classroomError(t, e));
      },
    );
    return () => {
      live = false;
    };
  }, [nonce, t]);

  // Opening the page marks the announcements it shows as read (every unread one is shown), then the header dot catches up.
  const marked = useRef(new Set<string>());
  useEffect(() => {
    if (!data) return;
    const ids = data.posts.filter((p) => !p.read && !marked.current.has(p.id)).map((p) => p.id);
    if (ids.length === 0) return;
    for (const id of ids) marked.current.add(id);
    markPostsRead(ids).then(
      () => refreshClassroomUnread(),
      () => {
        for (const id of ids) marked.current.delete(id); // try again on the next load
      },
    );
  }, [data]);

  // Display names of the colleges on the list, for the "About" choices of a new message. Without them the slugs show.
  const slugKey = student.list
    .filter((e) => !e.custom)
    .map((e) => e.slug)
    .sort()
    .join(",");
  useEffect(() => {
    if (!slugKey) return;
    let live = true;
    collegeNames(slugKey.split(",")).then(
      (m) => live && setNames(m),
      () => {}, // the choices then show slugs
    );
    return () => {
      live = false;
    };
  }, [slugKey]);

  // The conversation in the address (?c=<id>) is open; opening and closing keep the address in step without a navigation.
  const param = params.get("c");
  const [seenParam, setSeenParam] = useState(param);
  const [openId, setOpenId] = useState<string | null>(param);
  if (param !== seenParam) {
    setSeenParam(param);
    setOpenId(param);
  }
  const openConversation = useCallback((id: string | null) => {
    setOpenId(id);
    window.history.replaceState(null, "", conversationUrl(id));
  }, []);

  // ?focus=task:<id> scrolls to a task; its list opens first if the task is among the hidden ones.
  useFocusTarget({
    ready: data !== null,
    open: (a: Anchor) => {
      if (a.kind === "task") setForceTask(a.ref);
    },
  });

  const ordered = useMemo(() => (data ? byRecentActivity(data.teachers, data.posts, data.conversations) : []), [data]);
  const openConv = data && openId ? (data.conversations.find((c) => c.id === openId) ?? null) : null; // an unknown id is ignored

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

  async function toggleTask(task: StudentTask, done: boolean) {
    setActionError(null);
    const patch = (next: StudentTask) => setData((d) => d && { ...d, tasks: d.tasks.map((x) => (x.id === task.id ? next : x)) });
    patch({ ...task, done, doneAt: done ? new Date().toISOString() : null });
    try {
      await setTaskDone(task.id, done);
    } catch (e) {
      patch(task);
      setActionError(classroomError(t, e));
    }
  }

  async function toggleEssays(teacher: MyTeacher, value: boolean) {
    const set = (v: boolean) => setData((d) => d && { ...d, teachers: d.teachers.map((x) => (x.teacherId === teacher.teacherId ? { ...x, shareEssays: v } : x)) });
    set(value);
    if (!(await run(() => setShareEssays(teacher.teacherId, value)))) set(!value);
  }

  async function onLeaveClass(teacher: MyTeacher, cls: { id: string; name: string }) {
    if (!confirm(t("classroom.card.leaveClassConfirm", { class: cls.name, name: teacher.displayName }))) return;
    if (await run(() => leaveClass(cls.id))) {
      reload();
      refreshClassroomUnread(); // that class's unread announcements no longer count
    }
  }

  async function onLeave(teacher: MyTeacher) {
    if (!confirm(t("classroom.sees.leaveConfirm", { name: teacher.displayName }))) return;
    if (await run(() => leaveTeacher(teacher.teacherId))) {
      reload();
      refreshClassroomUnread();
    }
  }

  function joined() {
    setJoinOpen(false);
    reload();
    refreshClassroomUnread();
  }

  if (data === null) {
    return loadError ? (
      <div className="max-w-xl space-y-3">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
        <p role="alert" className="text-sm text-urgent">
          {loadError}
        </p>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={reload}>
          {t("classroom.retry")}
        </button>
      </div>
    ) : (
      <div role="status" aria-busy="true" className="h-96 animate-pulse rounded-3xl bg-zinc-100">
        <span className="sr-only">{t("classroom.page.loading")}</span>
      </div>
    );
  }

  const linked = data.teachers.length > 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
        {linked && (
          <button type="button" aria-expanded={joinOpen} className={buttonClass("secondary", "sm")} onClick={() => setJoinOpen((o) => !o)}>
            {t("classroom.join.open")}
          </button>
        )}
      </div>

      {(actionError || loadError) && (
        <p role="alert" className="text-sm text-urgent">
          {actionError ?? loadError}
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

      {!linked ? (
        <div className={`${CARD} max-w-2xl space-y-4`}>
          <p className="text-base leading-relaxed text-ink">{t("classroom.page.empty")}</p>
          <JoinBox onJoined={joined} />
        </div>
      ) : (
        <>
          {joinOpen && (
            <div className={`${CARD} max-w-2xl`}>
              <JoinBox onJoined={joined} />
            </div>
          )}
          <div className="space-y-6">
            {ordered.map((teacher) => (
              <TeacherCard
                key={teacher.teacherId}
                teacher={teacher}
                posts={data.posts.filter((p) => p.teacherId === teacher.teacherId)}
                tasks={data.tasks.filter((x) => x.teacherId === teacher.teacherId)}
                conversations={data.conversations.filter((c) => c.otherId === teacher.teacherId)}
                fresh={fresh}
                focusTaskId={forceTask}
                now={now}
                busy={busy}
                onAsk={() => setAskFor(teacher)}
                onOpenConversation={openConversation}
                onToggleTask={(task, done) => void toggleTask(task, done)}
                onShareEssays={(v) => void toggleEssays(teacher, v)}
                onLeaveClass={(cls) => void onLeaveClass(teacher, cls)}
                onLeave={() => void onLeave(teacher)}
              />
            ))}
          </div>
        </>
      )}

      {askFor && (
        <NewConversation
          key={askFor.teacherId}
          role="student"
          otherId={askFor.teacherId}
          otherName={askFor.displayName}
          options={studentAnchorOptions(student, askFor.shareEssays, t, names)}
          onStarted={(id) => {
            setAskFor(null);
            openConversation(id);
            reload();
          }}
          onCancel={() => setAskFor(null)}
        />
      )}

      {openConv && <ConversationPanel key={openConv.id} conversation={openConv} role="student" onClose={() => openConversation(null)} onChanged={reload} />}
    </div>
  );
}
