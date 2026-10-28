"use client";

import {
  GRADES,
  UC_CATEGORY_KEYS,
  UC_EDPREP_OTHER,
  UC_EDPREP_PROGRAMS,
  UC_LIMITS,
  ucDraftIssues,
  ucEntryIssues,
  ucTextLength,
  ucVisibleQuestions,
  type Grade,
  type UcAfterYears,
  type UcAwardLevel,
  type UcCategory,
  type UcEntry,
} from "@/lib/activities";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { Checks, DecimalField, input, labels, LegacyNote, MonthField, Needs, Radios, SelectField, TextField, wide } from "./fields";

export const AWARD_KEYS: Record<UcAwardLevel, MessageKey> = {
  school: "writing.awardLevel.school",
  city: "writing.awardLevel.city",
  state: "writing.awardLevel.state",
  regional: "writing.awardLevel.regional",
  national: "writing.awardLevel.national",
  international: "writing.awardLevel.international",
};

export const UC_FORM_KEYS: Record<UcCategory, { label: MessageKey; name: MessageKey; jobTitle?: MessageKey; extra?: MessageKey; description: MessageKey }> = {
  award: { label: "writing.uc.award.label", name: "writing.uc.award.name", extra: "writing.uc.award.extra", description: "writing.uc.award.description" },
  edprep: { label: "writing.uc.edprep.label", name: "writing.uc.edprep.name", description: "writing.uc.edprep.description" },
  extracurricular: { label: "writing.uc.extracurricular.label", name: "writing.uc.extracurricular.name", description: "writing.uc.extracurricular.description" },
  coursework: { label: "writing.uc.coursework.label", name: "writing.uc.coursework.name", description: "writing.uc.coursework.description" },
  volunteer: { label: "writing.uc.volunteer.label", name: "writing.uc.volunteer.name", extra: "writing.uc.volunteer.extra", description: "writing.uc.volunteer.description" },
  work: { label: "writing.uc.work.label", name: "writing.uc.work.name", jobTitle: "writing.uc.work.jobTitle", extra: "writing.uc.work.extra", description: "writing.uc.work.description" },
};

const UC_YEAR_OPTIONS: UcAfterYears[] = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, "10+"];
const UC_MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => i);
const asOptions = (values: (string | number)[]) => values.map((v) => ({ value: String(v), label: String(v) }));

/** UC's own wording: the last box is "After 12th grade". */
const ucGradeOptions = (t: TFunction) => Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.uc.gradePG") : g])) as Record<Grade, string>;

const monthOk = (v: string | null, maxYear: number) => {
  const m = v ? /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v) : null;
  return !!m && Number(m[1]) >= 1926 && Number(m[1]) <= maxYear;
};

/** The visible text for an "invalid" issue on `field` of `e` (the issue's own message is English only). */
function ucErrorText(t: TFunction, field: string, e: UcEntry): string {
  const thisYear = new Date().getFullYear();
  switch (field) {
    case "name":
      return t("writing.uc.err.tooLongPlain", { max: e.category === "edprep" ? UC_LIMITS.otherProgramName : UC_LIMITS.name, n: e.name.length });
    case "jobTitle":
      return t("writing.uc.err.tooLongPlain", { max: UC_LIMITS.name, n: e.jobTitle.length });
    case "extra":
      return t("writing.uc.err.tooLong", { max: UC_LIMITS.extra, n: ucTextLength(e.extra) });
    case "description":
      return t("writing.uc.err.tooLong", { max: UC_LIMITS.description, n: ucTextLength(e.description) });
    case "hoursPerWeek":
    case "workHours":
      return t("writing.uc.err.hours");
    case "weeksPerYear":
      return t("writing.uc.err.weeks");
    case "start":
      return t("writing.uc.err.dateStart", { max: thisYear });
    case "end":
      return monthOk(e.start, thisYear) && monthOk(e.end, 2027) ? t("writing.ca.err.endBeforeStart") : t("writing.ca.err.date");
    default:
      return t("writing.uc.err.notInList");
  }
}

