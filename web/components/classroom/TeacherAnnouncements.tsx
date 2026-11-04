"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { archivePost, postUnread, teacherPosts } from "@/lib/classroom-api";
import { sortPosts, type TeacherPost } from "@/lib/classroom";
import { useLocale, useT } from "@/lib/i18n/client";
import { buttonClass, PAGE_INTRO, toneClass } from "@/lib/ui";
import { classroomError, shortDate } from "./ClassroomText";
import { LinkedText } from "./LinkedText";
import { PostComposer } from "./PostComposer";

const LIST = "divide-y divide-zinc-200 rounded-2xl border border-zinc-200 bg-white";
const BADGE = "rounded-full border px-2 py-0.5 text-[13px] font-semibold";

/** Who has not read one announcement yet, loaded when its "Read by" line is opened. */
function ReadBy({ postId, tag }: { postId: string; tag: string }) {
  const t = useT();
  const [names, setNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let live = true;
    postUnread(postId).then(
      (rows) => {
        if (!live) return;
        setNames(rows.map((r) => r.name).filter((n) => n !== ""));
        setError(null);
      },
      (e) => {
        if (live) setError(classroomError(t, e));
      },
    );
    return () => {
      live = false;
    };
  }, [postId, nonce, t]);

  return (
    <div className="mt-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm text-ink [overflow-wrap:anywhere]" aria-live="polite">
      {error ? (
        <p role="alert" className="text-urgent">
          {error}{" "}
          <button
            type="button"
            className="font-semibold underline underline-offset-4"
            onClick={() => {
              setError(null);
              setNonce((n) => n + 1);
            }}
          >
            {t("classroom.retry")}
          </button>
        </p>
      ) : names === null ? (
        <span className="text-zinc-600">{t("classroom.ann.readLoading")}</span>
      ) : names.length === 0 ? (
        t("classroom.ann.allRead")
      ) : (
        t("classroom.ann.notRead", { names: new Intl.ListFormat(tag, { style: "long", type: "conjunction" }).format(names) })
      )}
    </div>
  );
}

function PostItem({
  post,
  tag,
  busy,
  onEdit,
  onArchive,
}: {
  post: TeacherPost;
  tag: string;
  busy: boolean;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const audience = post.classId ? (post.className ?? "") : t("classroom.compose.toAll");

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <button type="button" aria-expanded={open} className="min-w-0 flex-1 basis-60 text-left" onClick={() => setOpen((o) => !o)}>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-ink [overflow-wrap:anywhere]">{post.title}</span>
            {post.pinned && <span className={`${BADGE} ${toneClass("neutral")}`}>{t("classroom.post.pinned")}</span>}
          </span>
          <span className="block text-[13px] text-zinc-600 [overflow-wrap:anywhere]">
            <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
            {audience ? ` · ${audience}` : ""}
          </span>
        </button>
        <div className="flex flex-wrap items-center gap-1">
          {!post.archived && (
            <button type="button" disabled={busy} className={buttonClass("ghost", "sm")} aria-label={t("classroom.ann.editAria", { title: post.title })} onClick={onEdit}>
              {t("common.edit")}
            </button>
          )}
          {post.archived ? (
            <button
              type="button"
              disabled={busy}
              className={buttonClass("ghost", "sm")}
              aria-label={t("classroom.ann.restoreAria", { title: post.title })}
              onClick={() => onArchive(false)}
            >
              {t("classroom.ann.restore")}
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              className={buttonClass("ghost", "sm")}
              aria-label={t("classroom.ann.archiveAria", { title: post.title })}
              onClick={() => onArchive(true)}
            >
              {t("classroom.ann.archive")}
            </button>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-2 space-y-2 text-sm text-ink">
          <LinkedText text={post.body} />
          {post.link && (
            <p>
              <LinkedText text={post.link} />
            </p>
          )}
        </div>
      )}

      <div className="mt-1">
        {post.audience === 0 ? (
          <span className="text-[13px] text-zinc-600">{t("classroom.ann.noAudience")}</span>
        ) : (
          <button
            type="button"
            aria-expanded={readOpen}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-blue-700 underline-offset-4 hover:underline"
            onClick={() => setReadOpen((o) => !o)}
          >
            {t("classroom.ann.readBy", { read: post.readCount, total: post.audience })}
            <span aria-hidden="true">{readOpen ? "▾" : "▸"}</span>
          </button>
        )}
        {readOpen && <ReadBy postId={post.id} tag={tag} />}
      </div>
    </li>
  );
}

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
