"use client";

import { useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import {
  awardedTotal,
  emptyScholarship,
  isScholarshipOpen,
  scholarshipDays,
  scholarshipTone,
  SCHOLARSHIP_LIMITS,
  SCHOLARSHIP_STATUSES,
  sortScholarships,
  validateScholarship,
  type Scholarship,
  type ScholarshipInput,
  type ScholarshipStatus,
} from "@/lib/scholarships";
import { safeLink } from "@/lib/checklist";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const statusLabel = (t: TFunction, s: ScholarshipStatus) => t(`scholarships.status.${s}` as MessageKey);

/** Validation messages come from lib/scholarships.ts in English (tests assert them); map them to translations here. */
function errorText(t: TFunction, error: string): string {
  const exact: Record<string, MessageKey> = {
    "Enter the scholarship's name.": "scholarships.err.name",
    "Enter a valid deadline.": "scholarships.err.deadline",
    "Enter a link starting with http:// or https://.": "scholarships.err.url",
    "Choose a status.": "scholarships.err.status",
  };
  if (exact[error]) return t(exact[error]);
  const L = SCHOLARSHIP_LIMITS;
  if (error === `Keep the name under ${L.name} characters.`) return t("scholarships.err.nameLong", { n: L.name });
  if (error === `Keep the provider under ${L.provider} characters.`) return t("scholarships.err.providerLong", { n: L.provider });
  if (error === `Keep the notes under ${L.notes} characters.`) return t("scholarships.err.notesLong", { n: L.notes });
  if (error === `Enter the amount as a whole number of dollars (0 to ${L.amount.toLocaleString("en-US")}).`) return t("scholarships.err.amount", { max: L.amount.toLocaleString("en-US") });
  return error;
}

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// The form keeps the amount as typed; validateScholarship turns it into whole dollars.
type FormState = Omit<ScholarshipInput, "amountUsd"> & { amountUsd: string };
const toForm = (v: ScholarshipInput): FormState => ({ ...v, amountUsd: v.amountUsd == null ? "" : String(v.amountUsd) });

/** Add / edit form. `initial` is the starting state; onSave gets a validated value. */
function ScholarshipForm({ initial, submitLabel, onSave, onCancel }: { initial: ScholarshipInput; submitLabel: string; onSave: (v: ScholarshipInput) => void; onCancel?: () => void }) {
  const t = useT();
  const [f, setF] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateScholarship(f);
    if (!r.ok) return setError(errorText(t, r.error));
    setError(null);
    onSave(r.value);
    if (!onCancel) setF(toForm(emptyScholarship()));
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        {t("scholarships.name")}
        <input className={field} value={f.name} maxLength={SCHOLARSHIP_LIMITS.name} onChange={(e) => set("name", e.target.value)} placeholder={t("scholarships.namePlaceholder")} />
      </label>
      <label className="text-sm font-medium">
        {t("scholarships.provider")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input className={field} value={f.provider} maxLength={SCHOLARSHIP_LIMITS.provider} onChange={(e) => set("provider", e.target.value)} placeholder={t("scholarships.providerPlaceholder")} />
      </label>
      <label className="text-sm font-medium">
        {t("scholarships.amount")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input className={field} inputMode="numeric" value={f.amountUsd} onChange={(e) => set("amountUsd", e.target.value)} placeholder="5000" />
      </label>
      <label className="text-sm font-medium">
        {t("scholarships.deadline")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input type="date" className={field} value={f.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        {t("scholarships.link")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input type="url" className={field} value={f.url} maxLength={SCHOLARSHIP_LIMITS.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        {t("common.notes")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <textarea className={field} rows={2} value={f.notes} maxLength={SCHOLARSHIP_LIMITS.notes} onChange={(e) => set("notes", e.target.value)} placeholder={t("scholarships.notesPlaceholder")} />
      </label>
      <label className="text-sm font-medium">
        {t("scholarships.status")}
        <select className={field} value={f.status} onChange={(e) => set("status", e.target.value as ScholarshipStatus)}>
          {SCHOLARSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(t, s)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
        {onCancel && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={onCancel}>
            {t("common.cancel")}
          </button>
        )}
        <button type="submit" className={buttonClass("primary", "sm")}>
          {submitLabel}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-urgent sm:col-span-2">
          {error}
        </p>
      )}
    </form>
  );
}

/** Student's scholarship tracker. Private: teachers never see it. */
export function ScholarshipsPage() {
  const t = useT();
  const { scholarships, ready, error, addScholarship, updateScholarship, removeScholarship, clearError } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date();
  const sorted = sortScholarships(scholarships);
  const open = scholarships.filter((s) => isScholarshipOpen(s.status)).length;
  const awarded = awardedTotal(scholarships);

  function remove(s: Scholarship) {
    if (!confirm(t("scholarships.removeConfirm", { name: s.name }))) return;
    removeScholarship(s.id);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">{t("scholarships.intro")}</p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("scholarships.dismiss")}
          </button>
        </p>
      )}

      <section aria-labelledby="sch-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="sch-add" className="font-display text-lg font-bold">
          {t("scholarships.addTitle")}
        </h2>
        <ScholarshipForm initial={emptyScholarship()} submitLabel={t("scholarships.addButton")} onSave={addScholarship} />
      </section>

      <section aria-labelledby="sch-list" className="space-y-3">
        <h2 id="sch-list" className="font-display text-lg font-bold">
          {t("scholarships.listTitle")}{" "}
          {scholarships.length > 0 && (
            <span className="text-sm font-normal text-zinc-500">
              {awarded > 0 ? t("scholarships.summaryOpenAwarded", { open, amount: usd(awarded) }) : t("scholarships.summaryOpen", { open })}
            </span>
          )}
        </h2>
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("scholarships.empty")}</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {sorted.map((s) => {
              const isOpen = isScholarshipOpen(s.status);
              const days = scholarshipDays(s, today);
              return (
                <li key={s.id} className="space-y-2 p-4">
                  {editing === s.id ? (
                    <ScholarshipForm
                      initial={{ name: s.name, provider: s.provider, amountUsd: s.amountUsd, deadline: s.deadline, url: s.url, status: s.status, notes: s.notes }}
                      submitLabel={t("common.save")}
                      onSave={(v) => {
                        updateScholarship(s.id, v);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {s.url && safeLink(s.url) ? (
                              <a href={safeLink(s.url)!} target="_blank" rel="noopener noreferrer" className="underline">
                                {s.name}
                              </a>
                            ) : (
                              s.name
                            )}
                            {s.provider && <span className="text-sm font-normal text-zinc-500"> · {s.provider}</span>}
                          </p>
                          {s.amountUsd != null && <p className="text-sm text-zinc-600">{usd(s.amountUsd)}</p>}
                          {s.notes && <p className="text-sm whitespace-pre-line text-zinc-600">{s.notes}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={scholarshipTone(s, today)}>{statusLabel(t, s.status)}</StatusPill>
                          {s.deadline && days != null && <DeadlineChip date={s.deadline} days={days} done={!isOpen} doneLabel={statusLabel(t, s.status)} label={t("scholarships.due")} />}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={t("scholarships.statusFor", { name: s.name })}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                          value={s.status}
                          onChange={(e) => updateScholarship(s.id, { status: e.target.value as ScholarshipStatus })}
                        >
                          {SCHOLARSHIP_STATUSES.map((x) => (
                            <option key={x} value={x}>
                              {statusLabel(t, x)}
                            </option>
                          ))}
                        </select>
                        <button type="button" className={buttonClass("secondary", "sm")} aria-label={t("scholarships.editFor", { name: s.name })} onClick={() => setEditing(s.id)}>
                          {t("common.edit")}
                        </button>
                        <button type="button" className={buttonClass("danger", "sm")} aria-label={t("scholarships.removeFor", { name: s.name })} onClick={() => remove(s)}>
                          {t("common.remove")}
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