/** Work experience: hours per week in the school year and the summer, for each grade ticked (a season left empty = did not work then). */
function WorkHours({ e, set, draft }: { e: UcEntry; set: (p: Partial<UcEntry>) => void; draft: (patch: Partial<UcEntry>) => string | null }) {
  const t = useT();
  return (
    <fieldset className={`${wide} flex flex-col gap-2`}>
      <legend className="mb-1 text-xs text-zinc-500">{t("writing.uc.workHours")}</legend>
      {GRADES.filter((g) => e.grades.includes(g)).map((g) => {
        const h = e.workHours[g] ?? { schoolYear: null, summer: null };
        const next = (patch: Partial<typeof h>): Partial<UcEntry> => ({ workHours: { ...e.workHours, [g]: { ...h, ...patch } } });
        return (
          <div key={g} className="flex flex-wrap items-start gap-3 rounded-lg border border-zinc-100 p-2">
            <span className="w-36 pt-5 text-sm font-medium">
              {g === "PG" ? t("writing.uc.gradePG") : t("writing.ca.grade", { n: g })}
              <Needs show={h.schoolYear === null && h.summer === null} />
            </span>
            <DecimalField label={t("writing.uc.workSchool")} value={h.schoolYear} placeholder="1–168" onSave={(schoolYear) => set(next({ schoolYear }))} validate={(schoolYear) => draft(next({ schoolYear }))} />
            <DecimalField label={t("writing.uc.workSummer")} value={h.summer} placeholder="1–168" onSave={(summer) => set(next({ summer }))} validate={(summer) => draft(next({ summer }))} />
          </div>
        );
      })}
    </fieldset>
  );
}

