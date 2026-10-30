"use client";

import { useState } from "react";
import { fieldClass } from "@/components/TranscriptCourseForm";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { emptyCourse, emptySchool, type OverrideField, type TranscriptCourse, type TranscriptSchool } from "@/lib/transcript";
import { mapCourse, SYSTEM_IDS, SYSTEMS, type MappedCourse, type MappedField, type MappedFieldKey, type SystemId } from "@/lib/transcript-maps";
import { isNonUs } from "@/lib/transcript-maps/types";
import { buttonClass, LABEL, PANEL, SECTION_TITLE, SEGMENT_TRACK, segmentClass, toneClass } from "@/lib/ui";

type T = ReturnType<typeof useT>;

type Layout = {
  banner: "transcript.bannerCommonApp" | "transcript.bannerStars" | "transcript.bannerCsu" | "transcript.bannerUc" | "transcript.bannerUiuc" | "transcript.bannerUt";
  /** Where the system takes courses, in its own name (from the header of its map file). Portal wording stays English. */
  section: string;
  /** The system's own field labels, in the order its course row asks for them. */
  columns: { key: MappedFieldKey; label: string }[];
  /** The heading a course is listed under. */
  group: (m: MappedCourse, c: TranscriptCourse) => string;
};

const byGradeLevel = (_m: MappedCourse, c: TranscriptCourse) => (c.gradeLevel && c.gradeLevel >= 9 && c.gradeLevel <= 12 ? `${c.gradeLevel}th grade` : "Other courses");
const GROUP_NTH = /^(\d+)th grade$/;
/** Group headings are matched by their English text; only what is displayed is translated. */
function groupLabel(g: string, t: T): string {
  const nth = GROUP_NTH.exec(g);
  if (nth) return t("transcript.gradeNth", { n: nth[1] });
  if (g === "Other courses") return t("transcript.otherCourses");
  if (g === "Not an A-G subject") return t("transcript.notAgSubject");
  return g;
}
const field = (m: MappedCourse, key: MappedFieldKey) => m.fields.find((f) => f.key === key)!;

/** Each system's own order and wording, so the student can copy a row straight across. */
const LAYOUTS: Record<SystemId, Layout> = {
  common_app: {
    banner: "transcript.bannerCommonApp",
    section: "Courses & Grades",
    columns: [
      { key: "subject", label: "Subject" },
      { key: "name", label: "Course name" },
      { key: "level", label: "Course level" },
      { key: "grades", label: "Grade(s)" },
      { key: "credit", label: "Credit(s)" },
    ],
    group: byGradeLevel,
  },
  stars: {
    banner: "transcript.bannerStars",
    section: "Self-reported Transcript and Academic Record System",
    columns: [
      { key: "subject", label: "Subject area" },
      { key: "genericTitle", label: "Course/Exam Content" },
      { key: "name", label: "Course name" },
      { key: "level", label: "Course level" },
      { key: "period", label: "Course length" },
      { key: "grades", label: "Grade(s)" },
      { key: "credit", label: "Credit" },
    ],
    group: (_m, c) => `${c.academicYear}-${String((c.academicYear + 1) % 100).padStart(2, "0")}`,
  },
  csu: {
    banner: "transcript.bannerCsu",
    section: "High School Coursework",
    columns: [
      { key: "name", label: "Course title" },
      { key: "gradeLevel", label: "Grade level" },
      { key: "level", label: "Course type" },
      { key: "subject", label: "A-G area" },
      { key: "grades", label: "Grades" },
    ],
    group: byGradeLevel,
  },
  uc: {
    banner: "transcript.bannerUc",
    section: "Academic History",
    columns: [
      { key: "name", label: "Course" },
      { key: "subSubject", label: "Discipline" },
      { key: "level", label: "Honors" },
      { key: "grades", label: "Grades" },
      { key: "gradeLevel", label: "Grade level" },
    ],
    group: (m) => field(m, "subject").value ?? "Not an A-G subject",
  },
  uiuc: {
    banner: "transcript.bannerUiuc",
    section: "Self-Reported Academic Record",
    columns: [
      { key: "gradeLevel", label: "Year" },
      { key: "period", label: "Term" },
      { key: "subject", label: "Subject" },
      { key: "name", label: "Course name" },
      { key: "grades", label: "Grade" },
      { key: "level", label: "Type" },
    ],
    group: byGradeLevel,
  },
  ut: {
    banner: "transcript.bannerUt",
    section: "Academic Coursework Entry Form",
    columns: [
      { key: "subject", label: "Subject" },
      { key: "name", label: "Course name" },
      { key: "grades", label: "Grades" },
      { key: "credit", label: "Credit" },
    ],
    group: byGradeLevel,
  },
};

