"use client";

import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { TranscriptCourseForm } from "@/components/TranscriptCourseForm";
import { TranscriptImport } from "@/components/TranscriptImport";
import { TranscriptSchoolForm } from "@/components/TranscriptSchoolForm";
import { useStudent } from "@/lib/student-store";
import {
  courseStatus,
  emptyCourse,
  emptySchool,
  KIND_LABEL,
  LEVEL_LABEL,
  PERIOD_LABEL,
  SUB_SUBJECT_LABEL,
  SUBJECT_LABEL,
  TERM_STATUS_LABEL,
  type TranscriptCourse,
  type TranscriptSchool,
} from "@/lib/transcript";
import { toneClass, buttonClass } from "@/lib/ui";

type Tab = "edit" | "import" | "view";
const TABS: readonly [Tab, string][] = [
  ["edit", "Edit"],
  ["import", "Import"],
  ["view", "View as"],
];

/** The grades as printed: one entry per term, then the final grade. */
function gradesText(c: TranscriptCourse): string {
  const parts = c.terms.map((t) => `${t.term} ${t.grade || TERM_STATUS_LABEL[t.status].toLowerCase()}`);
  if (c.finalGrade) parts.push(c.terms.length ? `Final ${c.finalGrade}` : c.finalGrade);
  return parts.length ? parts.join(" · ") : "No grades yet";
}

const STATUS_TONE = { graded: "done", in_progress: "progress", planned: "neutral" } as const;
const STATUS_LABEL = { graded: "Graded", in_progress: "In progress", planned: "Planned" } as const;

