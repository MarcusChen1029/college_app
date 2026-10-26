// The student's own list of recommenders (who they asked for a letter, when, and whether it arrived).
// Private to the student: no teacher RPC, roster or AI tool reads it. The limits and enums mirror the
// check constraints in supabase/migrations/0026_recommenders.sql, so keep the two in step.

import { daysUntil } from "./format.ts";
import { deadlineTone, type Tone } from "./status.ts";

export const RECOMMENDER_ROLES = ["teacher", "counselor", "other"] as const;
export type RecommenderRole = (typeof RECOMMENDER_ROLES)[number];
export const ROLE_LABEL: Record<RecommenderRole, string> = { teacher: "Teacher", counselor: "Counselor", other: "Other" };

export const RECOMMENDER_STATUSES = ["to_ask", "asked", "in_progress", "submitted", "thanked"] as const;
export type RecommenderStatus = (typeof RECOMMENDER_STATUSES)[number];
export const RECOMMENDER_STATUS_LABEL: Record<RecommenderStatus, string> = {
  to_ask: "To ask",
  asked: "Asked",
  in_progress: "Writing it",
  submitted: "Submitted",
  thanked: "Thanked",
};

export const RECOMMENDER_LIMITS = { name: 120, note: 500 } as const;

export type Recommender = {
  id: string;
  name: string;
  role: RecommenderRole;
  /** Subject taught, or any note ("AP Chem, 11th grade"). Empty when none. */
  note: string;
  /** yyyy-mm-dd, or null. */
  requestedOn: string | null;
  dueOn: string | null;
  status: RecommenderStatus;
  createdAt: string;
};

export type RecommenderInput = Pick<Recommender, "name" | "role" | "note" | "requestedOn" | "dueOn" | "status">;

export const newRecommenderId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const emptyRecommender = (): RecommenderInput => ({ name: "", role: "teacher", note: "", requestedOn: null, dueOn: null, status: "to_ask" });

/** Submitted and thanked are finished: the letter is in. */
export const isRecommenderClosed = (s: RecommenderStatus): boolean => s === "submitted" || s === "thanked";

/** A real calendar date written yyyy-mm-dd (the date input's value). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Trims and checks a form. Mirrors the table's check constraints. */
export function validateRecommender(i: Partial<Record<keyof RecommenderInput, unknown>>): { ok: true; value: RecommenderInput } | { ok: false; error: string } {
  const name = typeof i.name === "string" ? i.name.trim() : "";
  if (!name) return { ok: false, error: "Enter the recommender's name." };
  if (name.length > RECOMMENDER_LIMITS.name) return { ok: false, error: `Keep the name under ${RECOMMENDER_LIMITS.name} characters.` };
  if (!oneOf(RECOMMENDER_ROLES, i.role)) return { ok: false, error: "Choose teacher, counselor or other." };
  if (!oneOf(RECOMMENDER_STATUSES, i.status)) return { ok: false, error: "Choose a status." };
  const note = typeof i.note === "string" ? i.note.trim() : "";
  if (note.length > RECOMMENDER_LIMITS.note) return { ok: false, error: `Keep the note under ${RECOMMENDER_LIMITS.note} characters.` };
  const date = (v: unknown): string | null | undefined => (v == null || v === "" ? null : isIsoDate(v) ? v : undefined);
  const requestedOn = date(i.requestedOn);
  const dueOn = date(i.dueOn);
  if (requestedOn === undefined) return { ok: false, error: "Enter a valid date asked." };
  if (dueOn === undefined) return { ok: false, error: "Enter a valid due date." };
  if (requestedOn && dueOn && dueOn < requestedOn) return { ok: false, error: "The due date can't be before the day you asked." };
  return { ok: true, value: { name, role: i.role, note, requestedOn, dueOn, status: i.status } };
}

/** Days until the letter is due, or null when there is no due date. Negative = overdue. */
export const recommenderDays = (r: Pick<Recommender, "dueOn">, today: Date): number | null => (r.dueOn ? daysUntil(r.dueOn, today) : null);

/** Pill colour: done once submitted; urgent (a week or less, or overdue) while it is still outstanding; otherwise by progress. */
export function recommenderTone(r: Pick<Recommender, "status" | "dueOn">, today: Date): Tone {
  const closed = isRecommenderClosed(r.status);
  const days = recommenderDays(r, today);
  if (days != null) {
    const t = deadlineTone(days, closed);
    if (t === "done" || t === "urgent" || t === "soon") return t;
  }
  if (closed) return "done";
  return r.status === "to_ask" ? "neutral" : "progress";
}

const STATUS_ORDER: Record<RecommenderStatus, number> = { to_ask: 0, asked: 1, in_progress: 2, submitted: 3, thanked: 4 };

/** Outstanding letters first (earliest due date first, no date last), finished ones after; ties by status then name. */
export function sortRecommenders<T extends Pick<Recommender, "name" | "status" | "dueOn" | "createdAt">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const closed = Number(isRecommenderClosed(a.status)) - Number(isRecommenderClosed(b.status));
    if (closed) return closed;
    if (a.dueOn !== b.dueOn) return a.dueOn === null ? 1 : b.dueOn === null ? -1 : a.dueOn < b.dueOn ? -1 : 1;
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt);
  });
}
