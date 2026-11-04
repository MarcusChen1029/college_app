// Weekly student summary email (migration 0051; the student opts in under Settings > reminders). Deno can't import from web/, so
// this is a hand-written TWIN of the private AI tool get_weekly_changes (web/lib/weekly-changes.ts buildWeeklyChanges) for the parts the
// email uses: updated this week, due in 14 days, overdue, data re-checked. web/lib/student-digest-parity.test.ts runs both on the same
// fixtures and a seeded random spread and requires deeply equal results, so change both together. The rules that are easy to get wrong:
//   - days are TAIPEI calendar days (a timestamp is turned into its Taipei date before it is compared with the window start);
//   - an international student never sees a FAFSA-only date (./fafsa.ts, itself a twin of web/lib/deadline-rules.ts);
//   - a college with no plan chosen is overdue only when no application round is left, and an undated (rolling) round counts as left;
//   - the checklist labels are the app's (CHECKLIST below equals web/lib/checklist.ts, checked by the same test).
// NOT a parity gap: "data re-checked" here comes from the database's sources.accessed_on only (latestAccess), by decision, while
// get_weekly_changes also counts a college's supplement sources (web/lib/mcp/tools.ts passes collegeLastChecked over
// listedSources(db sources, supplement sources)). So the two can legitimately name different colleges as re-checked. The parity
// test hands both the same lastCheckedBySlug on purpose and checks latestAccess only against freshness.ts lastChecked over DB rows;
// don't "fix" the difference by reading supplements here (Deno can't import them from web/).
// No Deno API and no database client in here: everything that touches the outside (the reads, Resend, the log row) is passed in as
// `DigestDeps` by deadline-reminders/index.ts, so node --test (web/lib/student-digest.test.ts) can run the whole flow with fakes.
//   - UK / Canada / Australia colleges use their own checklist items and labels, and a chosen course (and Australian intake) picks which
//     deadline rows count (twins of web/lib/checklist.ts, application-steps.ts and course-deadlines.ts; data: ./application-steps.json).
// After editing, redeploy deadline-reminders (index.ts + fafsa.ts + pass.ts + teacher-digest.ts + application-steps.json + this file).
//
// The email is English only, like the deadline reminder and the teacher digest (the database stores no UI language). Nothing a student
// typed goes into it (custom colleges are left out; names, labels and dates come from the reference tables), and every string is
// HTML-escaped anyway.

import appSteps from "./application-steps.json" with { type: "json" };
import { isFafsaOnly } from "./fafsa.ts";
import { taipeiToday } from "./pass.ts";
import { daysBetween, escapeHtml, fmtDate, relativeDay, type DigestEmail } from "./teacher-digest.ts";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

/** Look back this many days (get_weekly_changes DEFAULT_DAYS). */
export const DEFAULT_DAYS = 7;
/** The deadline window, in days from today (get_weekly_changes DUE_SOON_DAYS). */
export const DUE_SOON_DAYS = 14;
/** Rows shown per section; the rest are summarised as "and N more". */
export const MAX_PER_SECTION = 10;

// ── the Taipei day ──

/**
 * Today's Taipei date. The caller (a test run) may pass `today`; only a real date within a day of the Taipei date is honoured, so a
 * replayed or leaked cron secret can't make the function mail summaries for arbitrary dates or push the log ahead.
 */
export function clampTaipeiToday(raw: unknown, now: Date = new Date()): string {
  const real = taipeiToday(now);
  if (typeof raw !== "string" || !ISO.test(raw)) return real;
  return Math.abs(daysBetween(real, raw)) <= 1 ? raw : real;
}

/** The ISO day `n` days before `iso`. */
function daysBefore(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - n * DAY_MS).toISOString().slice(0, 10);
}

/** The Taipei calendar day of a timestamp, or null when it isn't a usable timestamp. `at` is the instant, for ordering. */
function taipeiDay(timestamp: string | undefined): { day: string; at: number } | null {
  if (!timestamp) return null;
  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return null;
  return { day: taipeiToday(new Date(at)), at };
}

// ── twin of web/lib/checklist.ts (the part get_weekly_changes uses) ──

