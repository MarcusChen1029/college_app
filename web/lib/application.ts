// Where each listed college stands: still working on it, ready (every checklist item done),
// submitted, or a decision. My list handles the first three; Results records decisions.

import { progress, type Checklist } from "./checklist.ts";
import type { Status } from "./student-store";

/** Decisions a student can record on Results; "submitted" means still waiting. */
export const RESULT_OPTIONS = ["submitted", "admitted", "deferred", "waitlisted", "rejected", "enrolled", "withdrawn"] as const satisfies readonly Status[];
export const RESULT_LABEL: Record<(typeof RESULT_OPTIONS)[number], string> = {
  submitted: "Waiting for decision",
  admitted: "Admitted",
  deferred: "Deferred",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  enrolled: "Committed",
  withdrawn: "Withdrawn",
};

const SUBMITTED: readonly Status[] = ["submitted", "interview", ...RESULT_OPTIONS];

export const isSubmitted = (s: Status) => SUBMITTED.includes(s);

/** True once the application is in and a decision (not just "waiting") has been recorded. */
export const hasDecision = (s: Status) => isSubmitted(s) && s !== "submitted" && s !== "interview";

/** A deadline counts as done only for application deadlines (aid, deposits etc. keep showing days left). */
export const isDeadlineDone = (kind: string, status: Status, checklist: Checklist): boolean =>
  kind === "application" && (isSubmitted(status) || progress(checklist).missing === 0);

export type Stage = "in_progress" | "ready" | "submitted";

export function stage(status: Status, checklist: Checklist): Stage {
  if (isSubmitted(status)) return "submitted";
  return progress(checklist).missing === 0 ? "ready" : "in_progress";
}

/** The status Results shows for an entry (older builds stored "interview"). */
export const resultStatus = (s: Status): (typeof RESULT_OPTIONS)[number] => (s === "interview" ? "submitted" : (RESULT_OPTIONS as readonly Status[]).includes(s) ? (s as (typeof RESULT_OPTIONS)[number]) : "submitted");
