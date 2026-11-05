"use client";

import { useId, useState } from "react";
import { fieldClass } from "@/components/TranscriptCourseForm";
import {
  BOARD_SUGGESTIONS,
  EXAM_LIMITS,
  EXAM_SUBJECTS,
  EXAM_SYSTEM_LABEL,
  EXAM_SYSTEMS,
  HAS_BOARD,
  isIbCore,
  scaleHint,
  validateEntry,
  type ExamErrorCode,
  type ExamInput,
  type ExamSystem,
} from "@/lib/exams";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";

type Draft = { system: ExamSystem; subject: string; level: string; board: string; session: string; predicted: string; result: string; otherName: string; note: string };

const toDraft = (e: Partial<ExamInput> & { system: ExamSystem }): Draft => ({
  system: e.system,
  subject: e.subject ?? "",
  level: e.level ?? "",
  board: e.board ?? "",
  session: e.session ?? "",
  predicted: e.predicted ?? "",
  result: e.result ?? "",
  otherName: e.otherName ?? "",
  note: e.note ?? "",
});

/**
 * Inline add / edit form for one exam: curriculum, subject (official names as suggestions, own text allowed), IB level or
 * exam board, exam month, predicted and final grade (the allowed scale shown under each), note. `onSave` returns false
 * when the store refused the change (the record is full).
 */
export function ExamForm({
  initial,
  heading,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: Partial<ExamInput> & { system: ExamSystem };
  heading: string;
  submitLabel: string;
  onSave: (v: ExamInput) => boolean;
  onCancel: () => void;
}) {
  const t = useT();
  const id = useId();
  const [f, setF] = useState<Draft>(toDraft(initial));
  const [error, setError] = useState<ExamErrorCode | "tooLarge" | null>(null);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((cur) => ({ ...cur, [k]: v }));

  const core = isIbCore(f);
  const hint = scaleHint(f.system, f.subject);
  const suggestions = EXAM_SUBJECTS[f.system];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateEntry(f);
    if (!r.ok) return setError(r.error);
    if (!onSave(r.entry)) return setError("tooLarge");
    setError(null);
  }

  const gradeField = (k: "predicted" | "result", label: string) => (
    <label className="text-sm font-medium">
      {label} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
      <input className={fieldClass} value={f[k]} maxLength={EXAM_LIMITS.otherGrade} onChange={(e) => set(k, e.target.value)} aria-describedby={`${id}-${k}-hint`} />
      <span id={`${id}-${k}-hint`} className="mt-1 block text-[13px] font-normal text-zinc-600">
        {hint ? t("exams.gradeHint", { scale: hint }) : t("exams.gradeFree")}
      </span>
    </label>
  );

  return (
    <form onSubmit={submit} className="space-y-3" aria-labelledby={`${id}-heading`}>
      <h3 id={`${id}-heading`} className="text-[15px] font-semibold text-ink">
        {heading}
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-medium">
          {t("exams.curriculum")}
          <select className={fieldClass} value={f.system} onChange={(e) => set("system", e.target.value as ExamSystem)}>
            {EXAM_SYSTEMS.map((s) => (
              <option key={s} value={s}>
                {s === "other" ? t("exams.other") : EXAM_SYSTEM_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        {f.system === "other" && (
          <label className="text-sm font-medium">
            {t("exams.otherName")}
            <input className={fieldClass} value={f.otherName} maxLength={EXAM_LIMITS.otherName} onChange={(e) => set("otherName", e.target.value)} placeholder="HKDSE" />
          </label>
        )}
        <label className="text-sm font-medium sm:col-span-2">
          {t("exams.subject")} {suggestions.length > 0 && <span className="font-normal text-zinc-600">· {t("exams.subjectHint")}</span>}
          <input
            className={fieldClass}
            value={f.subject}
            maxLength={EXAM_LIMITS.subject}
            onChange={(e) => set("subject", e.target.value)}
            list={suggestions.length ? `${id}-subjects` : undefined}
            placeholder={suggestions[0]?.name}
          />
          {suggestions.length > 0 && (
            <datalist id={`${id}-subjects`}>
              {suggestions.map((s) => (
                <option key={s.name} value={s.name} label={s.group ? t("exams.group", { n: s.group }) : undefined} />
              ))}
            </datalist>
          )}
        </label>
        {f.system === "ib" && !core && (
          <label className="text-sm font-medium">
            {t("exams.level")}
            <select className={fieldClass} value={f.level} onChange={(e) => set("level", e.target.value)}>
              <option value="">{t("exams.levelNone")}</option>
              <option value="HL">HL</option>
              <option value="SL">SL</option>
            </select>
          </label>
        )}
        {HAS_BOARD.has(f.system) && (
          <label className="text-sm font-medium">
            {t("exams.board")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
            <input className={fieldClass} value={f.board} maxLength={EXAM_LIMITS.board} onChange={(e) => set("board", e.target.value)} list={`${id}-boards`} />
            <datalist id={`${id}-boards`}>
              {BOARD_SUGGESTIONS.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </label>
        )}
        <label className="text-sm font-medium">
          {t("exams.session")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
          <input type="month" className={fieldClass} value={f.session} min="1990-01" max="2100-12" onChange={(e) => set("session", e.target.value)} placeholder="2027-05" />
        </label>
        {gradeField("predicted", t("exams.predicted"))}
        {gradeField("result", t("exams.result"))}
        <label className="text-sm font-medium sm:col-span-2">
          {t("exams.note")} <span className="font-normal text-zinc-600">({t("common.optional")})</span>
          <textarea className={fieldClass} rows={2} value={f.note} maxLength={EXAM_LIMITS.note} onChange={(e) => set("note", e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {t(`exams.error.${error}`)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={buttonClass("primary", "sm")}>
          {submitLabel}
        </button>
        <button type="button" className={buttonClass("secondary", "sm")} onClick={onCancel}>
          {t("common.cancel")}
        </button>
      </div>
    </form>
  );
}