export type Checklist = {
  recommendations?: boolean;
  transcript?: boolean;
  test_scores?: boolean;
  english_test?: boolean;
  no_essays?: boolean;
  essay_list?: readonly { status?: string }[];
  test_plan?: string | null;
  english_plan?: string | null;
  // UK / Canada / Australia (web/lib/checklist.ts):
  ucas_ps?: boolean;
  ucas_reference?: boolean;
  admissions_test?: boolean;
  extra_steps?: Record<string, boolean>;
  course?: string | null;
  intake?: string | null;
};

export const CHECKLIST = [
  ["essays", "Essays"],
  ["recommendations", "Recommendations"],
  ["transcript", "Transcript sent"],
  ["test_scores", "Test scores"],
  ["english_test", "English test"],
] as const;
export type ChecklistKey = (typeof CHECKLIST)[number][0];

export function isDone(key: ChecklistKey, c: Checklist): boolean {
  switch (key) {
    case "essays": {
      if (c.no_essays) return true;
      const list = c.essay_list ?? [];
      return list.length > 0 && list.every((e) => e.status === "final");
    }
    case "test_scores":
      return c.test_plan === "optional" || (!!c.test_plan && !!c.test_scores);
    case "english_test":
      return c.english_plan === "not_required" || (!!c.english_plan && !!c.english_test);
    default:
      return !!c[key];
  }
}

// ── twin of web/lib/application-steps.ts + the country part of web/lib/checklist.ts ──
// The data file is the same one the website imports (generated twice by scripts/build_application_steps.py; a test keeps them equal).

type Intake = "s1" | "s2";
type ExtraStep = { id: string; kind: string; name: string; courses: "all" | string[] };
type CourseInfo = { id: string; slug: string; name: string; admissionsTest: string | null };
export type CollegeSteps = { country: "GB" | "CA" | "AU"; steps: ExtraStep[]; courses: CourseInfo[] };
type Context = { country: "US" | "GB" | "CA" | "AU"; course: CourseInfo | null; hasCourses: boolean; steps: ExtraStep[] };
type CItem = { key: string; done: boolean; step: ExtraStep | null; detail: string | null };

const STEPS = appSteps as unknown as Record<string, CollegeSteps>;

/** web normalIntake: "s1" / "s2" pass through; anything else (including "s3", "" and non-strings) means no intake. */
export function normalIntake(v: unknown): Intake | null {
  return v === "s1" || v === "s2" ? v : null;
}

/** web contextFor; `data` is the college record set (tests inject their own). US, custom and unknown slugs get the US context. */
function contextFor(slug: string, c: Pick<Checklist, "course">, data: Record<string, CollegeSteps> = STEPS): Context {
  if (!Object.hasOwn(data, slug)) return { country: "US", course: null, hasCourses: false, steps: [] };
  const college = data[slug];
  const course = c.course ? (college.courses.find((x) => x.slug === c.course) ?? null) : null;
  return {
    country: college.country,
    course,
    hasCourses: college.courses.length > 0,
    steps: college.steps.filter((s) => s.courses === "all" || (course !== null && s.courses.includes(course.slug))),
  };
}

/** web isSatActStep: a test step whose name names the SAT or the ACT, in capitals. */
function isSatActStep(s: Pick<ExtraStep, "kind" | "name">): boolean {
  return s.kind === "test" && /\b(SAT|ACT)\b/.test(s.name);
}

/** web checklistItems. */
function items(c: Checklist, ctx: Context): CItem[] {
  const CItem = (key: string, done: boolean, o: Partial<CItem> = {}): CItem => ({ key, done, step: null, detail: null, ...o });
  if (ctx.country === "US") return CHECKLIST.map(([k]) => CItem(k, isDone(k, c)));
  const stepItem = (s: ExtraStep) => CItem(`step:${s.id}`, c.extra_steps?.[s.id] === true, { step: s });
  const out: CItem[] = [];
  if (ctx.hasCourses) out.push(CItem("course_choice", ctx.course != null, { detail: ctx.course?.name ?? null }));
  if (ctx.country === "GB") {
    out.push(CItem("ucas_ps", c.ucas_ps === true), CItem("ucas_reference", c.ucas_reference === true));
    if (ctx.course?.admissionsTest) out.push(CItem("admissions_test", c.admissions_test === true, { detail: ctx.course.admissionsTest }));
    out.push(...ctx.steps.map(stepItem), CItem("english_test", isDone("english_test", c)));
  } else if (ctx.country === "CA") {
    // An SAT/ACT test step is the SAT/ACT plan item; any other test (Western's Casper) is a plain step.
    const satAct = ctx.steps.find(isSatActStep);
    out.push(CItem("transcript", isDone("transcript", c)), ...ctx.steps.filter((s) => !isSatActStep(s)).map(stepItem), CItem("english_test", isDone("english_test", c)));
    if (satAct) out.push(CItem("test_scores", isDone("test_scores", c), { detail: satAct.name }));
  } else {
    out.push(CItem("transcript", isDone("transcript", c)), ...ctx.steps.map(stepItem), CItem("english_test", isDone("english_test", c)));
  }
  return out;
}

