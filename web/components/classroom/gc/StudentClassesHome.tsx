"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { ActionsMenu } from "@/components/teacher/ActionsMenu";
import { classPath, homeCards, initialOf, oneOnOnePath, taskPath, TODO_PATH, type ClassHomeCard, type HomeCard, type OneOnOneCard } from "@/lib/classes-home";
import { dueState } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { leaveClass, leaveTeacher } from "@/lib/links-api";
import { localDate } from "@/lib/roster";
import { dueSoonCount, type StudentTask } from "@/lib/tasks";
import { buttonClass, PAGE_TITLE } from "@/lib/ui";
import { classroomError, dueLabel } from "../ClassroomText";
import { ConversationPanel } from "../ConversationPanel";
import { JoinBox } from "../JoinBox";
import { refreshClassroomUnread } from "../useClassroomUnread";
import { ClassCard, type ClassCardDue } from "./ClassCard";
import { GateSkeleton, StudentGate } from "./StudentGate";
import { useOpenConversation } from "./useOpenConversation";
import { useStudentClassroom } from "./useStudentClassroom";

const CARD = "rounded-3xl bg-zinc-50 p-5 sm:p-6";

/**
 * The student's Classes home (`/counselor`, spec 3.1): a card for each class the student is in and a 1-on-1 card for each
 * linked teacher, newest activity first, with the To-do link and Join a class. Needs a signed-in student; anyone else
 * gets a skeleton (the role gate sends them on) or a sign-in prompt. `?c=<id>` opens that conversation.
 */
export function StudentClassesHome() {
  return (
    <StudentGate returnTo="/counselor">
      <ClassesHome />
    </StudentGate>
  );
}

function ClassesHome() {
  const t = useT();
  const locale = useLocale();
  const { ready, error, teachers, posts, tasks, conversations, reload } = useStudentClassroom();
  const [conversationId, openConversation] = useOpenConversation("/counselor");
  const [joinOpen, setJoinOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [now] = useState(() => new Date());
  const today = localDate(now);

  const cards = useMemo(() => homeCards({ teachers, posts, tasks, conversations }, today), [teachers, posts, tasks, conversations, today]);
  const openConv = conversationId ? (conversations.find((c) => c.id === conversationId) ?? null) : null; // an unknown id is ignored
  const dueCount = dueSoonCount(tasks, now);

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

  async function onLeaveClass(card: ClassHomeCard) {
    if (!confirm(t("classroom.card.leaveClassConfirm", { class: card.name, name: card.teacher.displayName }))) return;
    if (await run(() => leaveClass(card.classId))) {
      reload();
      refreshClassroomUnread(); // that class's unread announcements no longer count
    }
  }

  async function onLeaveTeacher(card: OneOnOneCard) {
    const name = card.teacher.displayName;
    if (!confirm(t("classroom.sees.leaveConfirm", { name }))) return;
    if (await run(() => leaveTeacher(card.teacher.teacherId))) {
      reload();
      refreshClassroomUnread();
    }
  }

  function joined() {
    setJoinOpen(false);
    reload();
    refreshClassroomUnread();
  }

  const dueItem = (task: StudentTask): ClassCardDue => {
    const state = dueState(task, today);
    return { title: task.title, href: taskPath(task.id), urgent: state.kind === "missing", label: dueLabel(t, state, locale, today) };
  };

  function renderCard(card: HomeCard) {
    const name = card.teacher.displayName;
    if (card.kind === "class") {
      const base = classPath(card.classId);
      return (
        <ClassCard
          href={base}
          theme={card.theme}
          title={card.name}
          subtitle={card.year ?? undefined}
          who={name}
          avatar={initialOf(name)}
          due={card.due.map(dueItem)}
          empty={t("classroom.due.nothingSoon")}
          icons={[
            { icon: "classwork", label: t("classroom.card.classwork"), href: `${base}?tab=classwork` },
            { icon: "stream", label: t(card.unread ? "classroom.card.streamNew" : "classroom.card.stream"), href: `${base}?tab=stream`, dot: card.unread },
          ]}
          menu={
            <ActionsMenu
              label={t("classroom.card.menu", { name: card.name })}
              actions={[{ id: "leave", label: t("classroom.card.leaveClass"), danger: true, onSelect: () => void onLeaveClass(card) }]}
              disabled={busy}
              quiet
              floating
            />
          }
        />
      );
    }
    const base = oneOnOnePath(card.teacher.teacherId);
    // A dot that comes only from an announcement to all students leads to the announcements, not to the comments.
    const id = card.teacher.teacherId;
    const annOnly = card.unread && !conversations.some((c) => c.otherId === id && c.unread > 0);
    return (
      <ClassCard
        href={base}
        theme={card.theme}
        title={t("classroom.oneOnOne.title", { name })}
        subtitle={t("classroom.oneOnOne.subtitle")}
        who={name}
        avatar={initialOf(name)}
        due={card.due.map(dueItem)}
        empty={t("classroom.due.nothingSoon")}
        icons={[
          { icon: "classwork", label: t("classroom.card.classwork"), href: `${base}#private-tasks` },
          { icon: "comments", label: t(card.unread ? "classroom.card.commentsNew" : "classroom.card.comments"), href: `${base}${annOnly ? "#announcements" : "#comments"}`, dot: card.unread },
        ]}
        menu={
          <ActionsMenu
            label={t("classroom.card.menu", { name })}
            actions={[{ id: "leave", label: t("classroom.sees.leave", { name }), danger: true, onSelect: () => void onLeaveTeacher(card) }]}
            disabled={busy}
            quiet
            floating
          />
        }
      />
    );
  }

  if (!ready) {
    return error ? (
      <div className="max-w-xl space-y-3">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
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

  const linked = teachers.length > 0;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className={PAGE_TITLE}>{t("classroom.page.title")}</h1>
        {linked && (
          <div className="flex flex-wrap items-center gap-2">
            <Link href={TODO_PATH} className={buttonClass("ghost", "sm")}>
              {t("classroom.classes.todo")}
              {dueCount > 0 && (
                <>
                  <span aria-hidden="true" className="rounded-full bg-sun px-2 text-xs font-bold leading-5 text-ink tabular-nums">
                    {dueCount}
                  </span>
                  <span className="sr-only">{t("classroom.classes.todoDue", { n: dueCount })}</span>
                </>
              )}
            </Link>
            <button type="button" aria-haspopup="dialog" className={buttonClass("secondary", "sm")} onClick={() => setJoinOpen(true)}>
              {t("classroom.join.open")}
            </button>
          </div>
        )}
      </div>

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

      {!linked ? (
        <div className={`${CARD} max-w-2xl space-y-4`}>
          <p className="text-base leading-relaxed text-ink">{t("classroom.page.empty")}</p>
          <JoinBox onJoined={joined} />
        </div>
      ) : (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(14.5rem,1fr))] gap-4">
          {cards.map((card) => (
            <li key={card.key} className="min-w-0">
              {renderCard(card)}
            </li>
          ))}
        </ul>
      )}

      {joinOpen && (
        <Modal title={<h2 className="text-lg font-semibold">{t("classroom.join.open")}</h2>} onClose={() => setJoinOpen(false)} className="w-[min(32rem,calc(100vw-2rem))]">
          <JoinBox onJoined={joined} />
        </Modal>
      )}

      {openConv && <ConversationPanel key={openConv.id} conversation={openConv} role="student" onClose={() => openConversation(null)} onChanged={reload} />}
    </div>
  );
}
