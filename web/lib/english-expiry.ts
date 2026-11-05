// English test expiry: a warning (never a block) when the newest English result will have expired before the date it is
// needed. Validity periods and university rules are sourced in ./data/english-test-validity.json; a test or university
// missing from it, or with months null, gives no warning. Never changes isDone.
import validity from "./data/english-test-validity.json" with { type: "json" };
import { isSubmitted } from "./application.ts";
import { countryOf, courseFor } from "./application-steps.ts";
import type { Checklist } from "./checklist.ts";
import { deadlinesForEntry, normalIntake } from "./course-deadlines.ts";
import { deadlineApplies } from "./deadline-rules.ts";
import type { EnglishTestKey, TestDetails } from "./scores.ts";
import type { Status } from "./student-rows.ts";
import { isIsoDate } from "./tasks.ts";
import type { Deadline } from "./types.ts";

type Rule = { months?: number | null; source_url?: string; verified_on?: string };
type UniRule = { measured_at?: string; cambridge_max_months?: number | null; semester_starts?: Record<string, string> | null; verified_on?: string };
export type Validity = { tests: Record<string, Rule>; universities: Record<string, UniRule> };

export const VALIDITY = validity as unknown as {
  tests: Record<string, Required<Pick<Rule, "months" | "source_url" | "verified_on">>>;
  universities: Record<string, Required<Pick<UniRule, "verified_on">> & UniRule>;
};

export type RelevantDate = { date: string; basis: "deadline" | "course_start" };
export type ExpiryWarning = { test: EnglishTestKey; takenOn: string; expiresOn: string; relevant: RelevantDate };

/** My call: the spec's "September 2027" needs a day; the first of the month is the earliest. */
const UK_CA_COURSE_START = "2027-09-01";

/** Days in a month, for clamping. */
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Adds calendar months, clamping to the month end (2024-02-29 + 24 = 2026-02-28). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const nd = Math.min(d, daysIn(ny, nm));
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** The date the English result must still be valid on, or null when there is none. */
export function relevantEnglishDate(
  slug: string,
  status: Status,
  c: Pick<Checklist, "course" | "intake">,
  plan: string | null,
  rows: readonly Deadline[],
  today: string,
  v: Validity = VALIDITY as unknown as Validity,
): RelevantDate | null {
  const rule = Object.hasOwn(v.universities, slug) ? v.universities[slug] : undefined;
  if (rule?.measured_at === "course_start") {
    // The result must still be valid at the start, so this holds until the student is out of the running.
    if (status === "withdrawn" || status === "rejected") return null;
    const country = countryOf(slug);
    if (country === "GB" || country === "CA") return { date: UK_CA_COURSE_START, basis: "course_start" };
    if (country === "AU") {
      const starts = rule.semester_starts;
      const date = starts?.[normalIntake(c.intake) ?? "s1"];
      if (isIsoDate(date)) return { date, basis: "course_start" };
    }
  }
  if (isSubmitted(status)) return null;
  const mine = deadlinesForEntry(
    rows.filter((d) => d.kind === "application"),
    { course: courseFor(slug, c.course), intake: c.intake },
  )
    .filter((d) => deadlineApplies(d, { plan, international: false }))
    .map((d) => d.due_date)
    .filter((d): d is string => isIsoDate(d) && d >= today)
    .sort();
  return mine.length ? { date: mine[0], basis: "deadline" } : null;
}

const familyOf = (k: string) => (k === "toefl_band" ? "toefl" : k);

/** A warning when the result that would be sent expires before `relevant.date`; null when there is nothing to warn about. */
export function englishExpiry(
  english: TestDetails["english"],
  englishPlan: string | null | undefined,
  slug: string,
  relevant: RelevantDate | null,
  v: Validity = VALIDITY as unknown as Validity,
): ExpiryWarning | null {
  if (!english || !relevant || englishPlan === "not_required") return null;
  let best: { test: EnglishTestKey; date: string } | null = null;
  for (const [k, score] of Object.entries(english)) {
    const date = score?.date;
    if (!isIsoDate(date)) continue;
    if (englishPlan && familyOf(k) !== englishPlan) continue;
    if (!best || date > best.date) best = { test: k as EnglishTestKey, date };
  }
  if (!best) return null;
  const family = familyOf(best.test);
  if (!Object.hasOwn(v.tests, family)) return null;
  let months = v.tests[family].months ?? null;
  if (months === null && family === "cambridge") {
    const uni = Object.hasOwn(v.universities, slug) ? v.universities[slug] : undefined;
    months = uni?.cambridge_max_months ?? null;
  }
  if (months === null) return null;
  const expiresOn = addMonths(best.date, months);
  return expiresOn < relevant.date ? { test: best.test, takenOn: best.date, expiresOn, relevant } : null;
}