/** web itemLabel (English). */
function label(CItem: CItem, country: Context["country"]): string {
  if (CItem.step) return CItem.step.name;
  switch (CItem.key) {
    case "course_choice":
      return "Course chosen";
    case "ucas_ps":
      return "UCAS personal statement";
    case "ucas_reference":
      return "UCAS reference and predicted grades";
    case "admissions_test":
      return CItem.detail ? `Admissions test (${CItem.detail})` : "Admissions test";
    case "transcript":
      return country === "CA" ? "Grades / transcript sent" : country === "AU" ? "Documents sent" : "Transcript sent";
    case "test_scores":
      // A Canadian university's SAT/ACT item names its test step (e.g. "SAT/ACT disclosure"). US items have no detail.
      return CItem.detail ? `Test scores (${CItem.detail})` : "Test scores";
    default:
      return CHECKLIST.find(([k]) => k === CItem.key)?.[1] ?? CItem.key;
  }
}

/** web progressFor: the college's own items. */
export function progress(c: Checklist, slug: string, data: Record<string, CollegeSteps> = STEPS) {
  const all = items(c, contextFor(slug, c, data));
  const done = all.filter((i) => i.done).length;
  return { done, total: all.length, missing: all.length - done };
}

/** The labels of the items still open (web: checklistItems(...).filter(!done).map(itemLabel)). */
export function missingLabels(c: Checklist, slug: string, data: Record<string, CollegeSteps> = STEPS): string[] {
  const ctx = contextFor(slug, c, data);
  return items(c, ctx).filter((i) => !i.done).map((i) => label(i, ctx.country));
}

/**
 * web deadlinesForEntry (rules 1-3 of web/lib/course-deadlines.ts), with the course looked up from the college's data. Callers pass ALL
 * of the college's rows and filter by date afterwards.
 */
export function deadlinesFor<D extends { kind: string; program_id?: string | null; intake?: string | null }>(
  rows: readonly D[],
  slug: string,
  c: Pick<Checklist, "course" | "intake">,
  data: Record<string, CollegeSteps> = STEPS,
): D[] {
  const i = normalIntake(c.intake);
  const courseId = contextFor(slug, c, data).course?.id ?? null;
  const kept = rows.filter((r) => (r.program_id == null || r.program_id === courseId) && (r.intake == null || i === null || r.intake === i));
  const covered = new Set(kept.filter((r) => r.kind === "application" && r.program_id != null).map((r) => r.intake ?? ""));
  if (covered.size === 0) return kept;
  return kept.filter((r) => !(r.kind === "application" && r.program_id == null && covered.has(r.intake ?? "")));
}

// ── twin of web/lib/weekly-changes.ts buildWeeklyChanges ──

/** One listed college (an institution the student added; colleges they typed in themselves are not part of this). */
export type DigestCollege = {
  slug: string;
  institutionId: string;
  /** What the site shows: short_name, else name. */
  name: string;
  plan: string | null;
  status: string;
  checklist: Checklist;
  /** student_colleges.updated_at as Postgres writes it. */
  updatedAt?: string;
};

export type DigestDeadline = {
  institution_id: string;
  kind: string;
  plan_key: string | null;
  label: string | null;
  due_date: string | null;
  /** programs.id of the course this row is for (UK / Canada / Australia); null = the university's own row. */
  program_id?: string | null;
  /** Australia: the intake this row is for. */
  intake?: "s1" | "s2" | null;
};

export type UpdatedCollege = { slug: string; name: string; status: string; plan: string | null; updatedOn: string; checklistDone: number; checklistTotal: number };
export type DueSoonDeadline = { slug: string; college: string; due_date: string; days: number; kind: string; plan_key: string | null; label: string | null; missing: string[] };
export type OverdueDeadline = { slug: string; college: string; due_date: string; daysOverdue: number; kind: string; plan_key: string | null; label: string | null; missing: string[] };
export type RefreshedCollege = { slug: string; name: string; lastChecked: string };

