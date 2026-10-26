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
  SCHOLARSHIP_STATUS_LABEL,
  SCHOLARSHIP_STATUSES,
  sortScholarships,
  validateScholarship,
  type Scholarship,
  type ScholarshipInput,
  type ScholarshipStatus,
} from "@/lib/scholarships";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";
const usd = (n: number) => `$${n.toLocaleString("en-US")}`;

// The form keeps the amount as typed; validateScholarship turns it into whole dollars.
type FormState = Omit<ScholarshipInput, "amountUsd"> & { amountUsd: string };
const toForm = (v: ScholarshipInput): FormState => ({ ...v, amountUsd: v.amountUsd == null ? "" : String(v.amountUsd) });

/** Add / edit form. `initial` is the starting state; onSave gets a validated value. */
function ScholarshipForm({ initial, submitLabel, onSave, onCancel }: { initial: ScholarshipInput; submitLabel: string; onSave: (v: ScholarshipInput) => void; onCancel?: () => void }) {
  const [f, setF] = useState<FormState>(() => toForm(initial));
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateScholarship(f);
    if (!r.ok) return setError(r.error);
    setError(null);
    onSave(r.value);
    if (!onCancel) setF(toForm(emptyScholarship()));
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Name
        <input className={field} value={f.name} maxLength={SCHOLARSHIP_LIMITS.name} onChange={(e) => set("name", e.target.value)} placeholder="City Community Foundation Award" />
      </label>
      <label className="text-sm font-medium">
        Provider <span className="font-normal text-zinc-500">(optional)</span>
        <input className={field} value={f.provider} maxLength={SCHOLARSHIP_LIMITS.provider} onChange={(e) => set("provider", e.target.value)} placeholder="Who offers it" />
      </label>
      <label className="text-sm font-medium">
        Amount in USD <span className="font-normal text-zinc-500">(optional)</span>
        <input className={field} inputMode="numeric" value={f.amountUsd} onChange={(e) => set("amountUsd", e.target.value)} placeholder="5000" />
      </label>
      <label className="text-sm font-medium">
        Deadline <span className="font-normal text-zinc-500">(optional)</span>
        <input type="date" className={field} value={f.deadline ?? ""} onChange={(e) => set("deadline", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Link <span className="font-normal text-zinc-500">(optional)</span>
        <input type="url" className={field} value={f.url} maxLength={SCHOLARSHIP_LIMITS.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" />
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Notes <span className="font-normal text-zinc-500">(optional)</span>
        <textarea className={field} rows={2} value={f.notes} maxLength={SCHOLARSHIP_LIMITS.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Essay prompt, eligibility, documents needed" />
      </label>
      <label className="text-sm font-medium">
        Status
        <select className={field} value={f.status} onChange={(e) => set("status", e.target.value as ScholarshipStatus)}>
          {SCHOLARSHIP_STATUSES.map((s) => (
            <option key={s} value={s}>
              {SCHOLARSHIP_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2 sm:justify-end">
        {onCancel && (
          <button type="button" className={buttonClass("secondary", "sm")} onClick={onCancel}>
            Cancel
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
  const { scholarships, ready, error, addScholarship, updateScholarship, removeScholarship, clearError } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date();
  const sorted = sortScholarships(scholarships);
  const open = scholarships.filter((s) => isScholarshipOpen(s.status)).length;
  const awarded = awardedTotal(scholarships);

  function remove(s: Scholarship) {
    if (!confirm(`Remove ${s.name} from your scholarships?`)) return;
    removeScholarship(s.id);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Keep track of the scholarships you plan to apply for, their deadlines, and what you won. Deadlines of scholarships you are still considering or applying to are
        included in your reminder emails. This list is private to you; teachers and counselors you link to cannot see it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}

      <section aria-labelledby="sch-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="sch-add" className="font-display text-lg font-bold">
          Add a scholarship
        </h2>
        <ScholarshipForm initial={emptyScholarship()} submitLabel="Add scholarship" onSave={addScholarship} />
      </section>

      <section aria-labelledby="sch-list" className="space-y-3">
        <h2 id="sch-list" className="font-display text-lg font-bold">
          Your scholarships{" "}
          {scholarships.length > 0 && (
            <span className="text-sm font-normal text-zinc-500">
              ({open} open{awarded > 0 ? `, ${usd(awarded)} awarded` : ""})
            </span>
          )}
        </h2>
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-zinc-500">No scholarships yet. Add the ones you found on college, community or employer websites.</p>
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
                      submitLabel="Save"
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
                            {s.url ? (
                              <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">
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
                          <StatusPill tone={scholarshipTone(s, today)}>{SCHOLARSHIP_STATUS_LABEL[s.status]}</StatusPill>
                          {s.deadline && days != null && <DeadlineChip date={s.deadline} days={days} done={!isOpen} doneLabel={SCHOLARSHIP_STATUS_LABEL[s.status]} label="Due" />}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Status for ${s.name}`}
                          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                          value={s.status}
                          onChange={(e) => updateScholarship(s.id, { status: e.target.value as ScholarshipStatus })}
                        >
                          {SCHOLARSHIP_STATUSES.map((x) => (
                            <option key={x} value={x}>
                              {SCHOLARSHIP_STATUS_LABEL[x]}
                            </option>
                          ))}
                        </select>
                        <button type="button" className={buttonClass("secondary", "sm")} aria-label={`Edit ${s.name}`} onClick={() => setEditing(s.id)}>
                          Edit
                        </button>
                        <button type="button" className={buttonClass("danger", "sm")} aria-label={`Remove ${s.name}`} onClick={() => remove(s)}>
                          Remove
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
