// Helpers for the teacher's student-detail page: the detail payload reshaped into the roster's row type (so the
// same attention flags apply), and small display helpers for scores and names.

import { isSubmitted } from "./application.ts";
import { progress } from "./checklist.ts";
import { daysUntil, isActiveCollege, type DetailCollege, type RosterStudent, type StudentDetail } from "./roster.ts";
import type { Status } from "./student-rows.ts";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS, type EnglishTestKey, type ScoreScale, type SectionScores, type TestDetails } from "./scores.ts";

const APPLICATION_KINDS = new Set(["application", "priority"]);

/** Newest of the profile and college update times (ISO strings), or null when there are none. */
function latest(times: (string | null)[]): string | null {
  let best: string | null = null;
  for (const t of times) if (t && !Number.isNaN(Date.parse(t)) && (!best || Date.parse(t) > Date.parse(best))) best = t;
  return best;
}

/** Detail deadlines are already limited to ones still ahead; the roster only counts application/priority ones. */
function nextApplicationDeadline(c: DetailCollege): string | null {
  const dates = c.deadlines.filter((d) => APPLICATION_KINDS.has(d.kind)).map((d) => d.dueDate);
  return dates.length ? dates.sort()[0] : null;
}

export function detailToRoster(d: StudentDetail): RosterStudent {
  return {
    studentId: d.studentId,
    displayName: d.displayName,
    email: d.email,
    linkedAt: d.linkedAt,
    classIds: d.classes.map((c) => c.id),
    satTotal: d.profile.satTotal,
    actComposite: d.profile.actComposite,
    gpaUnweighted: d.profile.gpaUnweighted,
    isInternational: d.profile.isInternational,
    lastActive: latest([d.profile.updatedAt, ...d.colleges.map((c) => c.updatedAt)]),
    colleges: d.colleges.map((c) => ({
      slug: c.slug,
      name: c.name,
      status: c.status,
      plan: c.plan,
      checklist: c.checklist,
      nextDeadline: nextApplicationDeadline(c),
    })),
  };
}

export type CollegeSummary = {
  total: number;
  /** Still being worked on (researching, planning, in progress). */
  active: number;
  /** Sent, or with a decision. */
  submitted: number;
  /** The soonest application deadline still ahead on a college being worked on, and that college's open checklist. */
  next: { date: string; days: number; college: string; open: number; items: number } | null;
};

/**
 * The Overview's one-line college progress, from the detail payload alone (teacher_student already returns each
 * college's status, checklist and upcoming deadlines): no other call and no field the RPC leaves out.
 */
export function collegeSummary(d: StudentDetail, now: Date): CollegeSummary {
  const roster = detailToRoster(d);
  const active = roster.colleges.filter(isActiveCollege);
  let next: CollegeSummary["next"] = null;
  for (const c of active) {
    if (!c.nextDeadline) continue;
    const days = daysUntil(c.nextDeadline, now);
    if (days < 0 || (next && days >= next.days)) continue;
    const p = progress(c.checklist);
    next = { date: c.nextDeadline, days, college: c.name, open: p.missing, items: p.total };
  }
  return { total: d.colleges.length, active: active.length, submitted: d.colleges.filter((c) => isSubmitted(c.status as Status)).length, next };
}

/** "johns-hopkins" -> "Johns Hopkins"; custom colleges have no readable slug. */
export function slugToTitle(slug: string): string {
  if (slug.startsWith("custom-")) return "Custom college";
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/** Names for the "interested" slugs: the listed college's name when it is also on the list, else a title from the slug. */
export function interestedNames(d: StudentDetail): { slug: string; name: string }[] {
  const listed = new Map(d.colleges.map((c) => [c.slug, c.name]));
  return d.profile.interested.map((slug) => ({ slug, name: listed.get(slug) ?? slugToTitle(slug) }));
}

/** Filled-in sections of a test in the scale's order, e.g. [{label: "Math", value: 760}]. */
export function sectionScores(scale: ScoreScale, sections: SectionScores | undefined): { label: string; value: number }[] {
  return scale.sections.flatMap((s) => {
    const value = sections?.[s.key];
    return value == null ? [] : [{ label: s.label, value }];
  });
}

export type EnglishTestView = { key: string; label: string; total: number | null; parts: { label: string; value: number }[] };

/**
 * Every English test the student entered, in the profile's test order. Scores live in test_details.english;
 * the old single-test columns (english_test_key / english_score) are only a fallback for rows saved before that.
 */
export function englishTests(details: TestDetails, legacy: { key: string | null; score: number | null }): EnglishTestView[] {
  const entered = ENGLISH_TEST_KEYS.flatMap((key) => {
    const s = details.english?.[key];
    const parts = sectionScores(ENGLISH_TESTS[key], s?.sections);
    const total = s?.total ?? null;
    return total == null && parts.length === 0 ? [] : [{ key, label: ENGLISH_TESTS[key].label, total, parts }];
  });
  if (entered.length > 0 || (legacy.key == null && legacy.score == null)) return entered;
  const label = legacy.key && legacy.key in ENGLISH_TESTS ? ENGLISH_TESTS[legacy.key as EnglishTestKey].label : (legacy.key ?? "Test not chosen");
  return [{ key: legacy.key ?? "unknown", label, total: legacy.score, parts: [] }];
}

/** "computer_science" -> "Computer science". */
export function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