export type StudentDigest = {
  since: string;
  today: string;
  updated: UpdatedCollege[];
  dueSoon: DueSoonDeadline[];
  overdue: OverdueDeadline[];
  dataRefreshed: RefreshedCollege[];
};

/** web/lib/deadline-rules.ts deadlineApplies: once a plan is picked only that plan's application deadline counts; international students never see FAFSA-only dates. */
function applies(d: Pick<DigestDeadline, "kind" | "plan_key" | "label" | "program_id">, who: { plan: string | null; international: boolean }): boolean {
  // A course's own date has no plan (plan_key null), so the plan filter would always drop it.
  if (d.kind === "application" && d.program_id == null && who.plan && d.plan_key !== who.plan) return false;
  if (who.international && d.kind !== "application" && isFafsaOnly(d.label)) return false;
  return true;
}

export function buildStudentDigest(input: {
  today: string;
  days?: number;
  list: readonly DigestCollege[];
  deadlines: readonly DigestDeadline[];
  /** True hides the deadlines that only apply to US residents (FAFSA). */
  international?: boolean;
  /** Newest source access date per listed slug; null or absent = no dated source. */
  lastCheckedBySlug: Record<string, string | null | undefined>;
}): StudentDigest {
  const { today, list, deadlines, lastCheckedBySlug, international = false } = input;
  const since = daysBefore(today, input.days ?? DEFAULT_DAYS);

  const updated = list
    .flatMap((e) => {
      const stamp = taipeiDay(e.updatedAt);
      if (!stamp || stamp.day < since) return [];
      const p = progress(e.checklist, e.slug);
      return [{ at: stamp.at, row: { slug: e.slug, name: e.name, status: e.status, plan: e.plan, updatedOn: stamp.day, checklistDone: p.done, checklistTotal: p.total } }];
    })
    .sort((a, b) => b.at - a.at)
    .map((x) => x.row);

  // The checklist items still open per college (its country's items), by the labels the app and update_checklist already use.
  const missingBySlug = new Map(list.map((e) => [e.slug, missingLabels(e.checklist, e.slug)]));
  const missing = (slug: string): string[] => missingBySlug.get(slug) ?? [];

  const dueSoon = list
    .flatMap((c) =>
      // All of the college's rows first (the chosen course's date replaces the university's), the date window after.
      deadlinesFor(
        deadlines.filter((d) => d.institution_id === c.institutionId),
        c.slug,
        c.checklist,
      )
        .filter((d) => d.due_date && daysBetween(today, d.due_date) >= 0 && daysBetween(today, d.due_date) <= DUE_SOON_DAYS)
        .filter((d) => applies(d, { plan: c.plan, international }))
        .map((d) => ({ slug: c.slug, college: c.name, due_date: d.due_date!, days: daysBetween(today, d.due_date!), kind: d.kind, plan_key: d.plan_key, label: d.label, missing: missing(c.slug) })),
    )
    .sort((a, b) => a.due_date.localeCompare(b.due_date));

  // Overdue: a college still in progress whose application deadline has passed. With a decided plan, that plan's passed round is overdue.
  // With no plan yet the student may still pick a later round, so the college is overdue only when NO applicable round is still open
  // (a dated round due today or later, or a rolling round with no date at all), and then it is reported once, for the latest dated
  // round that passed.
  const overdue = list
    .filter((e) => e.status === "in_progress")
    .flatMap((e) => {
      const applicable = deadlinesFor(
        deadlines.filter((dl) => dl.institution_id === e.institutionId),
        e.slug,
        e.checklist,
      ).filter((dl) => dl.kind === "application" && applies(dl, { plan: e.plan, international }));
      const rounds = applicable.flatMap((dl) => (dl.due_date ? [{ dl, due: dl.due_date, days: daysBetween(today, dl.due_date) }] : []));
      let passed = rounds.filter((r) => r.days < 0);
      if (!e.plan) {
        const undated = applicable.length > rounds.length;
        if (passed.length === 0 || undated || rounds.some((r) => r.days >= 0)) return [];
        passed = [passed.reduce((latest, r) => (r.due > latest.due ? r : latest))];
      }
      return passed.map(({ dl, due, days }) => ({ slug: e.slug, college: e.name, due_date: due, daysOverdue: -days, kind: dl.kind, plan_key: dl.plan_key, label: dl.label, missing: missing(e.slug) }));
    })
    .sort((a, b) => a.due_date.localeCompare(b.due_date) || a.college.localeCompare(b.college));

  const dataRefreshed = list
    .flatMap((e) => {
      const checked = lastCheckedBySlug[e.slug];
      return checked && checked >= since ? [{ slug: e.slug, name: e.name, lastChecked: checked }] : [];
    })
    .sort((a, b) => b.lastChecked.localeCompare(a.lastChecked) || a.name.localeCompare(b.name));

  return { since, today, updated, dueSoon, overdue, dataRefreshed };
}

