"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { archivePost, teacherPosts } from "@/lib/classroom-api";
import { sortPosts, type TeacherPost } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { buttonClass, PAGE_INTRO } from "@/lib/ui";
import { classroomError } from "./ClassroomText";
import { PostComposer } from "./PostComposer";
import { PostItem } from "./TeacherPostItem";

const LIST = "divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white";

/**
 * The Announcements tab of the teacher's Messages page (spec 5.3): "+ New announcement", the teacher's announcements
 * pinned first and then newest first (each opens to its text and link, with "Read by X of Y" showing who has not read it
 * yet), Edit and Archive, and the archived ones folded under their own heading, where Restore brings them back.
 */
export function TeacherAnnouncements() {
  const t = useT();
  const locale = useLocale();
  const tag = locale === "zh-TW" ? "zh-TW" : "en-US";

  const [posts, setPosts] = useState<TeacherPost[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  // The form: absent, a new announcement (post null) or an edit of one.
  const [composer, setComposer] = useState<{ post: TeacherPost | null } | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    teacherPosts().then(
      (p) => {
        if (!live) return;
        setPosts(p);
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

  const active = useMemo(() => sortPosts((posts ?? []).filter((p) => !p.archived)), [posts]);
  const archived = useMemo(() => sortPosts((posts ?? []).filter((p) => p.archived)), [posts]);

  async function setArchived(p: TeacherPost, value: boolean) {
    if (value && !confirm(t("classroom.ann.archiveConfirm", { title: p.title }))) return;
    setBusyId(p.id);
    setActionError(null);
    try {
      await archivePost(p.id, value);
      reload();
    } catch (e) {
      setActionError(classroomError(t, e));
    } finally {
      setBusyId(null);
    }
  }

  const row = (p: TeacherPost) => (
    <PostItem key={p.id} post={p} tag={tag} busy={busyId !== null} onEdit={() => setComposer({ post: p })} onArchive={(value) => void setArchived(p, value)} />
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <p className={PAGE_INTRO}>{t("classroom.ann.intro")}</p>
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => setComposer({ post: null })}>
          {t("classroom.ann.new")}
        </button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-urgent">
          {actionError}
        </p>
      )}

      {posts === null ? (
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
          <div role="status" aria-busy="true" className="h-40 animate-pulse rounded-2xl bg-zinc-100">
            <span className="sr-only">{t("classroom.ann.loading")}</span>
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
          {active.length === 0 ? (
            <p className="rounded-2xl bg-zinc-50 p-5 text-[15px] text-zinc-700">{t("classroom.ann.empty")}</p>
          ) : (
            <ul className={LIST}>{active.map(row)}</ul>
          )}
          {archived.length > 0 && (
            <section className="space-y-3">
              <button type="button" aria-expanded={showArchived} className={buttonClass("quiet", "sm")} onClick={() => setShowArchived((s) => !s)}>
                {t("classroom.ann.archived", { n: archived.length })}
              </button>
              {showArchived && <ul className={LIST}>{archived.map(row)}</ul>}
            </section>
          )}
        </>
      )}

      {composer && (
        <PostComposer
          key={composer.post?.id ?? "new"}
          post={composer.post ?? undefined}
          onSaved={() => {
            setComposer(null);
            reload();
          }}
          onCancel={() => setComposer(null)}
        />
      )}
    </div>
  );
}