const OVERRIDABLE: readonly MappedFieldKey[] = ["level", "subject", "subSubject", "period", "credit", "genericTitle"];
/** Fields that hold longer text get a wider box; a grade level or a credit a narrower one. */
const WIDE: readonly MappedFieldKey[] = ["name", "grades", "genericTitle"];
const NARROW: readonly MappedFieldKey[] = ["gradeLevel", "credit"];
const width = (k: MappedFieldKey) => (WIDE.includes(k) ? "minmax(0,1.6fr)" : NARROW.includes(k) ? "minmax(0,0.7fr)" : "minmax(0,1fr)");

/**
 * A course row in the system's own field order: one line on a wide screen, like the portal's own row, when it holds six fields
 * or fewer; STARS's seven fields take an even four-column grid so no value breaks inside a word. One column on a phone.
 */
function RowGrid({ layout, children }: { layout: Layout; children: React.ReactNode }) {
  const oneLine = layout.columns.length <= 6;
  return (
    <div
      className={`grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 sm:grid-cols-3 ${oneLine ? "xl:grid-cols-(--row)" : "lg:grid-cols-4"}`}
      style={oneLine ? ({ "--row": layout.columns.map((c) => width(c.key)).join(" ") } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {done ? (
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      ) : (
        <>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </>
      )}
    </svg>
  );
}

/** Example data, never stored: one fictional course, mapped by the real tables so the visitor sees what this view does. */
const EXAMPLE_SCHOOL: TranscriptSchool = { ...emptySchool(), id: "example", createdAt: "" };
const EXAMPLE_COURSE: TranscriptCourse = {
  ...emptyCourse(EXAMPLE_SCHOOL.id, EXAMPLE_SCHOOL),
  id: "example-algebra-2",
  academicYear: 2025,
  gradeLevel: 10,
  name: "Algebra II",
  period: "semester",
  terms: [
    { term: "S1", grade: "B+", status: "graded" },
    { term: "S2", grade: "A-", status: "graded" },
  ],
  subject: "mathematics",
  subSubject: "algebra_2",
  credit: 1,
  createdAt: "",
};

const copy = (v: string) => void navigator.clipboard?.writeText(v).catch(() => {});

/** Lets a narrow box wrap "Regular/Standard" after the slash instead of inside a word. Display only: Copy copies the value as is. */
const breakable = (v: string) =>
  v.split("/").map((part, i, all) => (
    <span key={i}>
      {part}
      {i < all.length - 1 && (
        <>
          /<wbr />
        </>
      )}
    </span>
  ));

/** School-level facts a system asks for, from the transcript's own school record. */
function schoolFacts(system: SystemId, s: TranscriptSchool, t: T): string[] {
  const gpaText = `${s.printedGpa}${s.printedGpaScale ? t("transcript.gpaScaleFact", { scale: s.printedGpaScale }) : ""}${s.gpaWeighted == null ? "" : s.gpaWeighted ? t("transcript.weightedFact") : t("transcript.unweightedFact")}`;
  const gpa = s.printedGpa ? t("transcript.gpaFact", { gpa: gpaText }) : "";
  const rank = s.classRank ? t("transcript.rankFact", { rank: s.classRank }) : "";
  if (system === "common_app" || system === "stars") return [gpa, rank].filter(Boolean);
  return [];
}

/**
 * One field of the system's course row: the system's label above, the mapped value in a read-only box. A confirmed value has a
 * Copy button joined to its box. A best guess (`unverified`) says "Check in the portal" on a dashed box and has no Copy button.
 * A field with nothing to enter for this course (`none`, e.g. UIUC Type "Leave Type as Regular") is a plain box with "—" and
 * its note under it.
 */
function Field({ f, label, example, onOverride }: { f: MappedField; label: string; example?: boolean; onOverride?: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const empty = f.value == null || f.value === "";
  const sure = f.status === "verified";
  const check = f.status === "unverified";
  return (
    <div className="min-w-0">
      <p className="text-[13px] leading-5 text-zinc-600">{label}</p>
      <div className={`mt-1 flex min-h-10 items-stretch rounded-lg border ${check ? `border-dashed ${toneClass("soon")}` : "border-zinc-200 bg-white text-ink"}`}>
        <span className="min-w-0 flex-1 break-words px-3 py-2 text-[15px] leading-snug">
          {!empty && breakable(f.value as string)}
          {empty && !check && <span className="text-zinc-500">—</span>}
          {check && <span className={`block text-[13px] font-semibold ${empty ? "" : "mt-0.5"}`}>{t("transcript.checkPortal")}</span>}
        </span>
        {sure && !empty && !example && (
          <button
            type="button"
            className={`flex w-10 shrink-0 items-center justify-center rounded-r-lg border-l border-zinc-200 hover:bg-blue-50 ${copied ? "text-done" : "text-blue-700"}`}
            title={copied ? t("transcript.copied") : t("common.copy")}
            aria-label={t("transcript.copyAria", { label, value: f.value as string })}
            onClick={() => {
              copy(f.value as string);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            <CopyIcon done={copied} />
          </button>
        )}
      </div>
      {!sure && f.note && <p className="mt-1 text-[13px] leading-snug text-zinc-600">{f.note}</p>}
      {(f.overridden || onOverride) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
          {f.overridden && <span className={`whitespace-nowrap rounded-full border px-2 text-[13px] font-semibold ${toneClass("progress")}`}>{t("transcript.overridden")}</span>}
          {onOverride && (
            <button type="button" className="text-[13px] font-semibold text-blue-700 underline-offset-2 hover:underline" aria-label={t("transcript.overrideAria", { label })} onClick={onOverride}>
              {t("transcript.override")}
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** One read-only cell of the small preview: the system's label over its value. Same rule as `Field`: only a best guess is dashed. */
function PreviewCell({ f, label }: { f: MappedField; label: string }) {
  const t = useT();
  const empty = f.value == null || f.value === "";
  const check = f.status === "unverified";
  return (
    <div className="min-w-0">
      <dt className="text-[13px] leading-5 text-zinc-600">{label}</dt>
      <dd className={`mt-0.5 break-words rounded-md border px-2 py-1 text-sm leading-snug ${check ? `border-dashed ${toneClass("soon")}` : "border-zinc-200 bg-white text-ink"}`}>
        {!empty && breakable(f.value as string)}
        {empty && !check && <span className="text-zinc-500">—</span>}
        {check && <span className="block text-[13px] font-semibold">{t("transcript.checkPortal")}</span>}
      </dd>
    </div>
  );
}

const PREVIEW_SYSTEMS: readonly SystemId[] = ["common_app", "uc", "stars"];

/**
 * The first-run picture: the same example course as View as shows, laid out the way Common App, UC and STARS each ask for it.
 * Read-only (no Copy, no inputs). One line per system when it fits, STARS's seven fields in four columns, two columns on a phone.
 */
export function ExamplePreview() {
  const t = useT();
  return (
    <figure className="min-w-0 space-y-2" aria-labelledby="transcript-preview-caption">
      <figcaption id="transcript-preview-caption" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-ink">
        <span className={`whitespace-nowrap rounded-full border px-2 font-semibold ${toneClass("neutral")}`}>{t("transcript.example")}</span>
        <span>{t("transcript.previewCaption")}</span>
      </figcaption>
      <ul className="space-y-2">
        {PREVIEW_SYSTEMS.map((id) => {
          const layout = LAYOUTS[id];
          const m = mapCourse(id, EXAMPLE_SCHOOL, EXAMPLE_COURSE);
          const oneLine = layout.columns.length <= 6;
          return (
            <li key={id} className="rounded-2xl bg-white p-3 sm:p-4">
              <p className="text-[15px] font-semibold text-ink">{SYSTEMS[id].label}</p>
              <dl
                className={`mt-2 grid grid-cols-2 gap-2 ${oneLine ? "sm:grid-cols-(--row)" : "sm:grid-cols-4"}`}
                style={oneLine ? ({ "--row": layout.columns.map((c) => width(c.key)).join(" ") } as React.CSSProperties) : undefined}
              >
                {layout.columns.map((c) => (
                  <PreviewCell key={c.key} f={field(m, c.key)} label={c.label} />
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

/** The example course as it appears in every system at once: same course, six forms. */
function ExampleRows({ onStart }: { onStart?: () => void }) {
  const t = useT();
  return (
    <section aria-labelledby="view-example" className={`space-y-5 ${PANEL} p-5 sm:p-6`}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <h2 id="view-example" className={SECTION_TITLE}>
            {t("transcript.exampleTitle")}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-ink">{t("transcript.exampleBody")}</p>
        </div>
        {onStart && (
          <button type="button" className={buttonClass("primary", "sm")} onClick={onStart}>
            {t("transcript.exampleCta")}
          </button>
        )}
      </div>
      <ul className="space-y-3" aria-label={t("transcript.exampleTitle")}>
        {SYSTEM_IDS.map((id) => {
          const m = mapCourse(id, EXAMPLE_SCHOOL, EXAMPLE_COURSE);
          return (
            <li key={id} className="rounded-2xl bg-white p-4 sm:p-5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[15px] font-semibold text-ink">{SYSTEMS[id].label}</span>
                <span className="text-[15px] text-zinc-600">{LAYOUTS[id].section}</span>
                <span className={`whitespace-nowrap rounded-full border px-2 text-[13px] font-semibold ${toneClass("neutral")}`}>{t("transcript.example")}</span>
              </p>
              <div className="mt-3">
                <RowGrid layout={LAYOUTS[id]}>
                  {LAYOUTS[id].columns.map((c) => (
                    <Field key={c.key} f={field(m, c.key)} label={c.label} example />
                  ))}
                </RowGrid>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[13px] text-zinc-600">{t("transcript.unverifiedNote")}</p>
    </section>
  );
}

/** The transcript laid out the way each application system asks for it. Read-only except for per-course overrides. */
export function TranscriptMappedView({ onStart }: { onStart?: () => void }) {
  const t = useT();
  const { transcriptSchools, transcriptCourses, ready, updateTranscriptCourse } = useStudent();
  const [system, setSystem] = useState<SystemId>("common_app");
  const [overriding, setOverriding] = useState<{ courseId: string; key: MappedFieldKey } | null>(null);
  const [draft, setDraft] = useState("");
  const layout = LAYOUTS[system];

  function saveOverride(course: TranscriptCourse) {
    if (!overriding) return;
    const key = overriding.key as OverrideField;
    const forSystem = { ...(course.overrides[system] ?? {}) };
    if (draft.trim()) forSystem[key] = draft.trim();
    else delete forSystem[key];
    const overrides = { ...course.overrides, [system]: forSystem };
    if (!Object.keys(forSystem).length) delete overrides[system];
    updateTranscriptCourse(course.id, { overrides });
    setOverriding(null);
  }

  if (!ready) return <div className="h-24 animate-pulse rounded-3xl bg-zinc-100" />;
  if (transcriptSchools.length === 0) return <ExampleRows onStart={onStart} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span id="view-system" className={LABEL}>
          {t("transcript.systemGroupAria")}
        </span>
        <div className={SEGMENT_TRACK} role="group" aria-labelledby="view-system">
          {SYSTEM_IDS.map((id) => (
            <button key={id} type="button" aria-pressed={system === id} className={segmentClass(system === id)} onClick={() => setSystem(id)}>
              {SYSTEMS[id].label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-w-3xl space-y-2">
        <h2 className={SECTION_TITLE}>
          {SYSTEMS[system].label} <span className="text-zinc-500">· {layout.section}</span>
        </h2>
        <p className="text-base leading-relaxed text-ink">{t(layout.banner)}</p>
        <p className="text-[13px] text-zinc-600">{t("transcript.unverifiedNote")}</p>
      </div>

      {transcriptSchools.map((school) => {
        const courses = transcriptCourses.filter((c) => c.schoolId === school.id);
        const mapped = courses
          .sort((a, b) => a.academicYear - b.academicYear || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
          .map((c) => ({ course: c, m: mapCourse(system, school, c) }));
        const groups = [...new Set(mapped.map(({ course, m }) => layout.group(m, course)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        const facts = schoolFacts(system, school, t);
        return (
          <section key={school.id} aria-labelledby={`view-${school.id}`} className={`space-y-4 ${PANEL} p-5 sm:p-6`}>
            <div>
              <h3 id={`view-${school.id}`} className="font-display text-xl font-bold text-ink">
                {school.name}
              </h3>
              {facts.length > 0 && <p className="text-[15px] text-zinc-600">{facts.join(" · ")}</p>}
              {isNonUs(school) && <p className="text-[15px] text-soon">{t("transcript.nonUsNote")}</p>}
            </div>
            {mapped.length === 0 && <p className="rounded-2xl bg-white px-5 py-3 text-[15px] text-ink">{t("transcript.noCoursesForSchool")}</p>}
            {groups.map((g) => (
              <div key={g} className="space-y-2">
                <h4 className={LABEL}>{groupLabel(g, t)}</h4>
                <ul className="space-y-2">
                  {mapped
                    .filter(({ course, m }) => layout.group(m, course) === g)
                    .map(({ course, m }) => (
                      <li key={course.id} className="rounded-2xl bg-white p-4">
                        <RowGrid layout={layout}>
                          {layout.columns.map((c) => {
                            const f = field(m, c.key);
                            if (overriding?.courseId === course.id && overriding.key === c.key) {
                              return (
                                <div key={c.key} className="col-span-full">
                                  <label className="text-[13px] text-zinc-600">
                                    {c.label}
                                    <input aria-label={t("transcript.overrideAria", { label: c.label })} className={fieldClass} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("transcript.overridePh")} />
                                  </label>
                                  <div className="mt-2 flex flex-wrap gap-2">
                                    <button type="button" className={buttonClass("primary", "sm")} onClick={() => saveOverride(course)}>
                                      {t("common.save")}
                                    </button>
                                    <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOverriding(null)}>
                                      {t("common.cancel")}
                                    </button>
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <Field
                                key={c.key}
                                f={f}
                                label={c.label}
                                onOverride={
                                  OVERRIDABLE.includes(c.key)
                                    ? () => {
                                        setOverriding({ courseId: course.id, key: c.key });
                                        setDraft(course.overrides[system]?.[c.key as OverrideField] ?? "");
                                      }
                                    : undefined
                                }
                              />
                            );
                          })}
                        </RowGrid>
                        {m.warnings.length > 0 && (
                          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-[13px] text-soon">
                            {m.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}
