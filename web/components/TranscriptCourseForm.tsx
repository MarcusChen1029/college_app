"use client";

import { useState } from "react";
import {
  courseIssues,
  CREDIT_UNITS,
  GRADE_SCALES,
  LEVEL_LABEL,
  LEVELS,
  LIMITS,
  PERIOD_LABEL,
  PERIOD_TYPES,
  SCALE_LABEL,
  SUB_SUBJECT_LABEL,
  SUB_SUBJECTS,
  SUBJECT_LABEL,
  SUBJECTS,
  TERM_LABEL,
  TERM_STATUS_LABEL,
  TERM_STATUSES,
  termCreditSum,
  TERMS_FOR_PERIOD,
  UNIT_LABEL,
  validateCourse,
  type CourseInput,
  type PeriodType,
  type Subject,
  type TermCode,
  type Term,
  type TermStatus,
  type TranscriptSchool,
} from "@/lib/transcript";
import { buttonClass } from "@/lib/ui";

export const fieldClass = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";

type TermRow = { grade: string; gradeWeighted: string; status: TermStatus; credit: string };
type Draft = Omit<CourseInput, "academicYear" | "gradeLevel" | "credit" | "scaleMax" | "finalGrade" | "terms"> & {
  academicYear: string;
  gradeLevel: string;
  credit: string;
  scaleMax: string;
  finalGrade: string;
};

const toDraft = (c: CourseInput): Draft => ({
  ...c,
  academicYear: String(c.academicYear),
  gradeLevel: c.gradeLevel == null ? "" : String(c.gradeLevel),
  credit: c.credit == null ? "" : String(c.credit),
  scaleMax: c.scaleMax == null ? "" : String(c.scaleMax),
  finalGrade: c.finalGrade ?? "",
});

const toRows = (c: CourseInput): Partial<Record<TermCode, TermRow>> =>
  Object.fromEntries(c.terms.map((t) => [t.term, { grade: t.grade, gradeWeighted: t.gradeWeighted ?? "", status: t.status, credit: t.credit == null ? "" : String(t.credit) }]));

