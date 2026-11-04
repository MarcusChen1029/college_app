// The brief a student hands a teacher or counselor before they write a recommendation: the student's own activities, honors,
// intended subject, colleges and deadlines, plus what they'd like highlighted. Built in the browser, never sent anywhere.
// The text follows the language picked on the card (makeT), not the site language.

import { countryOf, courseFor } from "./application-steps.ts";
import type { CountryCode } from "./checklist.ts";
import { deadlinesForEntry } from "./course-deadlines.ts";
import { deadlineApplies } from "./deadline-rules.ts";
import type { MessageKey, TFunction } from "./i18n/index.ts";
import type { Resume } from "./resume.ts";
import type { ListEntry } from "./student-rows.ts";
import type { Deadline } from "./types.ts";

export type BriefCollege = { name: string; country: CountryCode; course: string | null; deadline: string | null };
export type BriefInput = { studentName: string; fields: string[]; resume: Resume; colleges: BriefCollege[]; highlight: string };
export type BriefSection = { heading: string; lines: string[] };

/** The free-text highlights stay in this browser (localStorage), never in the account. */
export const BRIEF_HIGHLIGHT_KEY = "teacher-brief-highlight-v1";

const join = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(" · ");

/** Soonest deadline first; a college with no date goes last, then by name. */
function byDeadline(a: BriefCollege, b: BriefCollege): number {
  if (a.deadline === b.deadline) return a.name.localeCompare(b.name);
  if (a.deadline === null) return 1;
  if (b.deadline === null) return -1;
  return a.deadline.localeCompare(b.deadline);
}

export function buildTeacherBrief(input: BriefInput, t: TFunction): BriefSection[] {
  const out: BriefSection[] = [];

  const about: string[] = [];
  if (input.studentName.trim()) about.push(t("recommenders.brief.name", { value: input.studentName.trim() }));
  if (input.fields.length) about.push(t("recommenders.brief.subject", { value: input.fields.join(", ") }));
  out.push({ heading: t("recommenders.brief.about"), lines: about });

  // The résumé's own order: honors first, then its other sections. Item text is the student's own words.
  const activities: string[] = [];
  for (const s of input.resume.sections) {
    activities.push(`${t(`recommenders.brief.sec.${s.key}` as MessageKey)}:`);
    for (const i of s.items) {
      const head = join(i.title, i.organization);
      activities.push(`- ${head}${i.meta ? ` (${i.meta})` : ""}`);
      if (i.description) activities.push(`  ${i.description}`);
    }
  }
  if (activities.length) out.push({ heading: t("recommenders.brief.activities"), lines: activities });

  if (input.colleges.length) {
    const where = [...input.colleges].sort(byDeadline).map((c) => join(c.name, c.course, c.deadline));
    out.push({ heading: t("recommenders.brief.applying"), lines: where });
  }

  if (input.highlight.trim()) out.push({ heading: t("recommenders.brief.highlight"), lines: [input.highlight.trim()] });

  if (input.colleges.some((c) => c.country === "GB")) {
    out.push({
      heading: t("recommenders.brief.ucas"),
      lines: [t("recommenders.brief.ucas1"), t("recommenders.brief.ucas2"), t("recommenders.brief.ucas3"), t("recommenders.brief.ucas4")],
    });
  }
  return out;
}

/**
 * Plain text for the download: the title, then each section under its heading. It starts with a UTF-8 byte order mark so
 * Windows Notepad and Excel open the Chinese brief as UTF-8 instead of garbling it.
 */
export function briefText(sections: BriefSection[], title: string): string {
  const out = [title];
  for (const s of sections) out.push("", s.heading, ...s.lines);
  return "﻿" + out.join("\n");
}

type BriefDeadline = Pick<Deadline, "id" | "institution_id" | "kind" | "plan_key" | "label" | "due_date"> & Partial<Pick<Deadline, "program_id" | "intake">>;

/**
 * One brief row per listed college. The deadline is the earliest upcoming application row once the chosen course (and
 * intake) and the plan have been applied, the same rules My list uses. `today` is yyyy-mm-dd.
 */
export function briefColleges(
  list: readonly Pick<ListEntry, "slug" | "plan" | "checklist" | "custom">[],
  colleges: readonly { slug: string; id: string; name: string }[],
  deadlines: readonly BriefDeadline[],
  who: { international: boolean; today: string },
): BriefCollege[] {
  return list.flatMap((entry): BriefCollege[] => {
    if (entry.custom) return [{ name: entry.custom.name, country: "US" as CountryCode, course: null, deadline: entry.custom.deadline && entry.custom.deadline >= who.today ? entry.custom.deadline : null }];
    const college = colleges.find((c) => c.slug === entry.slug);
    if (!college) return [];
    const course = courseFor(entry.slug, entry.checklist.course);
    const rows = deadlinesForEntry(
      deadlines.filter((d) => d.institution_id === college.id).map((d) => ({ ...d, program_id: d.program_id ?? null, intake: d.intake ?? null })),
      { course, intake: entry.checklist.intake },
    );
    const next = rows
      .filter((d) => d.kind === "application" && d.due_date && d.due_date >= who.today)
      .filter((d) => deadlineApplies(d, { plan: entry.plan, international: who.international }))
      .map((d) => d.due_date!)
      .sort()[0];
    return [{ name: college.name, country: countryOf(entry.slug), course: course?.name ?? null, deadline: next ?? null }];
  });
}