export function UcFields({ e, set }: { e: UcEntry; set: (p: Partial<UcEntry>) => void }) {
  const t = useT();
  const fk = UC_FORM_KEYS[e.category];
  const issues = ucEntryIssues(e);
  const missing = (f: keyof UcEntry) => issues.some((i) => i.field === f && i.kind === "missing");
  /** The error for a stored value, shown on fields that are not edited as a draft (selects). */
  const stored = (f: keyof UcEntry) => (issues.some((i) => i.field === f && i.kind === "invalid") ? ucErrorText(t, f, e) : null);
  /** The error for a draft of the single field in `patch`, including a problem it would cause on another field (a start date after the stored end date). */
  const draft = (patch: Partial<UcEntry>) => {
    const next = { ...e, ...patch };
    const f = Object.keys(patch)[0];
    const found = ucDraftIssues(e, patch);
    if (found.length === 0) return null;
    return ucErrorText(t, (found.find((i) => i.field === f) ?? found[0]).field, next);
  };
  const yesNo = { yes: t("common.yes"), no: t("common.no") };
  const thisYear = new Date().getFullYear();

  return (
    <>
      {e.legacy && <LegacyNote text={e.legacy} onDismiss={() => set({ legacy: undefined })} />}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-zinc-500">{t("writing.category")}</span>
        <select className={input} value={e.category} onChange={(ev) => set({ category: ev.target.value as UcCategory })}>
          {UC_CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>
              {t(UC_FORM_KEYS[k].label)}
            </option>
          ))}
        </select>
      </label>
      {ucVisibleQuestions(e).map((field) => {
        switch (field) {
          case "program":
            return (
              <SelectField
                key={field}
                label={t("writing.uc.edprep.program")}
                value={e.program ?? ""}
                options={UC_EDPREP_PROGRAMS.map((p) => ({ value: p.value, label: p.label }))}
                onChange={(program) => set({ program: program || null })}
                missing={missing("program")}
                error={stored("program")}
              />
            );
          case "name":
            return (
              <TextField
                key={field}
                label={t(fk.name)}
                value={e.name}
                max={e.category === "edprep" && e.program === UC_EDPREP_OTHER ? UC_LIMITS.otherProgramName : UC_LIMITS.name}
                onSave={(name) => set({ name })}
                validate={(name) => draft({ name })}
                missing={missing("name")}
              />
            );
          case "jobTitle":
            return (
              <TextField
                key={field}
                label={t(fk.jobTitle!)}
                value={e.jobTitle}
                max={UC_LIMITS.name}
                onSave={(jobTitle) => set({ jobTitle })}
                validate={(jobTitle) => draft({ jobTitle })}
                missing={missing("jobTitle")}
              />
            );
          case "extra":
            return (
              <div key={field} className={wide}>
                <TextField
                  label={t(fk.extra!)}
                  value={e.extra}
                  max={UC_LIMITS.extra}
                  rows={2}
                  measure={ucTextLength}
                  onSave={(extra) => set({ extra })}
                  validate={(extra) => draft({ extra })}
                  missing={missing("extra")}
                />
              </div>
            );
          case "description":
            return (
              <div key={field} className={wide}>
                <TextField
                  label={t(fk.description)}
                  value={e.description}
                  max={UC_LIMITS.description}
                  rows={4}
                  measure={ucTextLength}
                  onSave={(description) => set({ description })}
                  validate={(description) => draft({ description })}
                  missing={missing("description")}
                />
              </div>
            );
          case "awardLevels":
            return (
              <div key={field} className={wide}>
                <Checks<UcAwardLevel>
                  label={t("writing.levelOfRecognition")}
                  options={labels(AWARD_KEYS, t)}
                  value={e.awardLevels}
                  onChange={(awardLevels) => set({ awardLevels })}
                  missing={missing("awardLevels")}
                />
              </div>
            );
          case "awardType":
            return (
              <Radios<"academic" | "non_academic">
                key={field}
                label={t("writing.awardType")}
                options={{ academic: t("writing.awardAcademic"), non_academic: t("writing.awardNonAcademic") }}
                value={e.awardType}
                onChange={(awardType) => set({ awardType })}
                missing={missing("awardType")}
              />
            );
          case "grades":
            return (
              <div key={field} className={wide}>
                <Checks label={t("writing.gradeLevels")} options={ucGradeOptions(t)} value={e.grades} onChange={(grades) => set({ grades })} missing={missing("grades")} />
                <p className="mt-1 text-xs text-zinc-500">{t("writing.uc.summerHint")}</p>
              </div>
            );
          case "afterYears":
            return (
              <SelectField
                key={field}
                label={t("writing.uc.afterYears")}
                value={e.afterYears === null ? "" : String(e.afterYears)}
                options={asOptions(UC_YEAR_OPTIONS)}
                onChange={(v) => set({ afterYears: v === "" ? null : v === "10+" ? "10+" : (Number(v) as UcAfterYears) })}
                missing={missing("afterYears")}
                error={stored("afterYears")}
              />
            );
          case "afterMonths":
            return (
              <SelectField
                key={field}
                label={t("writing.uc.afterMonths")}
                value={e.afterMonths === null ? "" : String(e.afterMonths)}
                options={asOptions(UC_MONTH_OPTIONS)}
                onChange={(v) => set({ afterMonths: v === "" ? null : Number(v) })}
                missing={missing("afterMonths")}
                error={stored("afterMonths")}
              />
            );
          case "hoursPerWeek":
            return (
              <DecimalField
                key={field}
                label={t("writing.hoursWeek")}
                value={e.hoursPerWeek}
                placeholder="1–168"
                onSave={(hoursPerWeek) => set({ hoursPerWeek })}
                validate={(hoursPerWeek) => draft({ hoursPerWeek })}
                missing={missing("hoursPerWeek")}
              />
            );
          case "weeksPerYear":
            return (
              <DecimalField
                key={field}
                label={t("writing.weeksYear")}
                value={e.weeksPerYear}
                placeholder="1–52"
                onSave={(weeksPerYear) => set({ weeksPerYear })}
                validate={(weeksPerYear) => draft({ weeksPerYear })}
                missing={missing("weeksPerYear")}
              />
            );
          case "workHours":
            return <WorkHours key={field} e={e} set={set} draft={draft} />;
          case "stillWorking":
            return (
              <Radios
                key={field}
                label={t("writing.uc.stillWorking")}
                options={yesNo}
                value={e.stillWorking === null ? null : e.stillWorking ? "yes" : "no"}
                onChange={(k) => set({ stillWorking: k === "yes" })}
                missing={missing("stillWorking")}
              />
            );
          case "start":
            return (
              <MonthField
                key={field}
                label={t("writing.uc.start")}
                value={e.start}
                max={`${thisYear}-12`}
                onSave={(start) => set({ start })}
                validate={(start) => draft({ start })}
                missing={missing("start")}
              />
            );
          case "end":
            return (
              <MonthField
                key={field}
                label={t("writing.uc.end")}
                value={e.end}
                onSave={(end) => set({ end })}
                validate={(end) => draft({ end })}
                missing={missing("end")}
              />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
