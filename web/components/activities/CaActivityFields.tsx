"use client";

import {
  CA_ACTIVITY_TYPES,
  CA_LIMITS,
  CA_SPORTS,
  caActivityIssues,
  caVisibleQuestions,
  draftIssues,
  type CaActivity,
  type CaContinue,
  type CaTiming,
} from "@/lib/activities";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { caTypeLabel as typeLabel } from "@/lib/i18n/ca-types";
import { useT } from "@/lib/i18n/client";
import { caGradeOptions, Checks, DecimalField, labels, LegacyNote, MonthField, Radios, SelectField, TextField, wide } from "./fields";

const CA_TIMING_KEYS: Record<CaTiming, MessageKey> = { school: "writing.timing.school", break: "writing.timing.break", all: "writing.timing.all" };
const CA_CONTINUE_KEYS: Record<CaContinue, MessageKey> = { yes: "common.yes", no: "common.no", not_sure: "writing.ca.notSure" };

const inDateRange = (v: string) => {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
  return !!m && Number(m[1]) >= 1926 && Number(m[1]) <= 2027;
};

/** The visible text for an "invalid" issue on `field` of `a` (the issue's own message is English only). */
function caErrorText(t: TFunction, field: string, a: CaActivity): string {
  switch (field) {
    case "position":
      return t("writing.ca.err.tooLong", { max: CA_LIMITS.position, n: a.position.length });
    case "organization":
      return t("writing.ca.err.tooLong", { max: CA_LIMITS.organization, n: a.organization.length });
    case "description":
      return t("writing.ca.err.tooLong", { max: CA_LIMITS.description, n: a.description.length });
    case "hoursPerWeek":
      return t("writing.ca.err.hours");
    case "weeksPerYear":
      return t("writing.ca.err.weeks");
    case "afterStart":
      return t("writing.ca.err.date");
    case "afterEnd":
      return a.afterStart && a.afterEnd && inDateRange(a.afterStart) && inDateRange(a.afterEnd) ? t("writing.ca.err.endBeforeStart") : t("writing.ca.err.date");
    default:
      return t("writing.ca.err.notInList");
  }
}

export function CaActivityFields({ a, set }: { a: CaActivity; set: (p: Partial<CaActivity>) => void }) {
  const t = useT();
  const issues = caActivityIssues(a);
  const missing = (f: keyof CaActivity) => issues.some((i) => i.field === f && i.kind === "missing");
  /** The error for a stored value, shown on fields that are not edited as a draft (selects). */
  const stored = (f: keyof CaActivity) => (issues.some((i) => i.field === f && i.kind === "invalid") ? caErrorText(t, f, a) : null);
  /** The error for a draft of the single field in `patch`, including a problem it would cause on another field (a start date after the stored end date). */
  const draft = (patch: Partial<CaActivity>) => {
    const next = { ...a, ...patch };
    const f = Object.keys(patch)[0];
    const found = draftIssues(a, patch);
    if (found.length === 0) return null;
    return caErrorText(t, (found.find((i) => i.field === f) ?? found[0]).field, next);
  };
  const yesNo = { yes: t("common.yes"), no: t("common.no") };

  return (
    <>
      {a.legacy && <LegacyNote text={a.legacy} onDismiss={() => set({ legacy: undefined })} />}
      {caVisibleQuestions(a).map((field) => {
        switch (field) {
          case "type":
            return (
              <SelectField
                key={field}
                label={t("writing.activityType")}
                value={a.type}
                options={CA_ACTIVITY_TYPES.map((v) => ({ value: v, label: typeLabel(t, v) }))}
                onChange={(type) => set({ type })}
                missing={missing("type")}
                error={stored("type")}
              />
            );
          case "sport":
            return (
              <SelectField
                key={field}
                label={t("writing.ca.sport")}
                value={a.sport}
                options={CA_SPORTS.map((v) => ({ value: v, label: v }))}
                onChange={(sport) => set({ sport })}
                missing={missing("sport")}
                error={stored("sport")}
              />
            );
          case "description":
            return (
              <div key={field} className={wide}>
                <TextField
                  label={t("writing.caDescription")}
                  value={a.description}
                  max={CA_LIMITS.description}
                  rows={3}
                  onSave={(description) => set({ description })}
                  validate={(description) => draft({ description })}
                  missing={missing("description")}
                />
              </div>
            );
          case "organization":
            return (
              <div key={field} className={wide}>
                <TextField
                  label={t("writing.organizationName")}
                  value={a.organization}
                  max={CA_LIMITS.organization}
                  onSave={(organization) => set({ organization })}
                  validate={(organization) => draft({ organization })}
                />
              </div>
            );
          case "leadership":
            return (
              <Radios
                key={field}
                label={t("writing.ca.leadership")}
                options={yesNo}
                value={a.leadership === null ? null : a.leadership ? "yes" : "no"}
                onChange={(k) => set({ leadership: k === "yes" })}
              />
            );
          case "position":
            return (
              <TextField
                key={field}
                label={t("writing.position")}
                value={a.position}
                max={CA_LIMITS.position}
                onSave={(position) => set({ position })}
                validate={(position) => draft({ position })}
                missing={missing("position")}
              />
            );
          case "grades":
            return (
              <div key={field} className={wide}>
                <Checks label={t("writing.ca.grades")} options={caGradeOptions(t)} value={a.grades} onChange={(grades) => set({ grades })} missing={missing("grades")} />
              </div>
            );
          case "timing":
            return (
              <div key={field} className={wide}>
                <Radios<CaTiming> label={t("writing.timing")} options={labels(CA_TIMING_KEYS, t)} value={a.timing} onChange={(timing) => set({ timing })} missing={missing("timing")} />
              </div>
            );
          case "afterStart":
            return (
              <MonthField
                key={field}
                label={t("writing.ca.afterStart")}
                value={a.afterStart}
                onSave={(afterStart) => set({ afterStart })}
                validate={(afterStart) => draft({ afterStart })}
                missing={missing("afterStart")}
              />
            );
          case "stillParticipating":
            return (
              <Radios
                key={field}
                label={t("writing.ca.stillParticipating")}
                options={yesNo}
                value={a.stillParticipating === null ? null : a.stillParticipating ? "yes" : "no"}
                onChange={(k) => set({ stillParticipating: k === "yes" })}
                missing={missing("stillParticipating")}
              />
            );
          case "afterEnd":
            return (
              <MonthField
                key={field}
                label={t("writing.ca.afterEnd")}
                value={a.afterEnd}
                onSave={(afterEnd) => set({ afterEnd })}
                validate={(afterEnd) => draft({ afterEnd })}
                missing={missing("afterEnd")}
              />
            );
          case "hoursPerWeek":
            return (
              <DecimalField
                key={field}
                label={t("writing.ca.hours")}
                value={a.hoursPerWeek}
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
                label={t("writing.ca.weeks")}
                value={a.weeksPerYear}
                placeholder="1–52"
                onSave={(weeksPerYear) => set({ weeksPerYear })}
                validate={(weeksPerYear) => draft({ weeksPerYear })}
                missing={missing("weeksPerYear")}
              />
            );
          case "continueInCollege":
            return (
              <div key={field} className={wide}>
                <Radios<CaContinue>
                  label={t("writing.continueCollege")}
                  options={labels(CA_CONTINUE_KEYS, t)}
                  value={a.continueInCollege}
                  onChange={(continueInCollege) => set({ continueInCollege })}
                  missing={missing("continueInCollege")}
                />
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
