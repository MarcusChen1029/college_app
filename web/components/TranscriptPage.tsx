"use client";

import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { TranscriptCourseForm } from "@/components/TranscriptCourseForm";
import { TranscriptImport } from "@/components/TranscriptImport";
import { ExamplePreview, TranscriptMappedView } from "@/components/TranscriptMappedView";
import { TranscriptSchoolForm } from "@/components/TranscriptSchoolForm";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import {
  courseIssues,
  courseStatus,
  emptyCourse,
  emptySchool,
  KIND_LABEL,
  LEVEL_LABEL,
  PERIOD_LABEL,
  SUB_SUBJECT_LABEL,
  SUBJECT_LABEL,
  type TranscriptCourse,
  type TranscriptSchool,
} from "@/lib/transcript";
import { buttonClass, PAGE_INTRO, PANEL, SEGMENT_TRACK, segmentClass, toneClass } from "@/lib/ui";
import { EmptyNote } from "./EmptyState";

type Tab = "edit" | "import" | "view";
const TABS: readonly [Tab, "transcript.tabEdit" | "transcript.tabImport" | "transcript.tabView"][] = [
  ["edit", "transcript.tabEdit"],
  ["import", "transcript.tabImport"],
  ["view", "transcript.tabView"],
];

type T = ReturnType<typeof useT>;

/** The grades as printed: one entry per term, then the final grade. */
function gradesText(c: TranscriptCourse, t: T): string {
  const parts = c.terms.map((tm) => `${tm.term} ${tm.grade || termStatusText(tm.status, t).toLowerCase()}`);
  if (c.finalGrade) parts.push(c.terms.length ? t("transcript.final", { grade: c.finalGrade }) : c.finalGrade);
  return parts.length ? parts.join(" · ") : t("transcript.noGradesYet");
}

const TERM_STATUS_KEY = {
  graded: "transcript.statusGraded",
  in_progress: "transcript.statusInProgress",
  planned: "transcript.statusPlanned",
  none: "transcript.statusNone",
} as const;
const termStatusText = (s: keyof typeof TERM_STATUS_KEY, t: T) => t(TERM_STATUS_KEY[s]);

const STATUS_TONE = { graded: "done", in_progress: "progress", planned: "neutral" } as const;

