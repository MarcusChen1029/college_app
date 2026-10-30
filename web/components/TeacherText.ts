// Translates, at the component edge, the English strings that lib/*.ts functions return (those libs have tests that
// assert the English, so they are not changed). Every helper falls back to the English text it was given.

import type { Locale, MessageKey, TFunction } from "@/lib/i18n";
import { daysUntil, type Flag, type FlagKey } from "@/lib/roster";
import { daysLabel, shortDate, weekdayDate } from "@/lib/roster-view";
import type { TeacherTask } from "@/lib/tasks";

type Rule = readonly [RegExp, MessageKey, ...string[]];

/** First matching rule wins; the regex's capture groups, in order, fill the {placeholders} named after the key. */
function byRules(t: TFunction, text: string, rules: readonly Rule[]): string {
  for (const [re, key, ...names] of rules) {
    const m = re.exec(text);
    if (m) return t(key, Object.fromEntries(names.map((name, i) => [name, m[i + 1]])));
  }
  return text;
}

function byMap(t: TFunction, map: Readonly<Record<string, MessageKey>>, text: string): string {
  const key = map[text];
  return key ? t(key) : text;
}

// ───────── attention flags ─────────

const FLAG_LABEL: Record<FlagKey, MessageKey> = {
  deadline_soon: "teacher.flag.deadlineSoon",
  essay_not_started: "teacher.flag.essayNotStarted",
  no_colleges: "teacher.flag.noColleges",
  no_scores: "teacher.flag.noScores",
  inactive: "teacher.flag.inactive",
};

