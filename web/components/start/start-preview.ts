// The start page's live preview: how the student's answers sort the US colleges into fit bands, and a starter
// list of one college per band. Pure, so the wizard can recompute it on every keystroke.
import { computeFit, type Fit, type FitInput, type FitResult, type StudentProfile } from "@/lib/fit";

/** One US college as the preview needs it (app/(app)/start/page.tsx builds these from the college summaries). */
export type StartCollege = FitInput & {
  id: string;
  slug: string;
  name: string;
  place: string;
  applicants: number | null;
  /** The next application deadline from today, or null when none is published. */
  next: { date: string; plan: string } | null;
};

export const FITS: readonly Fit[] = ["super_reach", "reach", "target", "safety"];

/** The starter list: one college per band. The reach slot takes a super reach only when no college is a plain reach. */
export const SLOTS = ["reach", "target", "safety"] as const;
export type Slot = (typeof SLOTS)[number];

/** `result` is computeFit's answer, which the app's FitBadge words as its reasons. */
export type Candidate = { college: StartCollege; fit: Fit; rate: number; result: FitResult };

export type Preview = {
  counts: Record<Fit, number>;
  /** Colleges that got a label (a college with no published admit rate gets none). */
  labelled: number;
  /** Per slot, the colleges that could fill it, most-applied-to first. */
  slots: Record<Slot, Candidate[]>;
};

const byApplicants = (a: Candidate, b: Candidate) => (b.college.applicants ?? -1) - (a.college.applicants ?? -1) || a.college.name.localeCompare(b.college.name, "en");

export function buildPreview(pool: readonly StartCollege[], student: StudentProfile): Preview {
  const counts: Record<Fit, number> = { super_reach: 0, reach: 0, target: 0, safety: 0 };
  const bands: Record<Fit, Candidate[]> = { super_reach: [], reach: [], target: [], safety: [] };
  for (const college of pool) {
    const result = computeFit(student, college);
    if (!result) continue;
    const rate = Number(student.international && college.intl_admit_rate != null ? college.intl_admit_rate : college.admit_rate);
    counts[result.fit]++;
    bands[result.fit].push({ college, fit: result.fit, rate, result });
  }
  for (const f of FITS) bands[f].sort(byApplicants);
  return {
    counts,
    labelled: FITS.reduce((n, f) => n + counts[f], 0),
    slots: { reach: bands.reach.length ? bands.reach : bands.super_reach, target: bands.target, safety: bands.safety },
  };
}

export type Pick = Candidate & { slot: Slot; /** how many colleges could fill this slot */ choices: number };

/** The college shown in each slot: the `turn`-th candidate (the student presses "Another" to move on), wrapping round. */
export function pickFor(preview: Preview, turns: Record<Slot, number>): Pick[] {
  return SLOTS.flatMap((slot) => {
    const list = preview.slots[slot];
    return list.length ? [{ ...list[turns[slot] % list.length], slot, choices: list.length }] : [];
  });
}
