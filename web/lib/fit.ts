// Rough super reach / reach / target / safety label from a student's scores and a college's CDS profile.
// Deliberately simple and transparent — the UI shows the reasoning next to the label.

export type Fit = "super_reach" | "reach" | "target" | "safety";

export const FIT_LABEL: Record<Fit, string> = { super_reach: "Super reach", reach: "Reach", target: "Target", safety: "Safety" };

import type { ActivityData } from "./activities";
import type { PlanKey } from "./plans";
import type { TestDetails } from "./scores";

export type StudentProfile = {
  sat?: number | null;
  act?: number | null;
  gpa?: number | null; // unweighted, 4.0 scale
  international?: boolean;
  reminderEmails?: boolean; // account setting; defaults to on
  plan?: PlanKey; // defaults to free
  tests?: TestDetails; // section scores + English tests
  interested?: string[]; // college slugs being considered but not on the list
  activities?: Partial<ActivityData>; // Common App + UC activity lists
};

export type FitInput = {
  admit_rate: number | null;
  intl_admit_rate: number | null;
  sat_p25: number | null;
  sat_p75: number | null;
  act_p25: number | null;
  act_p75: number | null;
  test_policy: string | null;
};

export type FitResult = { fit: Fit; reason: string };

type Band = "above" | "within" | "below" | "unknown";

function band(score: number | null | undefined, p25: number | null, p75: number | null): Band {
  if (score == null || p25 == null || p75 == null) return "unknown";
  if (score >= p75) return "above";
  if (score >= p25) return "within";
  return "below";
}

export function computeFit(student: StudentProfile, college: FitInput): FitResult | null {
  const rate = student.international && college.intl_admit_rate != null ? college.intl_admit_rate : college.admit_rate;
  if (rate == null) return null;
  const rateLabel = `${student.international && college.intl_admit_rate != null ? "international " : ""}admit rate ${Number(rate).toFixed(1)}%`;

  // Test-blind schools ignore scores entirely.
  let scoreBand: Band = "unknown";
  let scoreLabel = "";
  if (college.test_policy !== "blind") {
    const sat = band(student.sat, college.sat_p25, college.sat_p75);
    const act = band(student.act, college.act_p25, college.act_p75);
    // Use whichever test puts the student in the better position.
    const order: Band[] = ["above", "within", "below", "unknown"];
    scoreBand = order.indexOf(sat) <= order.indexOf(act) ? sat : act;
    const which = scoreBand === sat ? "SAT" : "ACT";
    if (scoreBand !== "unknown") {
      scoreLabel = { above: `${which} at/above the 75th percentile`, within: `${which} in the middle 50%`, below: `${which} below the 25th percentile` }[scoreBand];
    }
  }

  const why = (s: string) => [rateLabel, scoreLabel, s].filter(Boolean).join("; ");

  if (rate < 10) return { fit: "super_reach", reason: why("under 10% is a long shot for everyone") };
  if (rate < 15) {
    if (scoreBand === "below") return { fit: "super_reach", reason: why("") };
    return { fit: "reach", reason: why("under 15% is a reach for everyone") };
  }
  if (rate < 30) {
    if (scoreBand === "above") return { fit: "target", reason: why("") };
    if (scoreBand === "below") return { fit: "super_reach", reason: why("") };
    return { fit: "reach", reason: why(scoreBand === "unknown" ? "no comparable score" : "") };
  }
  if (rate < 60) {
    if (scoreBand === "above") return { fit: "safety", reason: why("") };
    if (scoreBand === "below") return { fit: "reach", reason: why("") };
    return { fit: "target", reason: why(scoreBand === "unknown" ? "no comparable score" : "") };
  }
  if (scoreBand === "below") return { fit: "target", reason: why("") };
  return { fit: "safety", reason: why("") };
}
