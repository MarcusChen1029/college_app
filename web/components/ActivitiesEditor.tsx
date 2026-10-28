"use client";

import { useId, useState, useSyncExternalStore } from "react";
import {
  CA_ACTIVITY_TYPES,
  CA_LIMITS,
  CA_SPORTS,
  caActivityIssues,
  caHonorIssues,
  caVisibleQuestions,
  draftIssues,
  GRADES,
  move,
  newCaActivity,
  newCaHonor,
  newUcEntry,
  UC_AWARD_LEVELS,
  UC_CATEGORIES,
  UC_CATEGORY_KEYS,
  UC_LIMITS,
  ucDraftsFromCommonApp,
  upgradeActivities,
  type ActivityData,
  type CaActivity,
  type CaContinue,
  type CaHonor,
  type CaTiming,
  type Grade,
  type HonorLevel,
  type Issue,
  type UcAwardLevel,
  type UcCategory,
  type UcEntry,
} from "@/lib/activities";
import { SignInButton } from "@/components/SignInDialog";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { caTypeLabel as typeLabel } from "@/lib/i18n/ca-types";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass, toneClass } from "@/lib/ui";

const noop = () => () => {};
const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

const CA_TIMING_KEYS: Record<CaTiming, MessageKey> = { school: "writing.timing.school", break: "writing.timing.break", all: "writing.timing.all" };
const CA_CONTINUE_KEYS: Record<CaContinue, MessageKey> = { yes: "common.yes", no: "common.no", not_sure: "writing.ca.notSure" };
const HONOR_KEYS: Record<HonorLevel, MessageKey> = {
  school: "writing.honorLevel.school",
  state_regional: "writing.honorLevel.state_regional",
  national: "writing.honorLevel.national",
  international: "writing.honorLevel.international",
};
const AWARD_KEYS: Record<UcAwardLevel, MessageKey> = {
  school: "writing.awardLevel.school",
  city: "writing.awardLevel.city",
  state: "writing.awardLevel.state",
  regional: "writing.awardLevel.regional",
  national: "writing.awardLevel.national",
  international: "writing.awardLevel.international",
};
const UC_FORM_KEYS: Record<UcCategory, { label: MessageKey; name: MessageKey; organization?: MessageKey; extra?: MessageKey; description: MessageKey }> = {
  award: { label: "writing.uc.award.label", name: "writing.uc.award.name", extra: "writing.uc.award.extra", description: "writing.uc.award.description" },
  edprep: { label: "writing.uc.edprep.label", name: "writing.uc.edprep.name", description: "writing.uc.edprep.description" },
  extracurricular: { label: "writing.uc.extracurricular.label", name: "writing.uc.extracurricular.name", description: "writing.uc.extracurricular.description" },
  coursework: { label: "writing.uc.coursework.label", name: "writing.uc.coursework.name", description: "writing.uc.coursework.description" },
  volunteer: { label: "writing.uc.volunteer.label", name: "writing.uc.volunteer.name", extra: "writing.uc.volunteer.extra", description: "writing.uc.volunteer.description" },
  work: {
    label: "writing.uc.work.label",
    name: "writing.uc.work.name",
    organization: "writing.uc.work.organization",
    extra: "writing.uc.work.extra",
    description: "writing.uc.work.description",
  },
};
const labels = <K extends string>(keys: Record<K, MessageKey>, t: TFunction) =>
  Object.fromEntries((Object.keys(keys) as K[]).map((k) => [k, t(keys[k])])) as Record<K, string>;

// ── small fields ──

/** "Needs an answer" marker beside a question's label. */
function Needs({ show }: { show: boolean }) {
  const t = useT();
  return show ? <span className="ml-2 font-semibold text-soon">{t("writing.needsAnswer")}</span> : null;
}

function FieldError({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="text-xs text-urgent">
      {message}
    </p>
  ) : null;
}

/**
 * Text box with a live character count; saves on blur.
 * With `validate`, the box has no hard length limit: an over-long or otherwise invalid draft shows its error and is not saved.
 */
