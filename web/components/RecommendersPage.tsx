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
  RECOMMENDER_STATUSES,
  sortRecommenders,
  validateRecommender,
  type Recommender,
  type RecommenderInput,
  type RecommenderRole,
  type RecommenderStatus,
} from "@/lib/recommenders";
import { useT } from "@/lib/i18n/client";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const roleLabel = (t: TFunction, r: RecommenderRole) => t(`recommenders.role.${r}` as MessageKey);
const statusLabel = (t: TFunction, s: RecommenderStatus) => t(`recommenders.status.${s}` as MessageKey);

/** Validation messages come from lib/recommenders.ts in English (tests assert them); map them to translations here. */
function errorText(t: TFunction, error: string): string {
  const exact: Record<string, MessageKey> = {
    "Enter the recommender's name.": "recommenders.err.name",
    "Choose teacher, counselor or other.": "recommenders.err.role",
    "Choose a status.": "recommenders.err.status",
    "Enter a valid date asked.": "recommenders.err.dateAsked",
    "Enter a valid due date.": "recommenders.err.dueDate",
    "The due date can't be before the day you asked.": "recommenders.err.dueBefore",
  };
  if (exact[error]) return t(exact[error]);
  if (error === `Keep the name under ${RECOMMENDER_LIMITS.name} characters.`) return t("recommenders.err.nameLong", { n: RECOMMENDER_LIMITS.name });
  if (error === `Keep the note under ${RECOMMENDER_LIMITS.note} characters.`) return t("recommenders.err.noteLong", { n: RECOMMENDER_LIMITS.note });
  return error;
}

const field = "mt-1 block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm";

/** Add / edit form. `initial` is the starting state; onSave gets a validated value. */
function RecommenderForm({ initial, submitLabel, onSave, onCancel }: { initial: RecommenderInput; submitLabel: string; onSave: (v: RecommenderInput) => void; onCancel?: () => void }) {
  const t = useT();
  const [f, setF] = useState<RecommenderInput>(initial);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof RecommenderInput>(k: K, v: RecommenderInput[K]) => setF((cur) => ({ ...cur, [k]: v }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = validateRecommender(f);
    if (!r.ok) return setError(errorText(t, r.error));
    setError(null);
    onSave(r.value);
    if (!onCancel) setF(emptyRecommender());
  }

  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">
        {t("recommenders.name")}
        <input className={field} value={f.name} maxLength={RECOMMENDER_LIMITS.name} onChange={(e) => set("name", e.target.value)} placeholder={t("recommenders.namePlaceholder")} />
      </label>
      <label className="text-sm font-medium">
        {t("recommenders.role")}
        <select className={field} value={f.role} onChange={(e) => set("role", e.target.value as RecommenderRole)}>
          {RECOMMENDER_ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(t, r)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium sm:col-span-2">
        {t("recommenders.noteLabel")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input className={field} value={f.note} maxLength={RECOMMENDER_LIMITS.note} onChange={(e) => set("note", e.target.value)} placeholder={t("recommenders.notePlaceholder")} />
      </label>
      <label className="text-sm font-medium">
        {t("recommenders.dateAsked")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input type="date" className={field} value={f.requestedOn ?? ""} onChange={(e) => set("requestedOn", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium">
        {t("recommenders.due")} <span className="font-normal text-zinc-500">({t("common.optional")})</span>
        <input type="date" className={field} value={f.dueOn ?? ""} onChange={(e) => set("dueOn", e.target.value || null)} />
      </label>
      <label className="text-sm font-medium">
        {t("recommenders.status")}
        <select className={field} value={f.status} onChange={(e) => set("status", e.target.value as RecommenderStatus)}>
          {RECOMMENDER_STATUSES.map((s) => (
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

/** Student's recommender tracker. Private: teachers never see it. */
export function RecommendersPage() {
  const t = useT();
  const { recommenders, ready, error, addRecommender, updateRecommender, removeRecommender, clearError } = useStudent();
  const [editing, setEditing] = useState<string | null>(null);
  const today = new Date();
  const sorted = sortRecommenders(recommenders);
  const waiting = recommenders.filter((r) => !isRecommenderClosed(r.status)).length;

  function remove(r: Recommender) {
    if (!confirm(t("recommenders.removeConfirm", { name: r.name }))) return;
    removeRecommender(r.id);
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">{t("recommenders.intro")}</p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("recommenders.dismiss")}
          </button>
        </p>
      )}

      <section aria-labelledby="rec-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
        <h2 id="rec-add" className="font-display text-lg font-bold">
          {t("recommenders.addTitle")}
        </h2>
        <RecommenderForm initial={emptyRecommender()} submitLabel={t("recommenders.addButton")} onSave={addRecommender} />
      </section>

      <section aria-labelledby="rec-list" className="space-y-3">
        <h2 id="rec-list" className="font-display text-lg font-bold">
          {t("recommenders.listTitle")} {recommenders.length > 0 && <span className="text-sm font-normal text-zinc-500">{t("recommenders.waiting", { n: waiting })}</span>}
        </h2>
        {!ready ? (
          <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
        ) : sorted.length === 0 ? (
          <p className="text-sm text-zinc-500">{t("recommenders.empty")}</p>
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
                      submitLabel={t("common.save")}
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
                            {r.name} <span className="text-sm font-normal text-zinc-500">· {roleLabel(t, r.role)}</span>
                          </p>
                          {r.note && <p className="text-sm text-zinc-600">{r.note}</p>}
                          {r.requestedOn && <p className="text-xs text-zinc-500">{t("recommenders.asked", { date: new Date(`${r.requestedOn}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) })}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill tone={recommenderTone(r, today)}>{statusLabel(t, r.status)}</StatusPill>
                          {r.dueOn && days != null && <DeadlineChip date={r.dueOn} days={days} done={closed} doneLabel={t("recommenders.received")} label={t("recommenders.due")} />}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-sm">
                          <span className="sr-only">{t("recommenders.statusFor", { name: r.name })}</span>
                          <select
                            aria-label={t("recommenders.statusFor", { name: r.name })}
                            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
                            value={r.status}
                            onChange={(e) => updateRecommender(r.id, { status: e.target.value as RecommenderStatus })}
                          >
                            {RECOMMENDER_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {statusLabel(t, s)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button type="button" className={buttonClass("secondary", "sm")} aria-label={t("recommenders.editFor", { name: r.name })} onClick={() => setEditing(r.id)}>
                          {t("common.edit")}
                        </button>
                        <button type="button" className={buttonClass("danger", "sm")} aria-label={t("recommenders.removeFor", { name: r.name })} onClick={() => remove(r)}>
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
