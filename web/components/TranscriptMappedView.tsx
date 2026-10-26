"use client";

import { useState } from "react";
import { fieldClass } from "@/components/TranscriptCourseForm";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { type OverrideField, type TranscriptCourse, type TranscriptSchool } from "@/lib/transcript";
import { mapCourse, SYSTEM_IDS, SYSTEMS, type MappedCourse, type MappedField, type MappedFieldKey, type SystemId } from "@/lib/transcript-maps";
import { isNonUs } from "@/lib/transcript-maps/types";
import { buttonClass, toneClass } from "@/lib/ui";

type Layout = {
  banner: "transcript.bannerCommonApp" | "transcript.bannerStars" | "transcript.bannerCsu" | "transcript.bannerUc" | "transcript.bannerUiuc" | "transcript.bannerUt";
  columns: { key: MappedFieldKey; label: string }[];
  /** The heading a course is listed under. */
  group: (m: MappedCourse, c: TranscriptCourse) => string;
};

const byGradeLevel = (_m: MappedCourse, c: TranscriptCourse) => (c.gradeLevel && c.gradeLevel >= 9 && c.gradeLevel <= 12 ? `${c.gradeLevel}th grade` : "Other courses");
const GROUP_NTH = /^(\d+)th grade$/;
/** Group headings are matched by their English text; only what is displayed is translated. */
function groupLabel(g: string, t: ReturnType<typeof useT>): string {
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

const copy = (v: string) => void navigator.clipboard?.writeText(v).catch(() => {});

/** School-level facts a system asks for, from the transcript's own school record. */
function schoolFacts(system: SystemId, s: TranscriptSchool, t: ReturnType<typeof useT>): string[] {
  const gpaText = `${s.printedGpa}${s.printedGpaScale ? t("transcript.gpaScaleFact", { scale: s.printedGpaScale }) : ""}${s.gpaWeighted == null ? "" : s.gpaWeighted ? t("transcript.weightedFact") : t("transcript.unweightedFact")}`;
  const gpa = s.printedGpa ? t("transcript.gpaFact", { gpa: gpaText }) : "";
  const rank = s.classRank ? t("transcript.rankFact", { rank: s.classRank }) : "";
  if (system === "common_app" || system === "stars") return [gpa, rank].filter(Boolean);
  return [];
}

function Cell({ f, onOverride }: { f: MappedField; onOverride?: () => void }) {
  const t = useT();
  const empty = f.value == null || f.value === "";
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={f.status === "unverified" ? "text-zinc-500 italic" : f.status === "none" ? "text-zinc-400" : ""}>{empty ? "—" : f.value}</span>
        {f.status === "unverified" && (
          <span className={`rounded-full border px-1.5 text-xs font-semibold ${toneClass("soon")}`} title={f.note}>
            {t("transcript.unverified")}
          </span>
        )}
        {f.overridden && <span className={`rounded-full border px-1.5 text-xs font-semibold ${toneClass("progress")}`}>{t("transcript.overridden")}</span>}
        {f.status === "verified" && !empty && (
          <button type="button" className="text-xs text-blue-700 underline underline-offset-2" aria-label={t("transcript.copyAria", { label: f.label, value: f.value as string })} onClick={() => copy(f.value as string)}>
            {t("common.copy")}
          </button>
        )}
        {onOverride && (
          <button type="button" className="text-xs text-blue-700 underline underline-offset-2" aria-label={t("transcript.overrideAria", { label: f.label })} onClick={onOverride}>
            {t("transcript.override")}
          </button>
        )}
      </div>
      {f.status === "none" && f.note && <p className="text-xs text-zinc-500">{f.note}</p>}
      {f.status === "unverified" && f.note && <p className="text-xs text-zinc-500">{f.note}</p>}
    </div>
  );
}

