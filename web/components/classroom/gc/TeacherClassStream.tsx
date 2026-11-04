"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Run } from "@/components/TeacherClassCard";
import { archivePost } from "@/lib/classroom-api";
import { tabHref } from "@/lib/class-tab";
import type { TeacherPost } from "@/lib/classroom";
import { streamOf, upcoming } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import type { TeacherClass } from "@/lib/links-api";
import { isForAllStudents, teacherDueLabel, type TeacherWork } from "@/lib/teacher-class";
import { buttonClass } from "@/lib/ui";
import { classroomError, shortDate } from "../ClassroomText";
import { PostComposer } from "../PostComposer";
import { PostBody } from "../TeacherPostItem";
import { ClassCodeBox } from "./ClassCodeBox";
import { ClipboardIcon, StreamIcon } from "./gcIcons";
import { UpcomingBox } from "./UpcomingBox";

/** How many Stream items show before "Show older". */
const PAGE_SIZE = 20;
const CARD = "rounded-[10px] border border-neutral-line bg-white";
const BADGE = "grid size-9 shrink-0 place-items-center rounded-full bg-ink text-white";

/**
 * The Stream tab of a teacher's class page (spec 4.2). Left column: the Class code box (not for an archived class) and
 * Upcoming. Main column: "Announce something to your class" (opens the announcement form on this class), then the feed:
 * this class's announcements and its new tasks, pinned first and then newest first, with the teacher's announcements to
 * all their students tagged "To all your students". Each announcement keeps its Read by / Edit / Archive. A post that
 * is archived leaves the feed (Messages > Announcements brings it back).
 *
 * `posts` is the feed's announcements (`classFeedPosts`), or null when they could not be loaded; `work` the class's live
 * tasks (`classWork`). `today` is the teacher's local `YYYY-MM-DD`, `now` the page's load time in milliseconds, `initial`
 * the letter on the "Announce" box's avatar, `path` the class page's address (for the Classwork links), `run` does a
 * write and reloads the page's data, `reload` just reloads it.
 */
export function TeacherClassStream({
  cls,
  posts,
  work,
  tasksFailed = false,
  today,
  now,
  initial,
  path,
  busy,
  run,
  reload,
}: {
  cls: TeacherClass;
  posts: TeacherPost[] | null;
  work: TeacherWork[];
  /** The tasks could not be loaded (`work` is empty then): Upcoming and the feed say so instead of "nothing yet". */
  tasksFailed?: boolean;
  today: string;
  now: number;
  initial: string;
  path: string;
  busy: boolean;
  run: Run;
  reload: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";
  const [shown, setShown] = useState(PAGE_SIZE);
  // The announcement form: absent, a new one (post null) or an edit of one.
  const [composer, setComposer] = useState<{ post: TeacherPost | null } | null>(null);
  const [postBusy, setPostBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const feed = useMemo(() => streamOf(posts ?? [], work), [posts, work]);
  const next = useMemo(() => upcoming(work, today, 3), [work, today]);
  const visible = feed.slice(0, shown);
  const classwork = tabHref(path, "classwork");

  async function archive(p: TeacherPost) {
    if (!confirm(t("classroom.ann.archiveConfirm", { title: p.title }))) return;
    setPostBusy(true);
    setActionError(null);
    try {
      await archivePost(p.id, true);
      reload();
    } catch (e) {
      setActionError(classroomError(t, e));
    } finally {
      setPostBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <div className="order-2 space-y-4 lg:order-1">
          {!cls.archived && <ClassCodeBox cls={cls} now={now} busy={busy} run={run} />}
          <UpcomingBox items={next} today={today} hrefFor={() => classwork} viewAllHref={classwork} onRetry={tasksFailed ? reload : undefined} />
        </div>

        <div className="order-1 min-w-0 space-y-4 lg:order-2">
          {cls.archived ? (
            <p className="rounded-[10px] bg-neutral-bg px-4 py-3 text-sm text-ink">{t("classroom.tc.archivedNote")}</p>
          ) : (
            <button
              type="button"
              className={`${CARD} flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm text-neutral hover:border-ink hover:text-ink`}
              onClick={() => setComposer({ post: null })}
            >
              <span aria-hidden="true" className={`${BADGE} font-bold`}>
                {initial}
              </span>
              {t("classroom.tc.announce")}
            </button>
          )}

          {(actionError || posts === null || tasksFailed) && (
            <p role="alert" className="text-sm text-urgent">
              {actionError ?? t("common.tryAgain")}
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

          {feed.length === 0 ? (
            posts !== null && !tasksFailed && <p className="text-[15px] text-neutral">{t("classroom.tc.feedEmpty")}</p>
          ) : (
            <ul className="space-y-4">
              {visible.map((entry) =>
                entry.kind === "post" ? (
                  <li key={`post:${entry.post.id}`} className={`${CARD} flex gap-3 p-4`}>
                    <span aria-hidden="true" className={BADGE}>
                      <StreamIcon className="size-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <PostBody
                        post={entry.post}
                        tag={tag}
                        busy={postBusy || busy}
                        alwaysOpen
                        audience={isForAllStudents(entry.post) ? t("classroom.tc.toAll") : null}
                        onEdit={() => setComposer({ post: entry.post })}
                        onArchive={() => void archive(entry.post)}
                      />
                    </div>
                  </li>
                ) : (
                  <li key={`task:${entry.task.id}`} className={CARD}>
                    <Link href={classwork} className="flex items-center gap-3 rounded-[10px] px-4 py-3.5 hover:bg-neutral-bg">
                      <span aria-hidden="true" className={BADGE}>
                        <ClipboardIcon className="size-[18px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm text-ink [overflow-wrap:anywhere]">
                          {t("classroom.tc.postedTask")} <span className="font-semibold">{entry.task.title}</span>
                        </span>
                        <span className="block text-[13px] text-neutral">
                          {shortDate(entry.task.createdAt, tag)}
                          {" · "}
                          {teacherDueLabel(t, entry.task.dueOn, today, locale)}
                          {entry.task.totalCount > 0 ? ` · ${t("teacher.tasks.progress", { done: entry.task.doneCount, total: entry.task.totalCount })}` : ""}
                        </span>
                      </span>
                    </Link>
                  </li>
                ),
              )}
            </ul>
          )}
          {feed.length > visible.length && (
            <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setShown((n) => n + PAGE_SIZE)}>
              {t("classroom.stream.older")}
            </button>
          )}
        </div>
      </div>

      {composer && (
        <PostComposer
          key={composer.post?.id ?? "new"}
          presetClassId={cls.id}
          post={composer.post ?? undefined}
          onSaved={() => {
            setComposer(null);
            reload();
          }}
          onCancel={() => setComposer(null)}
        />
      )}
    </>
  );
}