/**
 * Newest sources.accessed_on per institution (web/lib/freshness.ts lastChecked, database sources only): ISO days sort as text, anything
 * else is ignored. The caller may pass only the rows from the window start on, since an older newest date is not "refreshed" anyway.
 */
export function latestAccess(rows: readonly { institution_id: string; accessed_on: string | null | undefined }[]): Record<string, string> {
  const newest = new Map<string, string>();
  for (const r of rows) {
    const day = r.accessed_on;
    if (typeof day !== "string" || !ISO.test(day)) continue;
    const have = newest.get(r.institution_id);
    if (have === undefined || day > have) newest.set(r.institution_id, day);
  }
  return Object.fromEntries(newest);
}

/** How many lines the email would carry in all. */
const countOf = (d: StudentDigest): number => d.updated.length + d.dueSoon.length + d.overdue.length + d.dataRefreshed.length;

export const isEmptyDigest = (d: StudentDigest): boolean => countOf(d) === 0;

// ── reading rows ──

type InstitutionRef = { slug: string; name: string; short_name: string | null };
/** A student_colleges row read with institutions(slug, name, short_name) embedded. */
export type CollegeRow = {
  institution_id: string | null;
  plan_key: string | null;
  status: string;
  checklist: Checklist | null;
  updated_at: string | null;
  institutions: InstitutionRef | readonly InstitutionRef[] | null;
};

/** null for a college the student typed in (no institution): the email only covers colleges from the site's own data. */
export function toDigestCollege(r: CollegeRow): DigestCollege | null {
  const inst = Array.isArray(r.institutions) ? r.institutions[0] : (r.institutions as InstitutionRef | null);
  if (!r.institution_id || !inst?.slug) return null;
  return {
    slug: inst.slug,
    institutionId: r.institution_id,
    name: inst.short_name ?? inst.name,
    plan: r.plan_key,
    status: r.status,
    checklist: r.checklist ?? {},
    updatedAt: r.updated_at ?? undefined,
  };
}

// ── the email ──

const STATUS_LABEL: Record<string, string> = {
  researching: "In progress",
  planning: "In progress",
  in_progress: "In progress",
  submitted: "Submitted",
  interview: "Submitted",
  admitted: "Admitted",
  deferred: "Deferred",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  enrolled: "Committed",
};
const statusLabel = (s: string) => (Object.hasOwn(STATUS_LABEL, s) ? STATUS_LABEL[s] : s.replace(/_/g, " "));

