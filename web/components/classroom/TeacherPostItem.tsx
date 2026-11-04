"use client";

import { useEffect, useState } from "react";
import { postUnread } from "@/lib/classroom-api";
import type { TeacherPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { buttonClass, toneClass } from "@/lib/ui";
import { classroomError, shortDate } from "./ClassroomText";
import { LinkedText } from "./LinkedText";

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

/**
 * One announcement as its teacher sees it: title, Pinned badge, date and audience; its text and link; "Read by X of Y ▸"
 * (opens who has not read it yet); Edit and Archive (Restore, for an archived one). The caller wraps it in an <li> (a
 * row of a list, or a card in a class Stream) and decides what to do on Edit and Archive.
 *
 * - `alwaysOpen`: the text shows all the time and the header is not a button (the Stream). Otherwise the header opens and
 *   closes the text.
 * - `audience`: the line after the date. Omitted = the class name, or "All my students" for a post to everyone; null = none
 *   (a class Stream already says whose it is); a string replaces it (the Stream tags posts to all students).
 */
export function PostBody({
  post,
  tag,
  busy,
  onEdit,
  onArchive,
  alwaysOpen = false,
  audience,
}: {
  post: TeacherPost;
  tag: string;
  busy: boolean;
  onEdit: () => void;
  onArchive: (archived: boolean) => void;
  alwaysOpen?: boolean;
  audience?: string | null;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [readOpen, setReadOpen] = useState(false);
  const audienceText = audience !== undefined ? (audience ?? "") : post.classId ? (post.className ?? "") : t("classroom.compose.toAll");
  const shown = alwaysOpen || open;

  const heading = (
    <>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold text-ink [overflow-wrap:anywhere]">{post.title}</span>
        {post.pinned && <span className={`${BADGE} ${toneClass("neutral")}`}>{t("classroom.post.pinned")}</span>}
      </span>
      <span className="block text-[13px] text-zinc-600 [overflow-wrap:anywhere]">
        <time dateTime={post.createdAt}>{shortDate(post.createdAt, tag)}</time>
        {audienceText ? ` · ${audienceText}` : ""}
      </span>
    </>
  );

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {alwaysOpen ? (
          <div className="min-w-0 flex-1 basis-60">{heading}</div>
        ) : (
          <button type="button" aria-expanded={open} className="min-w-0 flex-1 basis-60 text-left" onClick={() => setOpen((o) => !o)}>
            {heading}
          </button>
        )}
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

      {shown && (
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
    </>
  );
}

/** One row of the Messages page's announcement list (spec 5.3): the announcement in an <li> with the list's padding. */
export function PostItem(props: Parameters<typeof PostBody>[0]) {
  return (
    <li className="px-4 py-3">
      <PostBody {...props} />
    </li>
  );
}
