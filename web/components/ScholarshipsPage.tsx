"use client";

import { useState } from "react";
import { DeadlineChip, StatusSelect } from "@/components/StatusPill";
import {
  CURRENCIES,
  emptyScholarship,
  formatMoney,
  isScholarshipOpen,
  scholarshipDays,
  scholarshipTone,
  SCHOLARSHIP_LIMITS,
  SCHOLARSHIP_STATUSES,
  sortScholarships,
  totalsByCurrency,
  validateScholarship,
  type Currency,
  type Scholarship,
  type ScholarshipInput,
  type ScholarshipStatus,
} from "@/lib/scholarships";
import { safeLink } from "@/lib/checklist";
import { useLocale, useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { fmtDate } from "@/lib/format";
import { buttonClass, PAGE_INTRO, PANEL, SECTION_TITLE } from "@/lib/ui";
import { Star } from "./Doodles";
import { EmptyState } from "./EmptyState";

const statusLabel = (t: TFunction, s: ScholarshipStatus) => t(`scholarships.status.${s}` as MessageKey);

/** Validation messages come from lib/scholarships.ts in English (tests assert them); map them to translations here. */
function errorText(t: TFunction, error: string): string {
  const exact: Record<string, MessageKey> = {
    "Enter the scholarship's name.": "scholarships.err.name",
    "Enter a valid deadline.": "scholarships.err.deadline",
    "Enter a link starting with http:// or https://.": "scholarships.err.url",
    "Choose a status.": "scholarships.err.status",
    "Choose a currency.": "scholarships.err.currency",
  };
  if (exact[error]) return t(exact[error]);
  const L = SCHOLARSHIP_LIMITS;
  if (error === `Keep the name under ${L.name} characters.`) return t("scholarships.err.nameLong", { n: L.name });
  if (error === `Keep the provider under ${L.provider} characters.`) return t("scholarships.err.providerLong", { n: L.provider });
  if (error === `Keep the notes under ${L.notes} characters.`) return t("scholarships.err.notesLong", { n: L.notes });
  if (error === `Enter the amount as a whole number (0 to ${L.amount.toLocaleString("en-US")}).`) return t("scholarships.err.amount", { max: L.amount.toLocaleString("en-US") });
  return error;
}

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";

/** One total per currency on one line ("$1,250 · £500"); never added together. "—" when nothing has an amount. */
function Totals({ items }: { items: readonly Pick<Scholarship, "amount" | "currency">[] }) {
  const locale = useLocale();
  const totals = totalsByCurrency(items);
  return <>{totals.length ? totals.map((x) => formatMoney(x.total, x.currency, locale)).join(" · ") : "—"}</>;
}

// The form keeps the amount as typed; validateScholarship turns it into a whole number.
type FormState = Omit<ScholarshipInput, "amount"> & { amount: string };
const toForm = (v: ScholarshipInput): FormState => ({ ...v, amount: v.amount == null ? "" : String(v.amount) });

/** Add / edit form. `initial` is the starting state; onSave gets a validated value. */
function ScholarshipForm({ initial, submitLabel, onSave, onCancel }: { initial: ScholarshipInput; submitLabel: string; onSave: (v: ScholarshipInput) => void; onCancel?: () => void }) {
  const t = useT();
  // Hidden until the database has the currency column (then every scholarship is USD and the save leaves it out).
  const { currencyColumn } = useStudent();
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
        <span className="flex gap-2">
          <input className={field} inputMode="numeric" value={f.amount} onChange={(e) => set("amount", e.target.value)} placeholder="5000" />
          {currencyColumn && (
            <select className="mt-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm" aria-label={t("scholarships.currency")} value={f.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
        </span>
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

/** The money: what was won, what is still in play, and the next deadline. A total shows "—" when nothing in it has an amount (an amount of 0 still prints as 0). */
function Ledger({ scholarships, today }: { scholarships: readonly Scholarship[]; today: Date }) {
  const t = useT();
  const awardedList = scholarships.filter((s) => s.status === "awarded");
  const live = scholarships.filter((s) => isScholarshipOpen(s.status) || s.status === "submitted");
  // A scholarship with no amount adds nothing to a total; the total says how many it leaves out, so a total never reads as "none".
  const noAmount = (items: readonly Scholarship[]) => items.filter((s) => s.amount == null).length;
  const missing = (n: number) =>
    n > 0 && <span className="ml-2 font-sans text-[15px] font-medium text-zinc-700">{t("scholarships.ledger.noAmount", { n })}</span>;
  const next = scholarships
    .filter((s) => isScholarshipOpen(s.status) && s.deadline && (scholarshipDays(s, today) ?? -1) >= 0)
    .sort((a, b) => a.deadline!.localeCompare(b.deadline!))[0];
  // Three figures at one size on one line, each with its label under it (dt stays first in the markup for screen readers).
  return (
    <dl className="grid gap-x-8 gap-y-4 rounded-3xl bg-blue-50 px-6 py-5 sm:grid-cols-3">
      <div className="flex flex-col">
        <dt className="text-[15px] font-medium text-zinc-700">{t("scholarships.ledger.awarded")}</dt>
        <dd className="order-first font-display text-2xl font-bold leading-tight tabular-nums text-ink">
          <Totals items={awardedList} />
          {missing(noAmount(awardedList))}
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-[15px] font-medium text-zinc-700">{t("scholarships.ledger.inPlay", { n: live.length })}</dt>
        <dd className="order-first font-display text-2xl font-bold leading-tight tabular-nums text-ink">
          <Totals items={live} />
          {missing(noAmount(live))}
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-[15px] font-medium text-zinc-700">{next ? next.name : t("scholarships.ledger.next")}</dt>
        <dd className="order-first font-display text-2xl font-bold leading-tight text-ink">{next ? fmtDate(next.deadline!) : t("scholarships.ledger.noNext")}</dd>
      </div>
    </dl>
  );
}

/** Student's scholarship tracker. Private: teachers never see it. */
export function ScholarshipsPage() {
  const t = useT();
  const locale = useLocale();
  const { scholarships, ready, error, addScholarship, updateScholarship, removeScholarship, clearError } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const today = new Date();
  const sorted = sortScholarships(scholarships);

  function remove(s: Scholarship) {
    if (!confirm(t("scholarships.removeConfirm", { name: s.name }))) return;
    removeScholarship(s.id);
  }

  const addButton = (
    <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAdding(true)}>
      + {t("scholarships.addTitle")}
    </button>
  );

  return (
    <div className="space-y-6">
      <p className={PAGE_INTRO}>{t("scholarships.intro")}</p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("scholarships.dismiss")}
          </button>
        </p>
      )}

      {/* The summary only once there is something to sum: an empty account would lead with three zeros. */}
      {ready && scholarships.length > 0 && <Ledger scholarships={scholarships} today={today} />}

      {adding && (
        <section aria-labelledby="sch-add" className={`space-y-3 ${PANEL} p-5 sm:p-6`}>
          <h2 id="sch-add" className={SECTION_TITLE}>
            {t("scholarships.addTitle")}
          </h2>
          <ScholarshipForm
            initial={emptyScholarship()}
            submitLabel={t("scholarships.addButton")}
            onSave={(v) => {
              addScholarship(v);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </section>
      )}

      {/* An empty account: what this page will add up once there is a scholarship, and the one step to start. */}
      {ready && sorted.length === 0 && !adding && (
        <EmptyState art={<Star className="h-14 w-auto" />} title={t("scholarships.emptyTitle")} actions={addButton}>
          {t("scholarships.emptyBody")}
        </EmptyState>
      )}

      {(!ready || sorted.length > 0) && (
      <section aria-labelledby="sch-list" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="sch-list" className={SECTION_TITLE}>
            {t("scholarships.listTitle")}
          </h2>
          {!adding && sorted.length > 0 && addButton}
        </div>
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {sorted.map((s) => {
              const isOpen = isScholarshipOpen(s.status);
              const days = scholarshipDays(s, today);
              return (
                <li key={s.id} className="space-y-2 p-4">
                  {editing === s.id ? (
                    <ScholarshipForm
                      initial={{ name: s.name, provider: s.provider, amount: s.amount, currency: s.currency, deadline: s.deadline, url: s.url, status: s.status, notes: s.notes }}
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
                          {s.amount != null && <p className="text-sm text-zinc-600">{formatMoney(s.amount, s.currency, locale)}</p>}
                          {s.notes && <p className="text-sm whitespace-pre-line text-zinc-600">{s.notes}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusSelect
                            tone={scholarshipTone(s, today)}
                            value={s.status}
                            options={SCHOLARSHIP_STATUSES.map((x) => ({ value: x, label: statusLabel(t, x) }))}
                            label={t("scholarships.statusFor", { name: s.name })}
                            onChange={(status) => updateScholarship(s.id, { status })}
                          />
                          {s.deadline && days != null && <DeadlineChip date={s.deadline} days={days} done={!isOpen} doneLabel={statusLabel(t, s.status)} label={t("scholarships.due")} />}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
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
      )}
    </div>
  );
}
