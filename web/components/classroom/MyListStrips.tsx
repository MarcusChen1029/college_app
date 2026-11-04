"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { dueSoonCount } from "@/lib/tasks";
import { toneClass } from "@/lib/ui";
import { useClassroomUnread } from "./useClassroomUnread";
import { useStudentTasks } from "./useStudentMarkers";

const STRIP = "block rounded-2xl border px-4 py-2.5 text-sm font-medium leading-snug hover:underline hover:underline-offset-4";

/**
 * "From your counselors: 1 announcement, 2 comments · Open" at the top of My list (spec 4.3): what waits unread on the
 * Counselors page. Nothing when nothing is unread, and for anyone who isn't a student linked to a teacher.
 */
export function CounselorStrip() {
  const t = useT();
  const { role } = useStudent();
  const unread = useClassroomUnread();
  if (role !== "student" || !unread) return null;
  const parts: string[] = [];
  if (unread.posts > 0) parts.push(t(unread.posts === 1 ? "classroom.strip.announcements.one" : "classroom.strip.announcements.other", { n: unread.posts }));
  if (unread.conversations > 0) parts.push(t(unread.conversations === 1 ? "classroom.strip.comments.one" : "classroom.strip.comments.other", { n: unread.conversations }));
  if (parts.length === 0) return null;
  return (
    <Link href="/counselor" className={`${STRIP} ${toneClass("progress")}`}>
      {t("classroom.strip.from", { parts: parts.join(t("classroom.strip.join")) })} · <span className="underline underline-offset-4">{t("classroom.strip.open")}</span>
    </Link>
  );
}

/**
 * "2 tasks due this week · Open" (open tasks from the student's teachers due within a week, overdue ones included),
 * linking to the Counselors page, where the tasks are. Nothing when none is due and for anyone who isn't linked.
 */
export function TasksDueLink() {
  const t = useT();
  const tasks = useStudentTasks();
  const n = tasks ? dueSoonCount(tasks, new Date()) : 0;
  if (n === 0) return null;
  return (
    <Link href="/counselor" className={`${STRIP} ${toneClass("soon")}`}>
      {t(n === 1 ? "classroom.strip.tasksDue.one" : "classroom.strip.tasksDue.other", { n })} · <span className="underline underline-offset-4">{t("classroom.strip.open")}</span>
    </Link>
  );
}
