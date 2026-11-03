"use client";

import { useEffect, useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { createPost, updatePost } from "@/lib/classroom-api";
import { CLASSROOM_LIMITS, validatePost, type TeacherPost } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { loadTeacherOverview, type TeacherClass } from "@/lib/links-api";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { classroomError, TEXTAREA_CLASS } from "./ClassroomText";

/**
 * The announcement form, as a dialog over the page (spec 5.3): To (one of the teacher's classes that is not archived, or
 * all their students), Title, Text, an optional http(s) Link and Pin. Without `post` it writes a new announcement;
 * with `post` it edits that one (title, text, link and pin; the audience can't change, so it is shown but locked).
 * `presetClassId` picks the class to start on (null or missing: all my students). Every field and button is disabled
 * while the save runs. `onSaved` runs after the server accepted it (the caller closes this and reloads its list);
 * `onCancel` runs on Cancel, the close button and Esc. Mount it only while it should be open.
 */
export function PostComposer({
  presetClassId,
  post,
  onSaved,
  onCancel,
}: {
  presetClassId?: string | null;
  post?: TeacherPost;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  const uid = useId();
  const editing = post !== undefined;

  // The classes to choose from, loaded here so every page that opens the form gets the same list.
  const [classes, setClasses] = useState<TeacherClass[] | null>(null);
  const [classesError, setClassesError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (editing) return;
    let live = true;
    loadTeacherOverview().then(
      (o) => {
        if (!live) return;
        setClasses(o.classes.filter((c) => !c.archived));
        setClassesError(null);
      },
      (e) => {
        if (live) setClassesError(classroomError(t, e));
      },
    );
    return () => {
      live = false;
    };
  }, [editing, nonce, t]);

  const [pick, setPick] = useState(presetClassId ?? "");
  const [title, setTitle] = useState(post?.title ?? "");
  const [body, setBody] = useState(post?.body ?? "");
  const [link, setLink] = useState(post?.link ?? "");
  const [pinned, setPinned] = useState(post?.pinned ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A preset class that is not in the list (archived, or gone) leaves the choice on "All my students", which the select shows.
  const classId = editing ? (post.classId ?? "") : classes?.some((c) => c.id === pick) ? pick : "";
  const className = editing ? post.className : (classes?.find((c) => c.id === classId)?.name ?? null);
  const ready = editing || classes !== null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    const v = validatePost({ title, body, link, pinned });
    if (!v.ok) {
      setError(classroomError(t, v.error));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (post) await updatePost(post.id, v.value);
      else await createPost(classId || null, v.value);
      onSaved();
    } catch (err) {
      setError(classroomError(t, err));
    } finally {
      setBusy(false);
    }
  }

  const sees = classId ? t("classroom.compose.seeClass", { class: className ?? "" }) : t("classroom.compose.seeAll");

  return (
    <Modal
      title={<h2 className="text-lg font-semibold">{editing ? t("classroom.compose.editTitle") : t("classroom.compose.newTitle")}</h2>}
      onClose={onCancel}
      locked={busy}
      className="w-[min(34rem,calc(100vw-2rem))]"
    >
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <fieldset disabled={busy} className="min-w-0 space-y-3">
          <div className="space-y-1">
            {classes !== null && !editing ? (
              <>
                <label htmlFor={`${uid}-to`} className="block text-sm font-medium">
                  {t("classroom.compose.to")}
                </label>
                <select id={`${uid}-to`} value={classId} className={`${FIELD_CLASS} w-full`} onChange={(e) => setPick(e.target.value)}>
                  <option value="">{t("classroom.compose.toAll")}</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <p className="text-sm font-medium">{t("classroom.compose.to")}</p>
                {editing ? (
                  <>
                    <p className="text-sm text-ink [overflow-wrap:anywhere]">{post.classId ? (post.className ?? "") : t("classroom.compose.toAll")}</p>
                    <p className="text-[13px] text-zinc-600">{t("classroom.compose.toLocked")}</p>
                  </>
                ) : classesError ? (
                  <p role="alert" className="text-sm text-urgent">
                    {classesError}{" "}
                    <button
                      type="button"
                      className="font-semibold underline underline-offset-4"
                      onClick={() => {
                        setClassesError(null);
                        setNonce((n) => n + 1);
                      }}
                    >
                      {t("classroom.retry")}
                    </button>
                  </p>
                ) : (
                  <p role="status" className="text-sm text-zinc-600">
                    {t("classroom.compose.loadingClasses")}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="space-y-1">
            <label htmlFor={`${uid}-title`} className="block text-sm font-medium">
              {t("classroom.compose.title")}
            </label>
            <input
              id={`${uid}-title`}
              type="text"
              value={title}
              maxLength={CLASSROOM_LIMITS.postTitle}
              autoComplete="off"
              className={`${FIELD_CLASS} w-full`}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label htmlFor={`${uid}-text`} className="block text-sm font-medium">
              {t("classroom.compose.text")}
            </label>
            <textarea
              id={`${uid}-text`}
              value={body}
              rows={6}
              maxLength={CLASSROOM_LIMITS.postBody}
              className={TEXTAREA_CLASS}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-right text-[13px] text-zinc-600">
              {body.length} / {CLASSROOM_LIMITS.postBody}
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor={`${uid}-link`} className="block text-sm font-medium">
              {t("classroom.compose.link")}
            </label>
            <input
              id={`${uid}-link`}
              type="text"
              inputMode="url"
              value={link}
              maxLength={CLASSROOM_LIMITS.link}
              placeholder="https://"
              autoComplete="off"
              className={`${FIELD_CLASS} w-full`}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
            {t("classroom.compose.pin")}
          </label>

          <p className="text-[13px] text-zinc-600 [overflow-wrap:anywhere]">{sees}</p>

          {error && (
            <p role="alert" className="text-sm text-urgent">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className={buttonClass("quiet", "sm")} onClick={onCancel}>
              {t("common.cancel")}
            </button>
            <button type="submit" disabled={!ready} className={buttonClass("primary", "sm")}>
              {busy ? t("common.saving") : editing ? t("common.save") : t("classroom.compose.post")}
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
