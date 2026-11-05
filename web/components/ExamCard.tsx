"use client";

import { useState } from "react";
import { ExamForm } from "@/components/ExamForm";
import { StatusPill } from "@/components/StatusPill";
import { fieldClass } from "@/components/TranscriptCourseForm";
import {
  countSummary,
  EXAM_SYSTEM_LABEL,
  examStatus,
  gradeString,
  ibSummary,
  isIbCore,
  parseIbTotal,
  sessionLabel,
  type ExamEntry,
  type ExamStatus,
  type ExamSystem,
  type IbTotals,
} from "@/lib/exams";
import type { TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import type { Tone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import { buttonClass, PANEL } from "@/lib/ui";

const STATUS_TONE: Record<ExamStatus, Tone> = { final: "done", predicted: "progress", planned: "neutral", waiting: "soon", none: "neutral" };

/** The card header's one-line summaries (spec §3.3): IB subject sum and typed totals, A-level / AS grade strings, else counts. */
function summaryLines(t: TFunction, system: ExamSystem, entries: ExamEntry[], ibTotals: IbTotals | undefined): string[] {
  if (system === "ib") {
    const s = ibSummary(entries, ibTotals);
    const lines: string[] = [];
    for (const which of ["predicted", "result"] as const) {
      const { sum, graded } = s[which];
      if (!graded) continue;
      const kind = t(which === "predicted" ? "exams.ibKindPredicted" : "exams.ibKindResult");
      if (graded > 6) lines.push(t("exams.ibSubjectsMany", { sum, graded, kind }));
      else if (graded === 6 && s.subjects === 6) lines.push(t("exams.ibSubjects", { sum, kind }));
      else lines.push(t("exams.ibSubjectsPartial", { sum, graded, of: Math.max(6, s.subjects), kind }));
    }
    if (s.hl || s.sl) lines.push(t("exams.ibLevels", { hl: s.hl, sl: s.sl }));
    if (s.tok || s.ee) {
      const g = (c: typeof s.tok) => c?.result ?? c?.predicted ?? "–";
      lines.push(t("exams.ibCore", { tok: g(s.tok), ee: g(s.ee) }));
    }
    if (s.totals.predicted != null) lines.push(t("exams.ibTotal", { n: s.totals.predicted, kind: t("exams.ibKindPredicted") }));
    if (s.totals.result != null) lines.push(t("exams.ibTotal", { n: s.totals.result, kind: t("exams.ibKindResult") }));
    return lines;
  }
  if (system === "a_level" || system === "as_level") {
    const p = gradeString(entries, system, "predicted");
    const r = gradeString(entries, system, "result");
    const lines = [p && t("exams.summaryPredicted", { grades: p }), r && t("exams.summaryResult", { grades: r })].filter(Boolean) as string[];
    if (lines.length) return lines;
  }
  const c = countSummary(entries);
  return [t("exams.summaryCount", { n: c.exams, done: c.withResult })];
}

function ExamRow({ entry, today, onEdit, onRemove }: { entry: ExamEntry; today: string; onEdit: () => void; onRemove: () => void }) {
  const t = useT();
  const locale = useLocale();
  const status = examStatus(entry, today);
  const detail = [entry.level, entry.board, entry.session ? sessionLabel(entry.session, locale) : null].filter(Boolean).join(" · ");
  const grades = [entry.predicted && t("exams.rowPredicted", { grade: entry.predicted }), entry.result && t("exams.rowResult", { grade: entry.result })].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="font-medium break-words">{entry.subject}</p>
        {detail && <p className="text-sm text-zinc-600">{detail}</p>}
        <p className="text-sm">{grades || t("exams.noGrades")}</p>
        {entry.note && <p className="text-[13px] break-words text-zinc-600">{entry.note}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill tone={STATUS_TONE[status]}>{t(`exams.status.${status}`)}</StatusPill>
        <button type="button" className={buttonClass("ghost", "sm")} aria-label={t("exams.editAria", { name: entry.subject })} onClick={onEdit}>
          {t("common.edit")}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} aria-label={t("exams.removeAria", { name: entry.subject })} onClick={onRemove}>
          {t("common.remove")}
        </button>
      </div>
    </li>
  );
}

/** The two diploma totals the student types (0-45 each). Saved when a field is left; the site never computes them. */
function IbTotalsFields({ totals }: { totals: IbTotals | undefined }) {
  const t = useT();
  const { setIbTotals } = useStudent();
  const [draft, setDraft] = useState({ predicted: totals?.predicted == null ? "" : String(totals.predicted), result: totals?.result == null ? "" : String(totals.result) });
  const [invalid, setInvalid] = useState(false);

  function commit(which: "predicted" | "result") {
    const v = parseIbTotal(draft[which]);
    if (v === false) return setInvalid(true);
    setInvalid(false);
    if (v === (totals?.[which] ?? null)) return;
    setIbTotals({ predicted: totals?.predicted ?? null, result: totals?.result ?? null, [which]: v });
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-ink">{t("exams.ibTotalsLabel")}</legend>
      <div className="flex flex-col gap-3 sm:flex-row">
        {(["predicted", "result"] as const).map((which) => (
          <label key={which} className="text-sm font-medium sm:w-40">
            {t(which === "predicted" ? "exams.ibTotalPredicted" : "exams.ibTotalResult")}
            <input
              className={fieldClass}
              inputMode="numeric"
              value={draft[which]}
              maxLength={2}
              aria-invalid={invalid || undefined}
              onChange={(e) => setDraft((d) => ({ ...d, [which]: e.target.value }))}
              onBlur={() => commit(which)}
            />
          </label>
        ))}
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-urgent">
          {t("exams.ibTotalInvalid")}
        </p>
      )}
      <p className="text-[13px] text-zinc-600">{t("exams.ibTotalsNote")}</p>
    </fieldset>
  );
}