function CourseRow({ course, school, onEdit, onRemove }: { course: TranscriptCourse; school: TranscriptSchool; onEdit: () => void; onRemove: () => void }) {
  const status = courseStatus(course);
  void school;
  return (
    <li className="space-y-2 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {course.name}
            {course.isSummer && <span className="text-sm font-normal text-zinc-500"> · Summer</span>}
            {course.isRepeat && <span className="text-sm font-normal text-zinc-500"> · Repeat</span>}
            {course.isCollege && <span className="text-sm font-normal text-zinc-500"> · College{course.collegeName ? `: ${course.collegeName}` : ""}</span>}
            {course.isWithdrawn && <span className="text-sm font-normal text-zinc-500"> · Withdrawn</span>}
          </p>
          <p className="text-sm text-zinc-600">
            {LEVEL_LABEL[course.level]} · {SUBJECT_LABEL[course.subject]}
            {course.subSubject ? ` (${SUB_SUBJECT_LABEL[course.subSubject] ?? course.subSubject})` : ""} · {PERIOD_LABEL[course.period]}
            {course.credit != null ? ` · ${course.credit} credit` : ""}
          </p>
          <p className="text-sm">{gradesText(course)}</p>
          {course.notes && <p className="text-xs text-zinc-500">{course.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {course.source !== "manual" && (
            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClass("neutral")}`} title={course.source === "mcp" ? "Added by an AI through Connect AI" : "Imported from an AI's answer"}>
              AI
            </span>
          )}
          <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={buttonClass("secondary", "sm")} aria-label={`Edit ${course.name}`} onClick={onEdit}>
          Edit
        </button>
        <button type="button" className={buttonClass("danger", "sm")} aria-label={`Remove ${course.name}`} onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

function SchoolSection({ school }: { school: TranscriptSchool }) {
  const { transcriptCourses, updateTranscriptSchool, removeTranscriptSchool, addTranscriptCourses, updateTranscriptCourse, removeTranscriptCourse } = useStudent();
  const [editingSchool, setEditingSchool] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const courses = transcriptCourses.filter((c) => c.schoolId === school.id);
  const years = [...new Set(courses.map((c) => c.academicYear))].sort((a, b) => a - b);
  const nextOrder = courses.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1;

  function removeSchool() {
    if (!confirm(`Remove ${school.name} and its ${courses.length} course${courses.length === 1 ? "" : "s"} from your transcript?`)) return;
    removeTranscriptSchool(school.id);
  }

  return (
    <section aria-labelledby={`school-${school.id}`} className="space-y-3 rounded-lg border border-zinc-200 p-5">
      {editingSchool ? (
        <TranscriptSchoolForm
          initial={school}
          submitLabel="Save school"
          onSave={(v) => {
            updateTranscriptSchool(school.id, v);
            setEditingSchool(false);
          }}
          onCancel={() => setEditingSchool(false)}
        />
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 id={`school-${school.id}`} className="font-display text-lg font-bold">
              {school.name}
            </h2>
            <p className="text-sm text-zinc-600">
              {[KIND_LABEL[school.kind], school.country, school.printedGpa ? `GPA ${school.printedGpa}${school.printedGpaScale ? ` / ${school.printedGpaScale}` : ""}` : "", school.classRank ? `Rank ${school.classRank}` : ""]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={buttonClass("secondary", "sm")} aria-label={`Edit ${school.name}`} onClick={() => setEditingSchool(true)}>
              Edit school
            </button>
            <button type="button" className={buttonClass("danger", "sm")} aria-label={`Remove ${school.name}`} onClick={removeSchool}>
              Remove school
            </button>
          </div>
        </div>
      )}

      {years.length === 0 && !adding && <p className="text-sm text-zinc-500">No courses yet for this school.</p>}
      {years.map((year) => (
        <div key={year} className="space-y-1">
          <h3 className="text-sm font-semibold text-zinc-700">
            {year}-{String((year + 1) % 100).padStart(2, "0")}
          </h3>
          <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
            {courses
              .filter((c) => c.academicYear === year)
              .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
              .map((c) =>
                editing === c.id ? (
                  <li key={c.id} className="p-4">
                    <TranscriptCourseForm
                      initial={c}
                      school={school}
                      submitLabel="Save course"
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
                    onEdit={() => setEditing(c.id)}
                    onRemove={() => {
                      if (confirm(`Remove ${c.name} from your transcript?`)) removeTranscriptCourse(c.id);
                    }}
                  />
                ),
              )}
          </ul>
        </div>
      ))}

      {adding ? (
        <div className="rounded-lg border border-zinc-200 p-4">
          <TranscriptCourseForm
            initial={{ ...emptyCourse(school.id, school), sortOrder: nextOrder }}
            school={school}
            submitLabel="Add course"
            onSave={(v) => {
              addTranscriptCourses(school.id, [{ ...v, sortOrder: nextOrder }], "manual");
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : (
        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setAdding(true)}>
          Add a course
        </button>
      )}
    </section>
  );
}

function EditTab() {
  const { transcriptSchools, ready, addTranscriptSchool } = useStudent();
  const [addingSchool, setAddingSchool] = useState(false);
  return (
    <div className="space-y-5">
      {!ready ? (
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
      ) : transcriptSchools.length === 0 && !addingSchool ? (
        <p className="text-sm text-zinc-500">No transcript yet. Add a school, then its courses, or use the Import tab to have an AI do the typing.</p>
      ) : (
        transcriptSchools.map((s) => <SchoolSection key={s.id} school={s} />)
      )}
      {addingSchool ? (
        <section aria-labelledby="school-add" className="space-y-3 rounded-lg border border-zinc-200 p-5">
          <h2 id="school-add" className="font-display text-lg font-bold">
            Add a school
          </h2>
          <TranscriptSchoolForm
            initial={emptySchool()}
            submitLabel="Add school"
            onSave={(v) => {
              addTranscriptSchool(v);
              setAddingSchool(false);
            }}
            onCancel={() => setAddingSchool(false)}
          />
        </section>
      ) : (
        <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAddingSchool(true)}>
          Add a school
        </button>
      )}
    </div>
  );
}

/** The student's standardized transcript. Private: teachers never see it. */
export function TranscriptPage() {
  const { error, clearError } = useStudent();
  const [tab, setTab] = useState<Tab>("edit");
  return (
    <div className="space-y-5">
      <p className="text-sm text-zinc-500">
        Keep one standardized record of your coursework. Grades are stored exactly as printed on your transcript and never converted. This record is private to you; teachers and counselors you link to cannot see it.
      </p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            Dismiss
          </button>
        </p>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Transcript views">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={tab === key} className={buttonClass("secondary", "sm", tab === key)} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </div>
      {tab === "edit" && <EditTab />}
      {tab === "import" && <TranscriptImport onDone={() => setTab("edit")} />}
      {tab === "view" && <p className="text-sm text-zinc-500">Mapped views are coming in a later step.</p>}
    </div>
  );
}
