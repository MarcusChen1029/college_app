// The student's own scholarship tracker: scholarships they found themselves, with deadline and status.
// We ship no scholarship database (never invent data); the student types in what they apply to.
// Private to the student: no teacher RPC, roster or AI tool reads it. The limits and enums mirror the
// check constraints in supabase/migrations/0027_scholarships.sql, so keep the two in step.

import { daysUntil } from "./format.ts";
import { isIsoDate } from "./recommenders.ts";
import { deadlineTone, type Tone } from "./status.ts";

export const SCHOLARSHIP_STATUSES = ["considering", "applying", "submitted", "awarded", "declined"] as const;
export type ScholarshipStatus = (typeof SCHOLARSHIP_STATUSES)[number];
export const SCHOLARSHIP_STATUS_LABEL: Record<ScholarshipStatus, string> = {
  considering: "Considering",
  applying: "Applying",
  submitted: "Submitted",
  awarded: "Awarded",
  declined: "Declined",
};

export const SCHOLARSHIP_LIMITS = { name: 200, provider: 200, url: 2000, notes: 2000, amount: 10_000_000 } as const;

/** Same pattern as the table's check: http(s) scheme, no whitespace. */
export const SCHOLARSHIP_URL_RE = /^https?:\/\/\S+$/i;

export type Scholarship = {
  id: string;
  name: string;
  /** Who offers it. Empty when none. */
  provider: string;
  /** Whole US dollars, or null when unknown. */
  amountUsd: number | null;
  /** yyyy-mm-dd, or null. */
  deadline: string | null;
  /** http(s) link, empty when none. */
  url: string;
  status: ScholarshipStatus;
  notes: string;
  createdAt: string;
};

export type ScholarshipInput = Pick<Scholarship, "name" | "provider" | "amountUsd" | "deadline" | "url" | "status" | "notes">;

export const newScholarshipId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export const emptyScholarship = (): ScholarshipInput => ({ name: "", provider: "", amountUsd: null, deadline: null, url: "", status: "considering", notes: "" });

/** Still to apply for: the deadline matters (and reminder emails cover it). */
export const isScholarshipOpen = (s: ScholarshipStatus): boolean => s === "considering" || s === "applying";

const oneOf = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** Accepts a number or the text of a number input ("", "1,500" and "$1500" are fine). undefined = invalid. */
function parseAmount(v: unknown): number | null | undefined {
  if (v == null || v === "") return null;
  const s = typeof v === "string" ? v.replace(/[$,\s]/g, "") : null;
  const n = typeof v === "number" ? v : s ? Number(s) : NaN;
  if (!Number.isInteger(n) || n < 0 || n > SCHOLARSHIP_LIMITS.amount) return undefined;
  return n;
}

/** Trims and checks a form. Mirrors the table's check constraints. */
export function validateScholarship(i: Partial<Record<keyof ScholarshipInput, unknown>>): { ok: true; value: ScholarshipInput } | { ok: false; error: string } {
  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const name = text(i.name);
  if (!name) return { ok: false, error: "Enter the scholarship's name." };
  if (name.length > SCHOLARSHIP_LIMITS.name) return { ok: false, error: `Keep the name under ${SCHOLARSHIP_LIMITS.name} characters.` };
  const provider = text(i.provider);
  if (provider.length > SCHOLARSHIP_LIMITS.provider) return { ok: false, error: `Keep the provider under ${SCHOLARSHIP_LIMITS.provider} characters.` };
  const amountUsd = parseAmount(i.amountUsd);
  if (amountUsd === undefined) return { ok: false, error: `Enter the amount as a whole number of dollars (0 to ${SCHOLARSHIP_LIMITS.amount.toLocaleString("en-US")}).` };
  const deadline = i.deadline == null || i.deadline === "" ? null : isIsoDate(i.deadline) ? i.deadline : undefined;
  if (deadline === undefined) return { ok: false, error: "Enter a valid deadline." };
  const url = text(i.url);
  if (url && (url.length > SCHOLARSHIP_LIMITS.url || !SCHOLARSHIP_URL_RE.test(url))) return { ok: false, error: "Enter a link starting with http:// or https://." };
  if (!oneOf(SCHOLARSHIP_STATUSES, i.status)) return { ok: false, error: "Choose a status." };
  const notes = text(i.notes);
  if (notes.length > SCHOLARSHIP_LIMITS.notes) return { ok: false, error: `Keep the notes under ${SCHOLARSHIP_LIMITS.notes} characters.` };
  return { ok: true, value: { name, provider, amountUsd, deadline, url, status: i.status, notes } };
}

/** Days until the deadline, or null when there is none. Negative = passed. */
export const scholarshipDays = (s: Pick<Scholarship, "deadline">, today: Date): number | null => (s.deadline ? daysUntil(s.deadline, today) : null);

/** Pill colour: while still open, urgent (a week or less, or passed) / soon (three weeks) by deadline, else by progress; once finished, by outcome. */
export function scholarshipTone(s: Pick<Scholarship, "status" | "deadline">, today: Date): Tone {
  if (s.status === "declined") return "neutral";
  if (!isScholarshipOpen(s.status)) return "done";
  const days = scholarshipDays(s, today);
  if (days != null) {
    const t = deadlineTone(days, false);
    if (t === "urgent" || t === "soon") return t;
  }
  return s.status === "considering" ? "neutral" : "progress";
}

const STATUS_ORDER: Record<ScholarshipStatus, number> = { applying: 0, considering: 1, submitted: 2, awarded: 3, declined: 4 };

/** Open ones first (earliest deadline first, no date last), then finished ones grouped by status; ties by status then name. */
export function sortScholarships<T extends Pick<Scholarship, "name" | "status" | "deadline" | "createdAt">>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const closed = Number(!isScholarshipOpen(a.status)) - Number(!isScholarshipOpen(b.status));
    if (closed) return closed;
    if (!isScholarshipOpen(a.status) && a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (a.deadline !== b.deadline) return a.deadline === null ? 1 : b.deadline === null ? -1 : a.deadline < b.deadline ? -1 : 1;
    return STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.name.localeCompare(b.name) || a.createdAt.localeCompare(b.createdAt);
  });
}

/** Sum of awarded amounts (unknown amounts count as 0). */
export const awardedTotal = (items: readonly Pick<Scholarship, "status" | "amountUsd">[]): number =>
  items.reduce((n, s) => n + (s.status === "awarded" ? (s.amountUsd ?? 0) : 0), 0);