/** One curriculum's card: name, summary, its exams (IB: subjects, then TOK and EE under "Core") and, for IB, the diploma totals. */
export function ExamCard({ system, title, entries, today }: { system: ExamSystem; title: string | null; entries: ExamEntry[]; today: string }) {
  const t = useT();
  const { exams, updateExam, removeExam } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const name = system === "other" ? title || t("exams.other") : EXAM_SYSTEM_LABEL[system];
  const headingId = `exams-${system}-${(title ?? "").replace(/\W+/g, "-")}`;
  const subjects = system === "ib" ? entries.filter((e) => !isIbCore(e)) : entries;
  const core = system === "ib" ? entries.filter((e) => isIbCore(e)) : [];

  const row = (e: ExamEntry) =>
    editing === e.id ? (
      <li key={e.id} className="p-4">
        <ExamForm
          initial={e}
          heading={t("exams.formEdit")}
          submitLabel={t("common.save")}
          onSave={(v) => {
            const ok = updateExam(e.id, v);
            if (ok) setEditing(null);
            return ok;
          }}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : (
      <ExamRow
        key={e.id}
        entry={e}
        today={today}
        onEdit={() => setEditing(e.id)}
        onRemove={() => {
          if (confirm(t("exams.confirmRemove", { name: e.subject }))) removeExam(e.id);
        }}
      />
    );

  return (
    <section aria-labelledby={headingId} className={`space-y-3 ${PANEL} p-5 sm:p-6`}>
      <div>
        <h2 id={headingId} className="font-display text-xl font-bold text-ink">
          {name}
        </h2>
        {summaryLines(t, system, entries, exams.ibTotals).map((line) => (
          <p key={line} className="text-[15px] text-zinc-600">
            {line}
          </p>
        ))}
      </div>
      {subjects.length > 0 && <ul className="divide-y divide-zinc-100 rounded-2xl bg-white">{subjects.map(row)}</ul>}
      {core.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold text-ink">{t("exams.ibCoreHeading")}</h3>
          <ul className="divide-y divide-zinc-100 rounded-2xl bg-white">{core.map(row)}</ul>
        </div>
      )}
      {system === "ib" && <IbTotalsFields key={JSON.stringify(exams.ibTotals ?? null)} totals={exams.ibTotals} />}
    </section>
  );
}
