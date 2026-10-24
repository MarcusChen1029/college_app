import type { Stage, RESULT_OPTIONS } from "./application.ts";
import type { Essay } from "./checklist.ts";
import type { FlagKey } from "./roster.ts";

export type Tone = "urgent" | "soon" | "done" | "progress" | "neutral";

export const URGENT_DAYS = 7;
export const SOON_DAYS_CHIP = 21;

/** Done always wins; overdue and the last week are urgent. */
export function deadlineTone(days: number, done: boolean): Tone {
  if (done) return "done";
  if (days <= URGENT_DAYS) return "urgent";
  if (days <= SOON_DAYS_CHIP) return "soon";
  return "neutral";
}

/** Callers label the done case themselves. */
export function deadlineText(days: number): string {
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `${days} days`;
}

const STAGE: Record<Stage, Tone> = { in_progress: "progress", ready: "done", submitted: "done" };
export const stageTone = (s: Stage): Tone => STAGE[s];

const RESULT: Record<(typeof RESULT_OPTIONS)[number], Tone> = {
  submitted: "progress",
  admitted: "done",
  enrolled: "done",
  deferred: "soon",
  waitlisted: "soon",
  rejected: "neutral",
  withdrawn: "neutral",
};
export const resultTone = (r: (typeof RESULT_OPTIONS)[number]): Tone => RESULT[r];

const ESSAY: Record<Essay["status"], Tone> = {
  not_started: "neutral",
  brainstorming: "progress",
  drafting: "progress",
  revising: "progress",
  final: "done",
};
export const essayTone = (s: Essay["status"]): Tone => ESSAY[s];

const FLAG: Record<FlagKey, Tone> = {
  deadline_soon: "urgent",
  essay_not_started: "soon",
  no_scores: "soon",
  no_colleges: "soon",
  inactive: "neutral",
};
export const flagTone = (k: FlagKey): Tone => FLAG[k];

const PILL: Record<"zinc" | "blue" | "green" | "red", Tone> = { zinc: "neutral", blue: "progress", green: "done", red: "urgent" };
export const pillTone = (t: "zinc" | "blue" | "green" | "red"): Tone => PILL[t];