function TextField({
  label,
  value,
  max,
  rows,
  onSave,
  validate,
  missing,
}: {
  label: string;
  value: string;
  max: number;
  rows?: number;
  onSave: (v: string) => void;
  validate?: (v: string) => string | null;
  missing?: boolean;
}) {
  const [v, setV] = useState(value);
  const error = validate ? validate(v) : null;
  const props = { className: input, maxLength: validate ? undefined : max, value: v, "aria-invalid": error ? true : undefined, onBlur: () => v !== value && !error && onSave(v) };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between gap-2 text-xs text-zinc-500">
        <span>
          {label}
          <Needs show={!!missing} />
        </span>
        <span className={`tabular-nums ${v.length > max ? "font-semibold text-urgent" : v.length >= max ? "font-semibold text-soon" : ""}`}>
          {v.length}/{max}
        </span>
      </span>
      {rows ? (
        <textarea {...props} rows={rows} onChange={(e) => setV(e.target.value)} />
      ) : (
        <input {...props} onChange={(e) => setV(e.target.value)} />
      )}
      <FieldError message={error} />
    </label>
  );
}

function NumberField({ label, value, max, onSave }: { label: string; value: number | null; max: number; onSave: (n: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">{label}</span>
      <input
        key={value ?? "empty"}
        className={`${input} w-24`}
        inputMode="numeric"
        placeholder={`0–${max}`}
        defaultValue={value ?? ""}
        onBlur={(e) => {
          const raw = e.target.value.trim();
          const n = raw === "" ? null : Number(raw);
          if (n != null && !(Number.isInteger(n) && n >= 0 && n <= max)) {
            e.target.value = value?.toString() ?? "";
            return;
          }
          if (n !== value) onSave(n);
        }}
      />
    </label>
  );
}

/** A number the portal accepts with decimals (hours, weeks). An out-of-range draft shows its error and is not saved. */
function DecimalField({
  label,
  value,
  placeholder,
  onSave,
  validate,
  missing,
}: {
  label: string;
  value: number | null;
  placeholder: string;
  onSave: (n: number | null) => void;
  validate: (n: number) => string | null;
  missing?: boolean;
}) {
  const [v, setV] = useState(value == null ? "" : String(value));
  const blank = v.trim() === "";
  const n = blank ? null : Number(v);
  const error = n === null ? null : validate(n);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">
        {label}
        <Needs show={!!missing} />
      </span>
      <input
        className={`${input} w-28`}
        inputMode="decimal"
        placeholder={placeholder}
        value={v}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => n !== value && !error && onSave(n)}
      />
      <FieldError message={error} />
    </label>
  );
}

/** A month and year ("YYYY-MM"). A complete value that fails the check shows its error and is not saved. */
function MonthField({
  label,
  value,
  onSave,
  validate,
  missing,
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  validate: (v: string) => string | null;
  missing?: boolean;
}) {
  const [v, setV] = useState(value ?? "");
  const error = v === "" ? null : validate(v);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">
        {label}
        <Needs show={!!missing} />
      </span>
      <input
        type="month"
        min="1926-01"
        max="2027-12"
        className={input}
        value={v}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          // "" can also mean a segment was cleared mid-edit, so a cleared box is only saved on blur.
          const next = e.target.value;
          setV(next);
          if (next !== "" && !validate(next) && next !== value) onSave(next);
        }}
        onBlur={(e) => {
          if (v !== "" || value === null) return;
          if (e.target.validity.badInput) setV(value); // half-typed date: put the stored one back
          else onSave(null);
        }}
      />
      <FieldError message={error} />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  missing,
  error,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  missing?: boolean;
  error: string | null;
}) {
  const t = useT();
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500">
        {label}
        <Needs show={!!missing} />
      </span>
      <select className={input} value={value} aria-invalid={error ? true : undefined} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("writing.choose")}</option>
        {value && !options.some((o) => o.value === value) && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <FieldError message={error} />
    </label>
  );
}