function CourseRow({ course, school, year, onEdit, onRemove }: { course: TranscriptCourse; school: TranscriptSchool; year?: string; onEdit: () => void; onRemove: () => void }) {
  const t = useT();
  const status = courseStatus(course);
  const issues = courseIssues(course);
  void school;
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          {year && <p className="text-[13px] font-semibold text-zinc-600">{year}</p>}
          <p className="font-medium">
            {course.name}
            {course.isSummer && <span className="text-sm font-normal text-zinc-500"> · {t("transcript.summer")}</span>}
            {course.isRepeat && <span className="text-sm font-normal text-zinc-500"> · {t("transcript.repeat")}</span>}
            {course.isCollege && <span className="text-sm font-normal text-zinc-500"> · {t("transcript.college")}{course.collegeName ? `: ${course.collegeName}` : ""}</span>}
            {course.isWithdrawn && <span className="text-sm font-normal text-zinc-500"> · {t("transcript.withdrawn")}</span>}
          </p>
          <p className="text-sm text-zinc-600">
            {LEVEL_LABEL[course.level]} · {SUBJECT_LABEL[course.subject]}
            {course.subSubject ? ` (${SUB_SUBJECT_LABEL[course.subSubject] ?? course.subSubject})` : ""} · {PERIOD_LABEL[course.period]}
            {course.credit != null ? ` · ${t("transcript.creditAmount", { credit: course.credit })}` : ""}
          </p>
          <p className="text-sm">{gradesText(course, t)}</p>
          {course.notes && <p className="text-[13px] text-zinc-600">{course.notes}</p>}
          {issues.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-sm text-urgent">
              {issues.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {course.source !== "manual" && (
            <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-[13px] font-semibold ${toneClass("neutral")}`} title={course.source === "mcp" ? t("transcript.aiMcp") : t("transcript.aiImport")}>
              AI
            </span>
          )}
          {issues.length > 0 ? <StatusPill tone="urgent">{t("transcript.missingGrade")}</StatusPill> : <StatusPill tone={STATUS_TONE[status]}>{termStatusText(status, t)}</StatusPill>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass("ghost", "sm")} aria-label={t("transcript.editCourseAria", { name: course.name })} onClick={onEdit}>
          {t("common.edit")}
        </button>
        <button type="button" className={buttonClass("ghost", "sm")} aria-label={t("transcript.removeCourseAria", { name: course.name })} onClick={onRemove}>
          {t("transcript.remove")}
        </button>
      </div>
    </li>
  );
}

function SchoolSection({ school }: { school: TranscriptSchool }) {
  const t = useT();
  const { transcriptCourses, updateTranscriptSchool, removeTranscriptSchool, addTranscriptCourses, updateTranscriptCourse, removeTranscriptCourse } = useStudent();
  const [editingSchool, setEditingSchool] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const courses = transcriptCourses.filter((c) => c.schoolId === school.id);
  // Courses with a missing required grade float to the top until fixed, then drop back into their year.
  const flagged = courses.filter((c) => courseIssues(c).length > 0).sort((a, b) => a.academicYear - b.academicYear || a.sortOrder - b.sortOrder);
  const rest = courses.filter((c) => !flagged.includes(c));
  const years = [...new Set(rest.map((c) => c.academicYear))].sort((a, b) => a - b);
  const nextOrder = courses.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;

  const yearLabel = (year: number) => `${year}-${String((year + 1) % 100).padStart(2, "0")}`;

  const row = (c: TranscriptCourse, year?: string) =>
    editing === c.id ? (
      <li key={c.id} className="p-4">
        <TranscriptCourseForm
          initial={c}
          school={school}
          submitLabel={t("transcript.saveCourse")}
          onSave={(v) => {
            updateTranscriptCourse(c.id, v);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      </li>
    ) : (
      <CourseRow
        key={c.id}
        course={c}
        school={school}
        year={year}
        onEdit={() => setEditing(c.id)}
        onRemove={() => {
          if (confirm(t("transcript.confirmRemoveCourse", { name: c.name }))) removeTranscriptCourse(c.id);
        }}
      />
    );

  function removeSchool() {
    if (!confirm(courses.length === 1 ? t("transcript.confirmRemoveSchool", { name: school.name, n: courses.length }) : t("transcript.confirmRemoveSchoolMany", { name: school.name, n: courses.length }))) return;
    removeTranscriptSchool(school.id);
  }

  return (
    <section aria-labelledby={`school-${school.id}`} className={`space-y-3 ${PANEL} p-5 sm:p-6`}>
      {editingSchool ? (
        <TranscriptSchoolForm
          initial={school}
          submitLabel={t("transcript.saveSchool")}
          onSave={(v) => {
            updateTranscriptSchool(school.id, v);
            setEditingSchool(false);
          }}
          onCancel={() => setEditingSchool(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id={`school-${school.id}`} className="font-display text-xl font-bold text-ink">
              {school.name}
            </h2>
            <p className="text-[15px] text-zinc-600">
              {[KIND_LABEL[school.kind], school.country, school.printedGpa ? `GPA ${school.printedGpa}${school.printedGpaScale ? ` / ${school.printedGpaScale}` : ""}` : "", school.classRank ? t("transcript.rank", { rank: school.classRank }) : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass("secondary", "sm")} aria-label={t("transcript.editSchoolAria", { name: school.name })} onClick={() => setEditingSchool(true)}>
              {t("transcript.editSchool")}
            </button>
            <button type="button" className={buttonClass("danger", "sm")} aria-label={t("transcript.removeSchoolAria", { name: school.name })} onClick={removeSchool}>
              {t("transcript.removeSchool")}
            </button>
          </div>
        </div>
      )}

      {flagged.length > 0 && (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-urgent">
            {t("transcript.needsGrade", { n: flagged.length })} <span className="font-normal text-zinc-600">{t("transcript.needsGradeHint")}</span>
          </h3>
          <ul className="divide-y divide-urgent-line rounded-2xl border border-urgent-line bg-urgent-bg" aria-label={t("transcript.missingGradeList")}>
            {flagged.map((c) => row(c, yearLabel(c.academicYear)))}
          </ul>
        </div>
      )}
      {courses.length === 0 && !adding && <EmptyNote on="panel">{t("transcript.noCourses")}</EmptyNote>}
      {years.map((year) => (
        <div key={year} className="space-y-1">
          <h3 className="text-[15px] font-semibold text-ink">{yearLabel(year)}</h3>
          <ul className="divide-y divide-zinc-100 rounded-2xl bg-white">
            {rest
              .filter((c) => c.academicYear === year)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((c) => row(c))}
          </ul>
        </div>
      ))}

      {adding ? (
        <div className="rounded-2xl bg-white p-4">
          <TranscriptCourseForm
            initial={{ ...emptyCourse(school.id, school), sortOrder: nextOrder }}
            school={school}
            submitLabel={t("transcript.addCourseSubmit")}
            onSave={(v) => {
              addTranscriptCourses(school.id, [{ ...v, sortOrder: nextOrder }], "manual");
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setAdding(true)}>
          {t("transcript.addCourseButton")}
        </button>
      )}
    </section>
  );
}

function EditTab({ onImport }: { onImport: () => void }) {
  const t = useT();
  const { transcriptSchools, ready, addTranscriptSchool } = useStudent();
  const [addingSchool, setAddingSchool] = useState(false);
  const empty = ready && transcriptSchools.length === 0;
  return (
    <div className="space-y-5">
      {!ready ? (
        <div className="h-24 animate-pulse rounded-3xl bg-zinc-100" />
      ) : empty && !addingSchool ? (
        // EmptyState's look (sky field, title, one sentence, the next steps), with the example preview where its doodle would be:
        // EmptyState's art slot is a fixed-height decorative box, too small for three form rows and hidden from screen readers.
        <section aria-labelledby="transcript-first-run" className="grid gap-8 rounded-3xl bg-blue-50 px-6 py-8 sm:px-10 sm:py-10 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] xl:items-start xl:gap-10">
          <div>
            <h2 id="transcript-first-run" className="font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
              {t("transcript.emptyTitle")}
            </h2>
            <p className="mt-3 text-base leading-relaxed text-ink">{t("transcript.emptyBody")}</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <button type="button" className={buttonClass("primary")} onClick={() => setAddingSchool(true)}>
                {t("transcript.addSchoolButton")}
              </button>
              <button type="button" className={buttonClass("secondary")} onClick={onImport}>
                {t("transcript.importWithAi")}
              </button>
            </div>
          </div>
          <ExamplePreview />
        </section>
      ) : (
        transcriptSchools.map((s) => <SchoolSection key={s.id} school={s} />)
      )}
      {addingSchool ? (
        <section aria-labelledby="school-add" className={`space-y-3 ${PANEL} p-5 sm:p-6`}>
          <h2 id="school-add" className="font-display text-xl font-bold text-ink">
            {t("transcript.addSchoolHeading")}
          </h2>
          <TranscriptSchoolForm
            initial={emptySchool()}
            submitLabel={t("transcript.addSchoolSubmit")}
            onSave={(v) => {
              addTranscriptSchool(v);
              setAddingSchool(false);
            }}
            onCancel={() => setAddingSchool(false)}
          />
        </section>
      ) : (
        ready &&
        !empty && (
          <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAddingSchool(true)}>
            {t("transcript.addSchoolButton")}
          </button>
        )
      )}
    </div>
  );
}

/** The student's standardized transcript. Private: teachers never see it. */
export function TranscriptPage() {
  const t = useT();
  const { error, clearError } = useStudent();
  const [tab, setTab] = useState<Tab>("edit");
  return (
    <div className="space-y-5">
      <p className={PAGE_INTRO}>{t("transcript.intro")}</p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("transcript.dismiss")}
          </button>
        </p>
      )}
      <div className={SEGMENT_TRACK} role="group" aria-label={t("transcript.viewsLabel")}>
        {TABS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} className={segmentClass(tab === key)} onClick={() => setTab(key)}>
            {t(label)}
          </button>
        ))}
      </div>
      {tab === "edit" && <EditTab onImport={() => setTab("import")} />}
      {tab === "import" && <TranscriptImport onDone={() => setTab("edit")} />}
      {tab === "view" && <TranscriptMappedView onStart={() => setTab("edit")} />}
    </div>
  );
}
