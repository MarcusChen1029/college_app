"use client";

import { useState } from "react";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import {
  emptyRecommender,
  isRecommenderClosed,
  recommenderDays,
  recommenderTone,
  RECOMMENDER_LIMITS,
  RECOMMENDER_ROLES,
  RECOMMENDER_STATUS_LABEL,
  RECOMMENDER_STATUSES,
  ROLE_LABEL,
  sortRecommenders,
  validateRecommender,
  type Recommender,
  type RecommenderInput,
  type RecommenderRole,
  type RecommenderStatus,
} from "@/lib/recommenders";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";

/** Add / edit form. `initial` is the starting state; onSave gets a validated value. */
function RecommenderForm({ initial, submitLabel, onSave, onCancel }: { initial: RecommenderInput; submitLabel: string; onSave: (v: RecommenderInput) => void; onCancel?: () => void }) {
  const [f, setF] = useState<RecommenderInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RecommenderInput>(k: K, v: RecommenderInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateRecommender(f);
    if (!r.ok) return setError(r.error);
    setError(null);
    onSave(r.value);
    if (!onCancel) setF(emptyRecommender());
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        Name
        <input className={field} value={f.name} maxLength={RECOMMENDER_LIMITS.name} onChange={(e) => set("name", e.target.value)} placeholder="Ms. Rivera" />
      </label>
      <label className="text-sm font-medium">
        Role
        <select className={field} value={f.role} onChange={(e) => set("role", e.target.value as RecommenderRole)}>
          {RECOMMENDER_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABEL[r]}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        Subject or note <span className="font-normal text-zinc-500">(optional)</span>
        <input className={field} value={f.note} maxLength={RECOMMENDER_LIMITS.note} onChange={(e) => set("note", e.target.value)} placeholder="AP Chemistry, 11th grade" />
      </label>
      <label className="text-sm font-medium">
        Date asked <span className="font-normal text-zinc-500">(optional)</span>
        <input type="date" className={field} value={f.requestedOn ?? ""} onChange={(e) => set("requestedOn", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium">
        Due <span className="font-normal text-zinc-500">(optional)</span>
        <input type="date" className={field} value={f.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium">
        Status
        <select className={field} value={f.status} onChange={(e) => set("status", e.target.value as RecommenderStatus)}>
          {RECOMMENDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {RECOMMENDER_STATUS_LABEL[s]}
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

/** Student's recommender tracker. Private: teachers never see it. */
export function RecommendersPage() {
  const { recommenders, ready, error, addRecommender, updateRecommender, removeRecommender, clearError } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date();
  const sorted = sortRecommenders(recommenders);
  const waiting = recommenders.filter((r) => !isRecommenderClosed(r.status)).length;

  function remove(r: Recommender) {
    if (!confirm(`Remove ${r.name} from your recommenders?`)) return;
    removeRecommender(r.id);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Keep track of who you asked for a letter, when, and whether it has been sent. This list is private to you; teachers and counselors you link to cannot see it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}

      <section aria-labelledby="rec-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="rec-add" className="font-display text-lg font-bold">
          Add a recommender
        </h2>
        <RecommenderForm initial={emptyRecommender()} submitLabel="Add recommender" onSave={addRecommender} />
      </section>

      <section aria-labelledby="rec-list" className="space-y-3">
        <h2 id="rec-list" className="font-display text-lg font-bold">
          Your recommenders {recommenders.length > 0 && <span className="text-sm font-normal text-zinc-500">({waiting} waiting)</span>}
        </h2>
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-zinc-500">No recommenders yet. Add the teachers and counselor you plan to ask.</p>
        ) : (
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {sorted.map((r) => {
              const closed = isRecommenderClosed(r.status);
              const days = recommenderDays(r, today);
              return (
                <li key={r.id} className="space-y-2 p-4">
                  {editing === r.id ? (
                    <RecommenderForm
                      initial={{ name: r.name, role: r.role, note: r.note, requestedOn: r.requestedOn, dueOn: r.dueOn, status: r.status }}
                      submitLabel="Save"
                      onSave={(v) => {
                        updateRecommender(r.id, v);
                        setEditing(null);
                      }}
                      onCancel={() => setEditing(null)}
                    />
                  ) : (
                    <>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="font-medium">
                            {r.name} <span className="text-sm font-normal text-zinc-500">· {ROLE_LABEL[r.role]}</span>
                          </p>
                          {r.note && <p className="text-sm text-zinc-600">{r.note}</p>}
                          {r.requestedOn && <p className="text-xs text-zinc-500">Asked {new Date(`${r.requestedOn}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={recommenderTone(r, today)}>{RECOMMENDER_STATUS_LABEL[r.status]}</StatusPill>
                          {r.dueOn && days != null && <DeadlineChip date={r.dueOn} days={days} done={closed} doneLabel="Received" label="Due" />}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm">
                          <span className="sr-only">Status for {r.name}</span>
                          <select
                            aria-label={`Status for ${r.name}`}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                            value={r.status}
                            onChange={(e) => updateRecommender(r.id, { status: e.target.value as RecommenderStatus })}
                          >
                            {RECOMMENDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {RECOMMENDER_STATUS_LABEL[s]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className={buttonClass("secondary", "sm")} aria-label={`Edit ${r.name}`} onClick={() => setEditing(r.id)}>
                          Edit
                        </button>
                        <button type="button" className={buttonClass("danger", "sm")} aria-label={`Remove ${r.name}`} onClick={() => remove(r)}>
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