function Radios<K extends string>({
  label,
  options,
  value,
  onChange,
  missing,
}: {
  label: string;
  options: Record<K, string>;
  value: K | null;
  onChange: (v: K) => void;
  missing?: boolean;
}) {
  const name = useId();
  const keys = Object.keys(options) as K[];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs text-zinc-500">
        {label}
        <Needs show={!!missing} />
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input type="radio" name={name} checked={value === k} onChange={() => onChange(k)} />
            {options[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Checks<K extends string>({
  label,
  options,
  value,
  onChange,
  missing,
}: {
  label: string;
  options: Record<K, string>;
  value: K[];
  onChange: (v: K[]) => void;
  missing?: boolean;
}) {
  const keys = Object.keys(options) as K[];
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs text-zinc-500">
        {label}
        <Needs show={!!missing} />
      </legend>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {keys.map((k) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input
              type="checkbox"
              checked={value.includes(k)}
              onChange={(e) => onChange(e.target.checked ? keys.filter((x) => x === k || value.includes(x)) : value.filter((x) => x !== k))}
            />
            {options[k]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

const gradeOptions = (t: TFunction) => Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.grade.PG") : g])) as Record<Grade, string>;
/** Common App's own wording: "9th grade" ... "After graduating high school". */
const caGradeOptions = (t: TFunction) =>
  Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.ca.gradePG") : t("writing.ca.grade", { n: g })])) as Record<Grade, string>;

// ── entry card ──

function Pill({ tone, children }: { tone: "soon" | "urgent"; children: React.ReactNode }) {
  return <span className={`rounded border px-1.5 py-0.5 text-xs font-medium ${toneClass(tone)}`}>{children}</span>;
}

function Card({
  index,
  title,
  subtitle,
  issues,
  open,
  onToggle,
  onMove,
  onRemove,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  issues: Issue[];
  open: boolean;
  onToggle: () => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  const btn = "grid h-7 w-7 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100";
  const missing = issues.some((i) => i.kind === "missing");
  const invalid = issues.some((i) => i.kind === "invalid");
  return (
    <li className="rounded-2xl border border-zinc-200">
      <div className="flex items-center gap-2 p-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <span className="block truncate font-semibold">{title || <span className="font-normal text-zinc-400">{t("writing.untitled")}</span>}</span>
          {subtitle && <span className="block truncate text-xs text-zinc-500">{subtitle}</span>}
          {(missing || invalid) && (
            <span className="mt-1 flex flex-wrap gap-1">
              {missing && <Pill tone="soon">{t("writing.needsAnswer")}</Pill>}
              {invalid && <Pill tone="urgent">{t("writing.needsFix")}</Pill>}
            </span>
          )}
        </button>
        <button type="button" className={btn} onClick={() => onMove(-1)} aria-label={t("writing.moveUp")}>
          ↑
        </button>
        <button type="button" className={btn} onClick={() => onMove(1)} aria-label={t("writing.moveDown")}>
          ↓
        </button>
        <button type="button" className={buttonClass("danger", "sm")} onClick={onRemove}>
          {t("common.remove")}
        </button>
      </div>
      {open && <div className="grid gap-3 border-t border-zinc-100 p-3 sm:grid-cols-2">{children}</div>}
    </li>
  );
}

const wide = "sm:col-span-2";

const LEGACY_PREFIX = "From your earlier version: ";

/** An old value with no exact place in the current form, with a button that clears it. */
function LegacyNote({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  const t = useT();
  return (
    <div className={`${wide} flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm ${toneClass("neutral")}`}>
      <p className="min-w-0 flex-1 break-words">{t("writing.legacyNote", { text: text.split(LEGACY_PREFIX).join("") })}</p>
      <button type="button" className={buttonClass("secondary", "sm")} onClick={onDismiss}>
        {t("writing.dismiss")}
      </button>
    </div>
  );
}

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

function CaActivityFields({ a, set }: { a: CaActivity; set: (p: Partial<CaActivity>) => void }) {
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

function CaHonorFields({ h, set }: { h: CaHonor; set: (p: Partial<CaHonor>) => void }) {
  const t = useT();
  const issues = caHonorIssues(h);
  const missing = (f: keyof CaHonor) => issues.some((i) => i.field === f && i.kind === "missing");
  return (
    <>
      <div className={wide}>
        <TextField
          label={t("writing.honorTitle")}
          value={h.title}
          max={CA_LIMITS.honorTitle}
          onSave={(title) => set({ title })}
          validate={(title) => (title.length > CA_LIMITS.honorTitle ? t("writing.ca.err.tooLong", { max: CA_LIMITS.honorTitle, n: title.length }) : null)}
          missing={missing("title")}
        />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={h.grades} onChange={(grades) => set({ grades })} missing={missing("grades")} />
      <Checks<HonorLevel> label={t("writing.honorLevels")} options={labels(HONOR_KEYS, t)} value={h.levels} onChange={(levels) => set({ levels })} missing={missing("levels")} />
    </>
  );
}

function UcFields({ e, set }: { e: UcEntry; set: (p: Partial<UcEntry>) => void }) {
  const t = useT();
  const form = UC_CATEGORIES[e.category];
  const fk = UC_FORM_KEYS[e.category];
  return (
    <>
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
      <TextField key={`name-${e.category}`} label={t(fk.name)} value={e.name} max={UC_LIMITS.name} onSave={(name) => set({ name })} />
      {/* Task 6 redesigns the UC tab; this only keeps the file compiling (work's second box is now `jobTitle`, an award has a list of levels). */}
      {fk.organization && <TextField label={t(fk.organization)} value={e.jobTitle} max={UC_LIMITS.name} onSave={(jobTitle) => set({ jobTitle })} />}
      {e.category === "award" && (
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.levelOfRecognition")}</span>
            <select
              className={`${input} w-auto`}
              value={e.awardLevels[0] ?? ""}
              onChange={(ev) => set({ awardLevels: ev.target.value ? [ev.target.value as UcAwardLevel] : [] })}
            >
              <option value="">—</option>
              {(Object.keys(UC_AWARD_LEVELS) as UcAwardLevel[]).map((k) => (
                <option key={k} value={k}>
                  {t(AWARD_KEYS[k])}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs text-zinc-500">{t("writing.awardType")}</span>
            <select
              className={`${input} w-auto`}
              value={e.awardType ?? ""}
              onChange={(ev) => set({ awardType: (ev.target.value || null) as UcEntry["awardType"] })}
            >
              <option value="">—</option>
              <option value="academic">{t("writing.awardAcademic")}</option>
              <option value="non_academic">{t("writing.awardNonAcademic")}</option>
            </select>
          </label>
        </div>
      )}
      {fk.extra && (
        <div className={wide}>
          <TextField key={`extra-${e.category}`} label={t(fk.extra)} value={e.extra} max={UC_LIMITS.extra} rows={2} onSave={(extra) => set({ extra })} />
        </div>
      )}
      <div className={wide}>
        <TextField key={`desc-${e.category}`} label={t(fk.description)} value={e.description} max={UC_LIMITS.description} rows={4} onSave={(description) => set({ description })} />
      </div>
      <Checks label={t("writing.gradeLevels")} options={gradeOptions(t)} value={e.grades} onChange={(grades) => set({ grades })} />
      {form.hours && (
        <div className="flex gap-3">
          <NumberField label={t("writing.hoursWeek")} value={e.hoursPerWeek} max={168} onSave={(hoursPerWeek) => set({ hoursPerWeek })} />
          <NumberField label={t("writing.weeksYear")} value={e.weeksPerYear} max={52} onSave={(weeksPerYear) => set({ weeksPerYear })} />
        </div>
      )}
    </>
  );
}

// ── lists ──

type Item = { id: string };

/** Ordered list of cards with add/move/remove; `render` draws one item's fields. */
function EntryList<T extends Item>({
  heading,
  items,
  limit,
  addLabel,
  onChange,
  make,
  title,
  subtitle,
  issues,
  render,
  extraAction,
}: {
  heading: string;
  items: T[];
  limit: number;
  addLabel: string;
  onChange: (items: T[]) => void;
  make: () => T;
  title: (item: T) => string;
  subtitle: (item: T) => string;
  /** The item's unanswered / invalid questions, shown as badges on its header. */
  issues?: (item: T) => Issue[];
  render: (item: T, set: (p: Partial<T>) => void) => React.ReactNode;
  extraAction?: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const full = items.length >= limit;
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-bold">{heading}</h2>
        <span className={`text-sm tabular-nums ${full ? "font-semibold text-soon" : "text-zinc-500"}`}>
          {items.length} / {limit}
        </span>
        <span className="ml-auto flex flex-wrap gap-2">
          {extraAction}
          <button
            type="button"
            disabled={full}
            className={buttonClass("primary", "sm")}
            onClick={() => {
              const item = make();
              onChange([...items, item]);
              setOpen(item.id);
            }}
          >
            {addLabel}
          </button>
        </span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">{t("writing.nothingYet")}</p>
      ) : (
        <ol className="space-y-2">
          {items.map((item, i) => (
            <Card
              key={item.id}
              index={i}
              title={title(item)}
              subtitle={subtitle(item)}
              issues={issues ? issues(item) : []}
              open={open === item.id}
              onToggle={() => setOpen(open === item.id ? null : item.id)}
              onMove={(dir) => onChange(move(items, i, dir))}
              onRemove={() => {
                if (window.confirm(t("writing.confirmRemove", { name: title(item) || t("writing.untitled") }))) onChange(items.filter((x) => x.id !== item.id));
              }}
            >
              {render(item, (p) => onChange(items.map((x) => (x.id === item.id ? { ...x, ...p } : x))))}
            </Card>
          ))}
        </ol>
      )}
    </section>
  );
}

const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

export function ActivitiesEditor() {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [tab, setTab] = useState<"common" | "uc">("common");
  if (!mounted || !student.ready) return <div className="h-64 animate-pulse rounded-3xl bg-zinc-100" />;

  const data: ActivityData = upgradeActivities(student.profile.activities);
  const save = (next: ActivityData) => student.updateProfile({ activities: next });
  const drafts = ucDraftsFromCommonApp(data);
  const room = UC_LIMITS.entries - data.uc.length;
  const needAnswer = [...data.commonApp.activities.map(caActivityIssues), ...data.commonApp.honors.map(caHonorIssues)].filter((is) => is.some((i) => i.kind === "missing")).length;

  const grades = (g: Grade[]) => (g.length ? t("writing.gradesList", { list: g.join(", ") }) : "");
  const hours = (h: number | null, w: number | null) => (h != null || w != null ? t("writing.hoursSummary", { h: h ?? "?", w: w ?? "?" }) : "");

  const tabBtn = (key: typeof tab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === key ? "bg-ink text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("common", t("writing.tabCommonApp"))}
        {tabBtn("uc", t("writing.tabUc"))}
        <span className="ml-auto text-xs text-zinc-500">
          {student.auth ? t("writing.synced") : t("writing.savedLocal")}
          {!student.auth && <SignInButton className="text-blue-600 underline">{t("account.signIn")}</SignInButton>}
        </span>
      </div>

      {tab === "common" ? (
        <>
          {needAnswer > 0 && <p className={`rounded-lg border px-3 py-2 text-sm ${toneClass("soon")}`}>{t("writing.needsCount", { n: needAnswer })}</p>}
          <EntryList<CaActivity>
            heading={t("writing.headingActivities")}
            items={data.commonApp.activities}
            limit={CA_LIMITS.activities}
            addLabel={t("writing.addActivity")}
            make={newCaActivity}
            onChange={(activities) => save({ ...data, commonApp: { ...data.commonApp, activities } })}
            title={(a) => a.organization || a.position}
            subtitle={(a) => join(typeLabel(t, a.type), a.position && a.organization ? a.position : "", grades(a.grades), hours(a.hoursPerWeek, a.weeksPerYear))}
            issues={caActivityIssues}
            render={(a, set) => <CaActivityFields a={a} set={set} />}
          />
          <EntryList<CaHonor>
            heading={t("writing.headingHonors")}
            items={data.commonApp.honors}
            limit={CA_LIMITS.honors}
            addLabel={t("writing.addHonor")}
            make={newCaHonor}
            onChange={(honors) => save({ ...data, commonApp: { ...data.commonApp, honors } })}
            title={(h) => h.title}
            subtitle={(h) => join(h.levels.map((l) => t(HONOR_KEYS[l])).join(", "), grades(h.grades))}
            issues={caHonorIssues}
            render={(h, set) => <CaHonorFields h={h} set={set} />}
          />
          <p className="text-xs text-zinc-500">
            {t("writing.caLimitsNote", {
              position: CA_LIMITS.position,
              organization: CA_LIMITS.organization,
              description: CA_LIMITS.description,
              honorTitle: CA_LIMITS.honorTitle,
            })}
          </p>
        </>
      ) : (
        <>
          <EntryList<UcEntry>
            heading={t("writing.headingUc")}
            items={data.uc}
            limit={UC_LIMITS.entries}
            addLabel={t("writing.addEntry")}
            make={() => newUcEntry("extracurricular")}
            onChange={(uc) => save({ ...data, uc })}
            title={(e) => e.name}
            subtitle={(e) => join(t(UC_FORM_KEYS[e.category].label), grades(e.grades), UC_CATEGORIES[e.category].hours ? hours(e.hoursPerWeek, e.weeksPerYear) : "")}
            render={(e, set) => <UcFields e={e} set={set} />}
            extraAction={
              drafts.length > 0 && (
                <button
                  type="button"
                  disabled={room <= 0}
                  className={buttonClass("secondary", "sm")}
                  onClick={() => save({ ...data, uc: [...data.uc, ...drafts.slice(0, room)] })}
                  title={t("writing.copyFromCommonAppTitle")}
                >
                  {t("writing.copyFromCommonApp", { n: Math.min(drafts.length, Math.max(room, 0)) })}
                </button>
              )
            }
          />
          <p className="text-xs text-zinc-500">
            {t("writing.ucLimitsNote", { entries: UC_LIMITS.entries, description: UC_LIMITS.description, extra: UC_LIMITS.extra })}
          </p>
        </>
      )}
    </div>
  );
}
