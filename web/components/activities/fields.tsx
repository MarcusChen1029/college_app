"use client";

import { useId, useState } from "react";
import { GRADES, type Grade } from "@/lib/activities";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { buttonClass, toneClass } from "@/lib/ui";

export const input = "w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm";

export const labels = <K extends string>(keys: Record<K, MessageKey>, t: TFunction) =>
  Object.fromEntries((Object.keys(keys) as K[]).map((k) => [k, t(keys[k])])) as Record<K, string>;

// ── small fields ──

/** "Needs an answer" marker beside a question's label. */
export function Needs({ show }: { show: boolean }) {
  const t = useT();
  return show ? <span className="ml-2 font-semibold text-soon">{t("writing.needsAnswer")}</span> : null;
}

export function FieldError({ message }: { message: string | null }) {
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
export function TextField({
  label,
  value,
  max,
  rows,
  onSave,
  validate,
  missing,
  measure = (v) => v.length,
}: {
  label: string;
  value: string;
  max: number;
  rows?: number;
  onSave: (v: string) => void;
  validate?: (v: string) => string | null;
  missing?: boolean;
  /** How the portal counts the box (UC counts a line break as 2); the counter and its colours use it. Default: characters. */
  measure?: (v: string) => number;
}) {
  const [v, setV] = useState(value);
  const error = validate ? validate(v) : null;
  const size = measure(v);
  const props = { className: input, maxLength: validate ? undefined : max, value: v, "aria-invalid": error ? true : undefined, onBlur: () => v !== value && !error && onSave(v) };
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between gap-2 text-xs text-zinc-500">
        <span>
          {label}
          <Needs show={!!missing} />
        </span>
        <span className={`tabular-nums ${size > max ? "font-semibold text-urgent" : size >= max ? "font-semibold text-soon" : ""}`}>
          {size}/{max}
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

/** A number the portal accepts with decimals (hours, weeks). An out-of-range draft shows its error and is not saved. */
export function DecimalField({
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
export function MonthField({
  label,
  value,
  onSave,
  validate,
  missing,
  min = "1926-01",
  max = "2027-12",
}: {
  label: string;
  value: string | null;
  onSave: (v: string | null) => void;
  validate: (v: string) => string | null;
  missing?: boolean;
  min?: string;
  max?: string;
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
        min={min}
        max={max}
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

export function SelectField({
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

export function Radios<K extends string>({
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

export function Checks<K extends string>({
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

export const gradeOptions = (t: TFunction) => Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.grade.PG") : g])) as Record<Grade, string>;
/** Common App's own wording: "9th grade" ... "After graduating high school". */
export const caGradeOptions = (t: TFunction) =>
  Object.fromEntries(GRADES.map((g) => [g, g === "PG" ? t("writing.ca.gradePG") : t("writing.ca.grade", { n: g })])) as Record<Grade, string>;

export const wide = "sm:col-span-2";

export const LEGACY_PREFIX = "From your earlier version: ";

/** An old value with no exact place in the current form, with a button that clears it. */
export function LegacyNote({ text, onDismiss }: { text: string; onDismiss: () => void }) {
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
