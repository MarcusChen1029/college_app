"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { anchorKey, type Anchor } from "@/lib/anchors";
import { startConversation } from "@/lib/classroom-api";
import { CLASSROOM_LIMITS, validateMessage } from "@/lib/classroom";
import { useT } from "@/lib/i18n/client";
import { buttonClass, FIELD_CLASS } from "@/lib/ui";
import { savedLabel, type AnchorOption } from "./anchorOptions";
import { classroomError, TEXTAREA_CLASS } from "./ClassroomText";

const GENERAL: Anchor = { kind: "general", ref: null };

/**
 * Starts a conversation with `otherId` (the student for a teacher, the teacher for a student): pick what it is about
 * ("General" first, then `preset`, then `options`) and write the first message. If the pair already talks about that
 * item, the message goes into that conversation. `onStarted` gets the conversation's id; the caller closes this.
 */
export function NewConversation({
  role,
  otherId,
  otherName,
  options,
  preset,
  initialMessage,
  onStarted,
  onCancel,
}: {
  role: "teacher" | "student";
  otherId: string;
  /** Used for "Only <name> and you can see this."; without it the line says "this student" / "your counselor". */
  otherName?: string;
  options: AnchorOption[];
  /** The item to start on (for instance the one whose ⋯ menu was used). */
  preset?: AnchorOption;
  /** Text the message box starts with (for instance a quote of the announcement being answered). */
  initialMessage?: string;
  onStarted: (conversationId: string) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const uid = useId();
  const [pick, setPick] = useState(() => (preset ? anchorKey(preset.anchor) : anchorKey(GENERAL)));
  const [draft, setDraft] = useState(initialMessage ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choices: AnchorOption[] = [{ anchor: GENERAL, label: t("classroom.anchor.general") }];
  const seen = new Set([anchorKey(GENERAL)]);
  for (const o of preset ? [preset, ...options] : options) {
    const key = anchorKey(o.anchor);
    if (seen.has(key)) continue;
    seen.add(key);
    choices.push(o);
  }
  const selected = choices.find((o) => anchorKey(o.anchor) === pick) ?? choices[0];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const v = validateMessage(draft);
    if (!v.ok) {
      setError(classroomError(t, v.error));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const label = selected.anchor.kind === "general" ? null : savedLabel(selected.label);
      onStarted(await startConversation(otherId, selected.anchor, label, v.value));
    } catch (err) {
      setError(classroomError(t, err));
    } finally {
      setBusy(false);
    }
  }

  const visible = role === "teacher" ? (otherName ? t("classroom.visible.teacher", { name: otherName }) : t("classroom.visible.teacherAnon")) : otherName ? t("classroom.visible.student", { name: otherName }) : t("classroom.visible.studentAnon");

  return (
    <Modal title={<h2 className="text-lg font-semibold">{t("classroom.new.title")}</h2>} onClose={onCancel} locked={busy} className="w-[min(32rem,calc(100vw-2rem))]">
      <form onSubmit={(e) => void submit(e)} className="space-y-3">
        <div className="space-y-1">
          <label htmlFor={`${uid}-about`} className="block text-sm font-medium">
            {t("classroom.new.about")}
          </label>
          <select id={`${uid}-about`} value={anchorKey(selected.anchor)} className={`${FIELD_CLASS} w-full`} onChange={(e) => setPick(e.target.value)}>
            {choices.map((o) => (
              <option key={anchorKey(o.anchor)} value={anchorKey(o.anchor)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${uid}-message`} className="block text-sm font-medium">
            {t("classroom.new.message")}
          </label>
          <textarea
            id={`${uid}-message`}
            value={draft}
            readOnly={busy}
            rows={5}
            maxLength={CLASSROOM_LIMITS.message}
            className={TEXTAREA_CLASS}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <p className="text-right text-[13px] text-zinc-600">
            {draft.length} / {CLASSROOM_LIMITS.message}
          </p>
        </div>
        <p className="text-[13px] text-zinc-600">{visible}</p>
        {error && (
          <p role="alert" className="text-sm text-urgent">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} className={buttonClass("quiet", "sm")} onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button type="submit" disabled={busy} className={buttonClass("primary", "sm")}>
            {t("classroom.send")}
          </button>
        </div>
      </form>
    </Modal>
  );
}