const FLAG_DETAIL: Record<FlagKey, readonly Rule[]> = {
  deadline_soon: [
    [/^(.+) is due in 1 day with (\d+) checklist items open\.$/, "teacher.flag.deadlineSoon.one", "name", "m"],
    [/^(.+) is due in (\d+) days with (\d+) checklist items open\.$/, "teacher.flag.deadlineSoon.other", "name", "n", "m"],
  ],
  essay_not_started: [[/^Nothing started for (.+), due (.+)\.$/, "teacher.flag.essayNotStarted.detail", "name", "date"]],
  no_colleges: [[/^Hasn't added any college to their list\.$/, "teacher.flag.noColleges.detail"]],
  no_scores: [[/^No SAT or ACT score entered\.$/, "teacher.flag.noScores.detail"]],
  inactive: [[/^No changes in (\d+) days\.$/, "teacher.flag.inactive.detail", "n"]],
};

export const flagLabel = (t: TFunction, f: Flag): string => t(FLAG_LABEL[f.key] ?? "teacher.flag.inactive");
/** The flag's sentence in the reader's language; the essay flag's due day reads "Nov 2" / "11月2日", not the ISO date. */
export const flagDetail = (t: TFunction, f: Flag, locale: Locale = "en"): string =>
  f.key === "essay_not_started" && f.college && f.due
    ? t("teacher.flag.essayNotStarted.detail", { name: f.college, date: shortDate(f.due, locale) })
    : byRules(t, f.detail, FLAG_DETAIL[f.key] ?? []);

// ───────── time ─────────

const RELATIVE: readonly Rule[] = [
  [/^Never$/, "teacher.time.never"],
  [/^Today$/, "teacher.time.today"],
  [/^Yesterday$/, "teacher.time.yesterday"],
  [/^(\d+) days ago$/, "teacher.time.daysAgo", "n"],
  [/^(\d+) weeks ago$/, "teacher.time.weeksAgo", "n"],
  [/^(\d+) months ago$/, "teacher.time.monthsAgo", "n"],
  [/^1 year ago$/, "teacher.time.yearAgo"],
  [/^(\d+) years ago$/, "teacher.time.yearsAgo", "n"],
];

/** `relativeTime()` from lib/roster-view.ts, in the reader's language. */
export const relativeText = (t: TFunction, english: string): string => byRules(t, english, RELATIVE);

const WHEN: readonly Rule[] = [
  [/^today$/, "teacher.when.today"],
  [/^tomorrow$/, "teacher.when.tomorrow"],
  [/^yesterday$/, "teacher.when.yesterday"],
  [/^in (\d+) days$/, "teacher.when.inDays", "n"],
  [/^(\d+) days ago$/, "teacher.time.daysAgo", "n"],
];

/** `daysLabel()` from lib/roster-view.ts, in the reader's language. */
export const whenText = (t: TFunction, english: string): string => byRules(t, english, WHEN);

/** "Sat, Nov 1 - in 8 days" (as groupDeadlines() builds it), with the date written in the reader's language. */
export function dateHeading(t: TFunction, locale: Locale, date: string, now: Date): string {
  const [y, m, d] = date.split("-").map(Number);
  const day = locale === "en" ? weekdayDate(date) : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  return `${day} - ${whenText(t, daysLabel(daysUntil(date, now)))}`;
}

// ───────── statuses, checklist, essays ─────────

const STATUS: Record<string, MessageKey> = {
  Submitted: "teacher.status.submitted",
  Ready: "teacher.status.ready",
  "In progress": "teacher.status.inProgress",
  "Waiting for decision": "teacher.status.waiting",
  Admitted: "teacher.status.admitted",
  Deferred: "teacher.status.deferred",
  Waitlisted: "teacher.status.waitlisted",
  Rejected: "teacher.status.rejected",
  Committed: "teacher.status.committed",
  Withdrawn: "teacher.status.withdrawn",
  Denied: "teacher.status.denied",
};

/** An application status or decision label from lib/roster-view.ts / lib/class-charts.ts. */
export const statusText = (t: TFunction, english: string): string => byMap(t, STATUS, english);

const CHECK: Record<string, MessageKey> = {
  Essays: "teacher.check.essays",
  Recommendations: "teacher.check.recommendations",
  "Transcript sent": "teacher.check.transcript",
  "Test scores": "teacher.check.testScores",
  "English test": "teacher.check.englishTest",
};

/** A checklist item label from lib/checklist.ts. */
export const checkText = (t: TFunction, english: string): string => byMap(t, CHECK, english);

const ESSAY_STATUS: Record<string, MessageKey> = {
  not_started: "teacher.essayStatus.not_started",
  brainstorming: "teacher.essayStatus.brainstorming",
  drafting: "teacher.essayStatus.drafting",
  revising: "teacher.essayStatus.revising",
  final: "teacher.essayStatus.final",
};

/** An essay status by its stored id (falls back to the id). */
export const essayStatusText = (t: TFunction, id: string): string => byMap(t, ESSAY_STATUS, id);

// ───────── tasks ─────────

export const targetText = (t: TFunction, task: Pick<TeacherTask, "classId" | "className" | "studentName">): string => {
  if (task.classId) return task.className ? t("teacher.tasks.targetClass", { name: task.className }) : t("teacher.tasks.targetClassWord");
  return task.studentName ?? t("teacher.tasks.targetStudentWord");
};

export const progressLabel = (t: TFunction, task: Pick<TeacherTask, "doneCount" | "totalCount">): string =>
  task.totalCount === 0 ? t("teacher.tasks.noAssigned") : t("teacher.tasks.progress", { done: task.doneCount, total: task.totalCount });

// ───────── error messages written in lib/*.ts ─────────

const ERRORS: readonly Rule[] = [
  [/^Something went wrong\. Please try again\.$/, "common.tryAgain"],
  [/^Enter a title for the task\.$/, "teacher.tasks.errTitle"],
  [/^Keep the title under (\d+) characters\.$/, "teacher.tasks.errTitleLong", "n"],
  [/^Keep the details under (\d+) characters\.$/, "teacher.tasks.errDetailsLong", "n"],
  [/^Enter a valid due date\.$/, "teacher.tasks.errDue"],
  [/^Choose a class or a student\.$/, "teacher.tasks.chooseErr"],
  [/^You have (\d+) active tasks, the most allowed\. Archive some to add more\.$/, "teacher.tasks.errLimit", "n"],
  [/^That class isn't available\. It may be archived\.$/, "teacher.tasks.errClass"],
  [/^That student is no longer linked to you\.$/, "teacher.tasks.errStudent"],
  [/^That task is no longer available\.$/, "teacher.tasks.errGone"],
  [/^This page is for teacher and counselor accounts\.$/, "teacher.notTeacher"],
  [/^This student is no longer linked to you, so the note can't be saved\.$/, "teacher.notes.errUnlinked"],
  [/^That note no longer exists\. It may have been deleted when the student left\.$/, "teacher.notes.errGone"],
  [/^Notes can't be empty and are limited to 4000 characters\.$/, "teacher.notes.errEmpty"],
];

/** Known English error messages from the libs, translated; anything else (server text) passes through. */
export const errorText = (t: TFunction, english: string): string => byRules(t, english, ERRORS);
