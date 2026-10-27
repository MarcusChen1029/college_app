"use client";

import { useState } from "react";
import { fieldClass } from "@/components/TranscriptCourseForm";
import {
  CURRICULA,
  CURRICULUM_LABEL,
  GRADE_SCALES,
  KIND_LABEL,
  LIMITS,
  PERIOD_LABEL,
  PERIOD_TYPES,
  SCALE_LABEL,
  SCHOOL_KINDS,
  validateSchool,
  type SchoolInput,
} from "@/lib/transcript";
import { useT } from "@/lib/i18n/client";
import { buttonClass } from "@/lib/ui";

type Draft = Omit<SchoolInput, "firstYear" | "lastYear" | "gpaWeighted"> & { firstYear: string; lastYear: string; gpaWeighted: "" | "yes" | "no" };

const toDraft = (s: SchoolInput): Draft => ({
  ...s,
  firstYear: s.firstYear == null ? "" : String(s.firstYear),
  lastYear: s.lastYear == null ? "" : String(s.lastYear),
  gpaWeighted: s.gpaWeighted == null ? "" : s.gpaWeighted ? "yes" : "no",
});

/** Add / edit form for one school or college on the transcript. */
export function TranscriptSchoolForm({ initial, submitLabel, onSave, onCancel }: { initial: SchoolInput; submitLabel: string; onSave: (v: SchoolInput) => void; onCancel?: () => void }) {
  const t = useT();
  const [f, setF] = useState<Draft>(toDraft(initial));
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateSchool({ ...f, gpaWeighted: f.gpaWeighted === "" ? null : f.gpaWeighted === "yes" });
    if (!r.ok) return setErrors(r.errors);
    setErrors([]);
    onSave(r.value);
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium sm:col-span-2">
        {t("transcript.schoolName")}
        <input className={fieldClass} value={f.name} maxLength={LIMITS.schoolName} onChange={(e) => set("name", e.target.value)} placeholder={t("transcript.schoolNamePh")} />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.country")}
        <input className={fieldClass} value={f.country} maxLength={LIMITS.short} onChange={(e) => set("country", e.target.value)} placeholder={t("transcript.countryPh")} />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.schoolCode")} <span className="font-normal text-zinc-500">{t("transcript.schoolCodeHint")}</span>
        <input className={fieldClass} value={f.schoolCode} maxLength={12} onChange={(e) => set("schoolCode", e.target.value)} placeholder="694132" />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.kind")}
        <select className={fieldClass} value={f.kind} onChange={(e) => set("kind", e.target.value as SchoolInput["kind"])}>
          {SCHOOL_KINDS.map((k) => (
            <option key={k} value={k}>
              {KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t("transcript.curriculum")}
        <select className={fieldClass} value={f.curriculum} onChange={(e) => set("curriculum", e.target.value as SchoolInput["curriculum"])}>
          {CURRICULA.map((c) => (
            <option key={c} value={c}>
              {CURRICULUM_LABEL[c]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t("transcript.usualScale")}
        <select className={fieldClass} value={f.defaultScale} onChange={(e) => set("defaultScale", e.target.value as SchoolInput["defaultScale"])}>
          {GRADE_SCALES.map((s) => (
            <option key={s} value={s}>
              {SCALE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t("transcript.howIssued")}
        <select className={fieldClass} value={f.defaultPeriod} onChange={(e) => set("defaultPeriod", e.target.value as SchoolInput["defaultPeriod"])}>
          {PERIOD_TYPES.map((p) => (
            <option key={p} value={p}>
              {PERIOD_LABEL[p]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {t("transcript.firstYear")} <span className="font-normal text-zinc-500">{t("transcript.optional")}</span>
        <input className={fieldClass} inputMode="numeric" value={f.firstYear} onChange={(e) => set("firstYear", e.target.value)} placeholder="2022" />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.lastYear")} <span className="font-normal text-zinc-500">{t("transcript.optional")}</span>
        <input className={fieldClass} inputMode="numeric" value={f.lastYear} onChange={(e) => set("lastYear", e.target.value)} placeholder="2026" />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.printedGpa")} <span className="font-normal text-zinc-500">{t("transcript.optional")}</span>
        <input className={fieldClass} value={f.printedGpa} maxLength={LIMITS.grade} onChange={(e) => set("printedGpa", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.gpaScale")} <span className="font-normal text-zinc-500">{t("transcript.gpaScaleHint")}</span>
        <input className={fieldClass} value={f.printedGpaScale} maxLength={LIMITS.grade} onChange={(e) => set("printedGpaScale", e.target.value)} />
      </label>
      <label className="text-sm font-medium">
        {t("transcript.gpaWeighted")}
        <select className={fieldClass} value={f.gpaWeighted} onChange={(e) => set("gpaWeighted", e.target.value as Draft["gpaWeighted"])}>
          <option value="">{t("transcript.notSure")}</option>
          <option value="yes">{t("transcript.weighted")}</option>
          <option value="no">{t("transcript.unweighted")}</option>
        </select>
      </label>
      <label className="text-sm font-medium">
        {t("transcript.classRank")} <span className="font-normal text-zinc-500">{t("transcript.classRankHint")}</span>
        <input className={fieldClass} value={f.classRank} maxLength={LIMITS.short} onChange={(e) => set("classRank", e.target.value)} placeholder="5 / 130" />
      </label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 sm:justify-end">
        {onCancel && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={onCancel}>
            {t("common.cancel")}
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
