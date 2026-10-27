// Rough super reach / reach / target / safety label from a student's scores and a college's CDS profile.
// Deliberately simple and transparent — the UI shows the reasoning next to the label.

export type Fit = "super_reach" | "reach" | "target" | "safety";

export const FIT_LABEL: Record<Fit, string> = { super_reach: "Super reach", reach: "Reach", target: "Target", safety: "Safety" };

import type { ActivityData } from "./activities";
import type { FieldKey } from "./fields";
import type { PersonalEssays } from "./personal-essays";
import type { PlanKey } from "./plans";
import type { PortalData } from "./portals";
import type { ResumeSettings } from "./resume";
import type { TestDetails } from "./scores";
import { scoredTests } from "./test-plan.ts";

export type StudentProfile = {
  sat?: number | null;
  act?: number | null;
  gpa?: number | null; // unweighted, 4.0 scale
  gpaWeighted?: number | null; // as printed on the transcript (the school's own scale, up to 6.0); never compared with colleges
  international?: boolean;
  targetRegions?: string[]; // countries applying to (US, GB); first = default on the colleges page
  studyFields?: FieldKey[]; // up to 2 study directions (lib/fields.ts); empty = undecided
  reminderEmails?: boolean; // account setting; defaults to on
  plan?: PlanKey; // defaults to free
  tests?: TestDetails; // section scores + English tests
  interested?: string[]; // college slugs being considered but not on the list
  activities?: Partial<ActivityData>; // Common App + UC activity lists
  resume?: ResumeSettings; // resume generator header + options
  portals?: PortalData; // shared system, campus and custom portal logins
  essays?: PersonalEssays; // Common App personal statement + UC personal insight questions
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

/** The pieces `reason` is built from, so the UI can word them in another language (lib/i18n/fit-text.ts). */
export type FitReasonParts = {
  rate: string; // already formatted, e.g. "12.3"
  intl: boolean;
  score: { test: "SAT" | "ACT"; band: "above" | "within" | "below" } | null;
  note: "longShot" | "reachAll" | "noScore" | null;
};

export type FitResult = { fit: Fit; reason: string; parts: FitReasonParts };

type Band = "above" | "within" | "below" | "unknown";

function band(score: number | null | undefined, p25: number | null, p75: number | null): Band {
  if (score == null || p25 == null || p75 == null) return "unknown";
  if (score >= p75) return "above";
  if (score >= p25) return "within";
  return "below";
}

/** The only GPA anything may compare with a college's published GPA: the unweighted one. Colleges report unweighted
 * averages and weighted scales differ from school to school, so a weighted GPA never stands in for it. */
export function comparableGpa(student: StudentProfile | null | undefined): number | null {
  return student?.gpa ?? null;
}

export function computeFit(student: StudentProfile, college: FitInput): FitResult | null {
  const rate = student.international && college.intl_admit_rate != null ? college.intl_admit_rate : college.admit_rate;
  if (rate == null) return null;
  const intl = !!student.international && college.intl_admit_rate != null;
  const rateText = Number(rate).toFixed(1);
  const rateLabel = `${intl ? "international " : ""}admit rate ${rateText}%`;

  // Test-blind schools ignore scores entirely.
  let scoreBand: Band = "unknown";
  let scoreLabel = "";
  let score: FitReasonParts["score"] = null;
  if (college.test_policy !== "blind") {
    // Only the tests the student chose to use (lib/test-plan.ts); a score they switched away from stays saved but is ignored.
    const used = scoredTests(student);
    const sat = band(used.includes("sat") ? student.sat : null, college.sat_p25, college.sat_p75);
    const act = band(used.includes("act") ? student.act : null, college.act_p25, college.act_p75);
    // Use whichever test puts the student in the better position.
    const order: Band[] = ["above", "within", "below", "unknown"];
    scoreBand = order.indexOf(sat) <= order.indexOf(act) ? sat : act;
    const which = scoreBand === sat ? "SAT" : "ACT";
    if (scoreBand !== "unknown") {
      scoreLabel = { above: `${which} at/above the 75th percentile`, within: `${which} in the middle 50%`, below: `${which} below the 25th percentile` }[scoreBand];
      score = { test: which, band: scoreBand };
    }
  }

  const NOTE = { longShot: "under 10% is a long shot for everyone", reachAll: "under 15% is a reach for everyone", noScore: "no comparable score" };
  const result = (fit: Fit, note: FitReasonParts["note"] = null): FitResult => ({
    fit,
    reason: [rateLabel, scoreLabel, note ? NOTE[note] : ""].filter(Boolean).join("; "),
    parts: { rate: rateText, intl, score, note },
  });
  const noScore = scoreBand === "unknown" ? "noScore" : null;

  if (rate < 10) return result("super_reach", "longShot");
  if (rate < 15) {
    if (scoreBand === "below") return result("super_reach");
    return result("reach", "reachAll");
  }
  if (rate < 30) {
    if (scoreBand === "above") return result("target");
    if (scoreBand === "below") return result("super_reach");
    return result("reach", noScore);
  }
  if (rate < 60) {
    if (scoreBand === "above") return result("safety");
    if (scoreBand === "below") return result("reach");
    return result("target", noScore);
  }
  if (scoreBand === "below") return result("target");
  return result("safety");
}