/** The transcript laid out the way each application system asks for it. Read-only except for per-course overrides. */
export function TranscriptMappedView() {
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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2" role="group" aria-label={t("transcript.systemGroupAria")}>
        {SYSTEM_IDS.map((id) => (
          <button key={id} type="button" aria-pressed={system === id} className={buttonClass("secondary", "sm", system === id)} onClick={() => setSystem(id)}>
            {SYSTEMS[id].label}
          </button>
        ))}
      </div>
      <p className="rounded-md bg-zinc-50 p-3 text-sm text-zinc-700">{t(layout.banner)}</p>
      <p className="text-xs text-zinc-500">{t("transcript.unverifiedNote")}</p>

      {!ready ? (
        <div className="h-24 animate-pulse rounded-lg bg-zinc-100" />
      ) : transcriptSchools.length === 0 ? (
        <p className="text-sm text-zinc-500">{t("transcript.addFirst")}</p>
      ) : (
        transcriptSchools.map((school) => {
          const courses = transcriptCourses.filter((c) => c.schoolId === school.id);
          const mapped = courses
            .sort((a, b) => a.academicYear - b.academicYear || a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
            .map((c) => ({ course: c, m: mapCourse(system, school, c) }));
          const groups = [...new Set(mapped.map(({ course, m }) => layout.group(m, course)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
          return (
            <section key={school.id} aria-labelledby={`view-${school.id}`} className="space-y-3 rounded-lg border border-zinc-200 p-5">
              <div>
                <h2 id={`view-${school.id}`} className="font-display text-lg font-bold">
                  {school.name}
                </h2>
                {schoolFacts(system, school, t).length > 0 && <p className="text-sm text-zinc-600">{schoolFacts(system, school, t).join(" · ")}</p>}
                {isNonUs(school) && <p className="text-sm text-soon">{t("transcript.nonUsNote")}</p>}
              </div>
              {mapped.length === 0 && <p className="text-sm text-zinc-500">{t("transcript.noCoursesForSchool")}</p>}
              {groups.map((g) => (
                <div key={g} className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-700">{groupLabel(g, t)}</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[36rem] text-left text-sm">
                      <thead className="text-xs text-zinc-500">
                        <tr>
                          {layout.columns.map((c) => (
                            <th key={c.key} className="p-2">
                              {c.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100">
                        {mapped
                          .filter(({ course, m }) => layout.group(m, course) === g)
                          .map(({ course, m }) => (
                            <tr key={course.id} className="align-top">
                              {layout.columns.map((c) => {
                                const f = field(m, c.key);
                                const isOverriding = overriding?.courseId === course.id && overriding.key === c.key;
                                return (
                                  <td key={c.key} className="p-2">
                                    {isOverriding ? (
                                      <span className="flex items-center gap-1">
                                        <input aria-label={t("transcript.overrideAria", { label: f.label })} className={fieldClass} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("transcript.overridePh")} />
                                        <button type="button" className={buttonClass("primary", "sm")} onClick={() => saveOverride(course)}>
                                          {t("common.save")}
                                        </button>
                                        <button type="button" className={buttonClass("secondary", "sm")} onClick={() => setOverriding(null)}>
                                          {t("common.cancel")}
                                        </button>
                                      </span>
                                    ) : (
                                      <Cell
                                        f={f}
                                        onOverride={
                                          OVERRIDABLE.includes(c.key)
                                            ? () => {
                                                setOverriding({ courseId: course.id, key: c.key });
                                                setDraft(course.overrides[system]?.[c.key as OverrideField] ?? "");
                                              }
                                            : undefined
                                        }
                                      />
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                  {mapped
                    .filter(({ course, m }) => layout.group(m, course) === g && m.warnings.length > 0)
                    .map(({ course, m }) => (
                      <ul key={course.id} className="list-disc pl-5 text-xs text-soon">
                        {m.warnings.map((w) => (
                          <li key={w}>
                            {course.name}: {w}
                          </li>
                        ))}
                      </ul>
                    ))}
                </div>
              ))}
            </section>
          );
        })
      )}
    </div>
  );
}
