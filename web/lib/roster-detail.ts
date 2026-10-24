// Helpers for the teacher's student-detail page: the detail payload reshaped into the roster's row type (so the
// same attention flags apply), and small display helpers for scores and names.

import type { DetailCollege, RosterStudent, StudentDetail } from "./roster.ts";
import type { ScoreScale, SectionScores } from "./scores.ts";

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

/** "computer_science" -> "Computer science". */
export function humanize(key: string): string {
  const s = key.replace(/_/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