/** Add / edit form for one course. onSave gets a validated value. */
export function TranscriptCourseForm({ initial, school, submitLabel, onSave, onCancel }: { initial: CourseInput; school: TranscriptSchool; submitLabel: string; onSave: (v: CourseInput) => void; onCancel?: () => void }) {
  const [f, setF] = useState<Draft>(toDraft(initial));
  const [rows, setRows] = useState<Partial<Record<TermCode, TermRow>>>(toRows(initial));
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((cur) => ({ ...cur, [k]: v }));
  const row = (code: TermCode): TermRow => rows[code] ?? { grade: "", gradeWeighted: "", status: "none", credit: "" };
  const setRow = (code: TermCode, patch: Partial<TermRow>) => setRows((cur) => ({ ...cur, [code]: { ...row(code), ...patch } }));

  function changeSubject(subject: Subject) {
    setF((cur) => ({ ...cur, subject, subSubject: cur.subSubject && SUB_SUBJECTS[subject].includes(cur.subSubject) ? cur.subSubject : null }));
  }

  // The "Final / year" term only appears for full-year courses (where it is the one grade) or when the course already has one;
  // otherwise the separate final-grade field below covers it.
  const showFy = f.period === "full_year" || rows.FY != null;
  const termCodes = TERMS_FOR_PERIOD[f.period].filter((c) => c !== "FY" || showFy);

  // The terms as they will be saved. "Auto" with a grade is Graded; "Auto" with only a credit is a term with no grade (it counts as 0 credit);
  // an empty "Auto" row is left out. Credits stay text here: validateCourse checks them.
  const terms = termCodes.flatMap((code) => {
    const r = row(code);
    const grade = r.grade.trim();
    const weighted = r.gradeWeighted.trim();
    const credit = r.credit.trim();
    if (!grade && !weighted && r.status === "none" && !credit) return [];
    const status: TermStatus = r.status !== "none" ? r.status : grade || weighted ? "graded" : "none";
    return [{ term: code, grade, ...(weighted ? { gradeWeighted: weighted } : {}), status, ...(credit ? { credit } : {}) }];
  });
  // The course credit shown while any term credit is filled: their sum, as validateCourse will store it (null while a credit isn't a number yet).
  const termCredits = terms.map((t) => ({ ...t, credit: t.credit == null ? null : Number(t.credit) })) as Term[];
  const summedCredit = termCredits.some((t) => t.credit != null && !Number.isFinite(t.credit)) ? null : termCreditSum(termCredits);
  // Same rule as termCreditSum: only a credit on a term that is not "none" replaces the course credit.
  const anyTermCredit = terms.some((t) => t.status !== "none" && t.credit != null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const result = validateCourse({ ...f, terms, finalGrade: f.finalGrade.trim() || null });
    if (!result.ok) return setErrors(result.errors);
    const missing = courseIssues(result.value);
    if (missing.length) return setErrors(missing);
    setErrors([]);
    onSave(result.value);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">
        Course name <span className="font-normal text-zinc-500">(exactly as on the transcript)</span>
        <input className={fieldClass} value={f.name} maxLength={LIMITS.courseName} onChange={(e) => set("name", e.target.value)} placeholder="AP Calculus BC" />
      </label>
      <label className="text-sm font-medium">
        School year starts
        <input className={fieldClass} inputMode="numeric" value={f.academicYear} onChange={(e) => set("academicYear", e.target.value)} placeholder="2025" />
      </label>
      <label className="text-sm font-medium">
        Grade level <span className="font-normal text-zinc-500">(optional)</span>
        <select className={fieldClass} value={f.gradeLevel} onChange={(e) => set("gradeLevel", e.target.value)}>
          <option value="">Not sure</option>
          {[7, 8, 9, 10, 11, 12, 13].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        Subject
        <select className={fieldClass} value={f.subject} onChange={(e) => changeSubject(e.target.value as Subject)}>
          {SUBJECTS.map((s) => (
            <option key={s} value={s}>
              {SUBJECT_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {SUB_SUBJECTS[f.subject].length > 0 && (
        <label className="text-sm font-medium">
          Sub-subject <span className="font-normal text-zinc-500">(optional)</span>
          <select className={fieldClass} value={f.subSubject ?? ""} onChange={(e) => set("subSubject", e.target.value || null)}>
            <option value="">None</option>
            {SUB_SUBJECTS[f.subject].map((s) => (
              <option key={s} value={s}>
                {SUB_SUBJECT_LABEL[s] ?? s}
              </option>
            ))}
          </select>
        </label>
      )}
      {f.subject === "world_language" && (
        <label className="text-sm font-medium">
          Language
          <input className={fieldClass} value={f.languageName} maxLength={LIMITS.short} onChange={(e) => set("languageName", e.target.value)} placeholder="Spanish" />
        </label>
      )}
      <label className="text-sm font-medium">
        Level
        <select className={fieldClass} value={f.level} onChange={(e) => set("level", e.target.value as CourseInput["level"])}>
          {LEVELS.map((l) => (
            <option key={l} value={l}>
              {LEVEL_LABEL[l]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        How final grades are issued
        <select
          className={fieldClass}
          value={f.period}
          onChange={(e) => {
            const period = e.target.value as PeriodType;
            set("period", period);
            setRows((cur) => Object.fromEntries(Object.entries(cur).filter(([code]) => TERMS_FOR_PERIOD[period].includes(code as TermCode))));
          }}
        >
          {PERIOD_TYPES.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="space-y-2 sm:col-span-2">
        <legend className="text-sm font-medium">
          Grades <span className="font-normal text-zinc-500">(exactly as printed; leave a term&apos;s grade empty if the transcript shows none. Each term&apos;s credit as printed, if the transcript lists it per term)</span>
        </legend>
        {termCodes.map((code) => {
          const r = row(code);
          // A term explicitly marked Graded must carry its grade.
          const needsGrade = r.status === "graded" && !r.grade.trim();
          return (
            <div key={code} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_6rem_10rem]">
              <span className="pb-2 text-sm font-medium">{TERM_LABEL[code]}</span>
              <label className="text-xs text-zinc-600">
                Grade{r.status === "graded" && <span className="text-urgent"> (required)</span>}
                <input
                  className={`${fieldClass} ${needsGrade ? "border-urgent-line!" : ""}`}
                  aria-label={`${TERM_LABEL[code]} grade`}
                  aria-invalid={needsGrade || undefined}
                  required={r.status === "graded"}
                  value={r.grade}
                  maxLength={LIMITS.grade}
                  onChange={(e) => setRow(code, { grade: e.target.value })}
                />
              </label>
              <label className="text-xs text-zinc-600">
                Weighted grade (if printed)
                <input className={fieldClass} aria-label={`${TERM_LABEL[code]} weighted grade`} value={r.gradeWeighted} maxLength={LIMITS.grade} onChange={(e) => setRow(code, { gradeWeighted: e.target.value })} />
              </label>
              <label className="text-xs text-zinc-600">
                Credit
                <input className={fieldClass} inputMode="decimal" aria-label={`${TERM_LABEL[code]} credit`} value={r.credit} onChange={(e) => setRow(code, { credit: e.target.value })} />
              </label>
              <label className="text-xs text-zinc-600">
                Status
                <select className={fieldClass} aria-label={`${TERM_LABEL[code]} status`} value={r.status} onChange={(e) => setRow(code, { status: e.target.value as TermStatus })}>
                  {TERM_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s === "none" ? "Auto" : TERM_STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </fieldset>

      {f.period !== "full_year" && (
        <label className="text-sm font-medium">
          Final / year grade <span className="font-normal text-zinc-500">(only if printed)</span>
          <input className={fieldClass} value={f.finalGrade} maxLength={LIMITS.grade} onChange={(e) => set("finalGrade", e.target.value)} />
        </label>
      )}
      <label className="text-sm font-medium">
        Grade scale
        <select className={fieldClass} value={f.scale} onChange={(e) => set("scale", e.target.value as CourseInput["scale"])}>
          {GRADE_SCALES.map((s) => (
            <option key={s} value={s}>
              {SCALE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      {f.scale === "other" && (
        <label className="text-sm font-medium">
          Highest possible mark
          <input className={fieldClass} inputMode="decimal" value={f.scaleMax} onChange={(e) => set("scaleMax", e.target.value)} placeholder="150" />
        </label>
      )}
      {anyTermCredit ? (
        <label className="text-sm font-medium">
          Credit <span className="font-normal text-zinc-500">(sum of the term credits)</span>
          <input className={fieldClass.replace("bg-white", "bg-zinc-50")} readOnly aria-label="Credit (sum of the term credits)" value={summedCredit == null ? "" : String(summedCredit)} />
        </label>
      ) : (
        <label className="text-sm font-medium">
          Credit <span className="font-normal text-zinc-500">(as printed)</span>
          <input className={fieldClass} inputMode="decimal" value={f.credit} onChange={(e) => set("credit", e.target.value)} placeholder="1" />
        </label>
      )}
      <label className="text-sm font-medium">
        Credit unit
        <select className={fieldClass} value={f.creditUnit} onChange={(e) => set("creditUnit", e.target.value as CourseInput["creditUnit"])}>
          {CREDIT_UNITS.map((u) => (
            <option key={u} value={u}>
              {UNIT_LABEL[u]}
            </option>
          ))}
        </select>
      </label>

      <div className="flex flex-wrap gap-4 text-sm sm:col-span-2">
        {(
          [
            ["isSummer", "Summer course"],
            ["isRepeat", "Repeated course"],
            ["isCollege", "College / dual-enrollment course"],
            ["isWithdrawn", "Withdrawn"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="inline-flex items-center gap-2">
            <input type="checkbox" checked={f[key]} onChange={(e) => set(key, e.target.checked)} />
            {label}
          </label>
        ))}
      </div>
      {f.isCollege && (
        <label className="text-sm font-medium sm:col-span-2">
          College name
          <input className={fieldClass} value={f.collegeName} maxLength={LIMITS.schoolName} onChange={(e) => set("collegeName", e.target.value)} />
        </label>
      )}
      <label className="text-sm font-medium sm:col-span-2">
        Notes <span className="font-normal text-zinc-500">(optional)</span>
        <input className={fieldClass} value={f.notes} maxLength={LIMITS.notes} onChange={(e) => set("notes", e.target.value)} />
      </label>

      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:justify-end">
        <span className="mr-auto text-xs text-zinc-500">Defaults come from {school.name}.</span>
        {onCancel && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className={buttonClass("primary", "sm")}>
          {submitLabel}
        </button>
      </div>
      {errors.length > 0 && (
        <ul role="alert" className="list-disc pl-5 text-sm text-urgent sm:col-span-2">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </form>
  );
}