/** SQL initcap(replace(kind, '_', ' ')): the daily reminder's fallback name for a deadline. */
const initcap = (s: string) => s.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** The daily reminder's wording: the deadline's own label, else its application plan's label, else the kind. */
function deadlineName(d: { label: string | null; plan_key: string | null; kind: string }, planLabels: Record<string, string>): string {
  const own = d.label?.trim();
  if (own) return own;
  if (d.plan_key && Object.hasOwn(planLabels, d.plan_key)) return planLabels[d.plan_key];
  return initcap(d.kind);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Item = { slug: string; name: string; what: string; when: string; note: string };
type Section = { heading: string; intro: string; items: Item[] };

const todo = (missing: readonly string[]) => (missing.length ? `Still to do: ${missing.join(", ")}` : "Checklist complete");

function sections(d: StudentDigest, planLabels: Record<string, string>): Section[] {
  const all: Section[] = [
    {
      heading: "Overdue",
      intro: "Application deadlines that have passed for colleges still marked In progress:",
      items: d.overdue.map((o) => ({ slug: o.slug, name: o.college, what: deadlineName(o, planLabels), when: `${fmtDate(o.due_date)} · ${relativeDay(-o.daysOverdue)}`, note: todo(o.missing) })),
    },
    {
      heading: "Due in the next 14 days",
      intro: "Dates for the colleges on your list, soonest first. A college with no plan chosen yet shows every round.",
      items: d.dueSoon.map((u) => ({ slug: u.slug, name: u.college, what: deadlineName(u, planLabels), when: `${fmtDate(u.due_date)} · ${relativeDay(u.days)}`, note: todo(u.missing) })),
    },
    {
      heading: "Updated this week",
      intro: `Colleges on your list that were changed since ${fmtDate(d.since)}:`,
      items: d.updated.map((u) => ({
        slug: u.slug,
        name: u.name,
        what: `${statusLabel(u.status)}${u.plan ? ` · ${Object.hasOwn(planLabels, u.plan) ? planLabels[u.plan] : u.plan}` : ""}`,
        when: `Changed ${fmtDate(u.updatedOn)}`,
        note: `${u.checklistDone} of ${u.checklistTotal} checklist items done`,
      })),
    },
    {
      heading: "Data re-checked this week",
      intro: `We re-checked the sources for these colleges since ${fmtDate(d.since)}:`,
      items: d.dataRefreshed.map((r) => ({ slug: r.slug, name: r.name, what: "Sources re-checked", when: fmtDate(r.lastChecked), note: "" })),
    },
  ];
  return all.filter((s) => s.items.length > 0);
}

/** The summary email, or null when there is nothing to report (then nothing is sent). */
export function renderStudentDigest(input: { digest: StudentDigest; appUrl: string; planLabels?: Record<string, string> }): DigestEmail | null {
  const { digest } = input;
  if (isEmptyDigest(digest)) return null;
  const appUrl = input.appUrl.replace(/\/$/, "");
  const manage = `${appUrl}/settings#reminders`;
  const secs = sections(digest, input.planLabels ?? {});

  const bits: string[] = [];
  if (digest.overdue.length) bits.push(`${digest.overdue.length} overdue`);
  if (digest.dueSoon.length) bits.push(`${digest.dueSoon.length} due in the next ${DUE_SOON_DAYS} days`);
  const subject = bits.length ? `Your week on Trakur: ${bits.join(", ")}` : "Your week on Trakur";

  const link = (slug: string) => `${appUrl}/colleges/${encodeURIComponent(slug)}`;
  const htmlSections = secs
    .map((s) => {
      const shown = s.items.slice(0, MAX_PER_SECTION);
      const more = s.items.length - shown.length;
      const items = shown
        .map((i) => `<li style="margin:0 0 8px"><a href="${escapeHtml(link(i.slug))}">${escapeHtml(i.name)}</a> — ${escapeHtml(i.what)}<br><span style="color:#71717a">${escapeHtml([i.when, i.note].filter(Boolean).join(" · "))}</span></li>`)
        .join("\n");
      return `<h3 style="font-size:15px;margin:20px 0 4px">${escapeHtml(s.heading)}</h3>
<p style="margin:0 0 6px">${escapeHtml(s.intro)}</p>
<ul style="margin:0;padding-left:20px">
${items}${more > 0 ? `\n<li>and ${more} more</li>` : ""}
</ul>`;
    })
    .join("\n");

  const textSections = secs
    .map((s) => {
      const shown = s.items.slice(0, MAX_PER_SECTION);
      const more = s.items.length - shown.length;
      const lines = shown.map((i) => `- ${i.name} — ${i.what}\n  ${[i.when, i.note].filter(Boolean).join(" · ")}`);
      return `${s.heading}\n${s.intro}\n\n${lines.join("\n")}${more > 0 ? `\n- and ${more} more` : ""}`;
    })
    .join("\n\n");

  const intro = `Your weekly Trakur summary, as of ${fmtDate(digest.today)}.`;
  return {
    subject,
    html: `<div style="font-family:system-ui,sans-serif;font-size:14px;color:#18181b">
<p>${escapeHtml(intro)}</p>
${htmlSections}
<p style="margin-top:20px"><a href="${escapeHtml(`${appUrl}/application/list`)}">Open my list</a> · <a href="${escapeHtml(`${appUrl}/data-updates`)}">What changed in the site's data</a> · Always confirm dates on the college's own website.</p>
<p style="color:#71717a;font-size:12px">You get this weekly summary because you turned it on in your Trakur settings. <a href="${escapeHtml(manage)}">Turn it off</a>.</p>
</div>`,
    text: `${intro}\n\n${textSections}\n\nOpen my list: ${appUrl}/application/list\nWhat changed in the site's data: ${appUrl}/data-updates\nTurn this summary off: ${manage}`,
  };
}

// ── the run ──

/** A student the database says is due this week (due_student_digests, migration 0051). `week_start` is the Monday it was computed for. */
export type DueStudent = { user_id: string; email: string; week_start: string };
export type StudentData = { international: boolean; list: DigestCollege[] };
/** What every student's digest is built from, read once per run. */
export type SharedData = {
  deadlines: DigestDeadline[];
  /** sources rows with accessed_on on or after the window start. */
  sources: { institution_id: string; accessed_on: string | null }[];
  plans: { key: string; label: string | null }[];
};
export type SendResult = { ok: true } | { ok: false; status: number; body: string };

/** Everything outside this file: reads, the mail API and the log row. Reads throw on a database error; markSent returns the error message instead. */
export type DigestDeps = {
  dueStudents(today: string): Promise<DueStudent[]>;
  sharedData(since: string): Promise<SharedData>;
  studentData(userId: string): Promise<StudentData>;
  send(m: { to: string; subject: string; html: string; text: string; idempotencyKey: string }): Promise<SendResult>;
  markSent(userId: string, weekStart: string): Promise<string | null>;
};

export type StudentDigestResult = { student: string; count: number; status: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Sends the weekly summary to every student the database says is due. Rules (mirroring the teacher digest):
 *  - a dry run reads and renders but never sends and never writes the log;
 *  - nothing to report: nothing is sent and nothing is logged, so the student is looked at again on the next daily run (a deadline
 *    that comes inside the 14-day window on Wednesday is reported on Wednesday);
 *  - the log row is written only after a send the mail API accepted, with the week_start the database returned (never recomputed);
 *  - one student's failure (a read, building or rendering their digest, a send, the log) is reported in that student's result and
 *    never stops the others.
 * A failure of the due-list or the shared reads is thrown: the caller reports it and carries on with its other emails.
 */
export async function runStudentDigests(deps: DigestDeps, opts: { today: string; dryRun: boolean; appUrl: string }): Promise<StudentDigestResult[]> {
  const due = await deps.dueStudents(opts.today);
  const results: StudentDigestResult[] = [];
  if (!due.length) return results;

  const shared = await deps.sharedData(daysBefore(opts.today, DEFAULT_DAYS));
  const checkedByInstitution = latestAccess(shared.sources);
  const planLabels: Record<string, string> = {};
  for (const p of shared.plans) if (p.label) planLabels[p.key] = p.label;

  for (const u of due) {
    const done = (count: number, status: string) => results.push({ student: u.user_id, count, status });

    let data: StudentData;
    try {
      data = await deps.studentData(u.user_id);
    } catch (e) {
      done(0, `data failed: ${message(e)}`);
      continue;
    }
    // Stored data can be bad in ways no database check catches (a checklist whose essay_list is text, say): building or rendering
    // then throws. That is this student's failure alone; they are not logged, so the next daily run tries them again.
    let count: number;
    let email: DigestEmail | null;
    try {
      const digest = buildStudentDigest({
        today: opts.today,
        list: data.list,
        deadlines: shared.deadlines,
        international: data.international,
        lastCheckedBySlug: Object.fromEntries(data.list.map((c) => [c.slug, checkedByInstitution[c.institutionId] ?? null])),
      });
      count = countOf(digest);
      email = renderStudentDigest({ digest, appUrl: opts.appUrl, planLabels });
    } catch (e) {
      done(0, `build failed: ${message(e)}`);
      continue;
    }
    if (!email) {
      done(0, "nothing to report");
      continue;
    }
    if (opts.dryRun) {
      done(count, `dry-run: ${email.subject}`);
      continue;
    }

    let sent: SendResult;
    try {
      sent = await deps.send({ to: u.email, subject: email.subject, html: email.html, text: email.text, idempotencyKey: `student-digest-${u.user_id}-${u.week_start}` });
    } catch (e) {
      done(count, `send failed: ${message(e)}`);
      continue;
    }
    if (!sent.ok) {
      done(count, `send failed ${sent.status}: ${sent.body}`);
      continue;
    }
    let logError: string | null;
    try {
      logError = await deps.markSent(u.user_id, u.week_start);
    } catch (e) {
      logError = message(e);
    }
    done(count, logError ? `sent, log failed: ${logError}` : "sent");
  }
  return results;
}
