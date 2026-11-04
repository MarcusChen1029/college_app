"use client";

import { collegeSteps, courseFor, courseOfferParts } from "@/lib/application-steps";
import type { Checklist, Intake } from "@/lib/checklist";
import { fmtDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { ListEntry } from "@/lib/student-store";

const SELECT =
  "h-8 w-full max-w-[16rem] cursor-pointer rounded-full border border-zinc-300 bg-white pl-3 pr-2 text-[13px] text-ink hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

/**
 * The course (and, for Australia, the intake) of a saved UK, Canadian or Australian college. Stored in the checklist jsonb as
 * `course` (program slug, null = not decided) and `intake`; every write spreads the stored checklist so other keys survive.
 * Renders nothing for a US or custom college.
 */
export function CoursePicker({ entry, onChange }: { entry: ListEntry; onChange: (checklist: Checklist) => void }) {
  const t = useT();
  const steps = collegeSteps(entry.slug);
  if (!steps) return null;
  const c = entry.checklist;
  const course = courseFor(entry.slug, c.course);
  const country = steps.country;
  const intake: Intake | null = country === "AU" ? (c.intake ?? null) : null;
  // Course dates in the data are the main (Semester 1 / September) round, so Semester 2 shows none.
  const deadline = course?.applicationDeadline && intake !== "s2" ? fmtDate(course.applicationDeadline) : null;
  const offers = course ? courseOfferParts(course) : [];

  // Official offer text can run to several sentences (UBC, Melbourne): the row shows three lines, the full text is the tooltip.
  const details = course
    ? [
        ...(course.ucasCode ? [t("application.course.ucas", { code: course.ucasCode })] : []),
        ...offers.map((o) => t(`application.course.offer.${o.kind}` as MessageKey, { text: o.text })),
        ...(course.admissionsTest ? [t("application.course.test", { text: course.admissionsTest })] : []),
        ...(deadline ? [t(country === "AU" ? "application.course.deadlineS1" : "application.course.deadline", { date: deadline })] : []),
      ]
    : [];

  return (
    <div className="mt-1.5 space-y-1 text-[13px] text-zinc-700">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <select
          className={SELECT}
          value={course ? course.slug : ""}
          onChange={(e) => onChange({ ...c, course: e.target.value || null })}
          aria-label={t("application.course.label")}
        >
          <option value="">{t("application.course.notDecided")}</option>
          {steps.courses.map((x) => (
            <option key={x.slug} value={x.slug}>
              {x.name}
            </option>
          ))}
        </select>
        {country === "AU" ? (
          <select
            className={`${SELECT} max-w-[12rem]`}
            value={intake ?? ""}
            onChange={(e) => onChange({ ...c, intake: (e.target.value || null) as Intake | null })}
            aria-label={t("application.course.intakeLabel")}
          >
            <option value="">{t("application.course.intakeNone")}</option>
            <option value="s1">{t("application.course.intakeS1")}</option>
            <option value="s2">{t("application.course.intakeS2")}</option>
          </select>
        ) : (
          <span>{t("application.course.september")}</span>
        )}
      </div>
      {country === "GB" && <p className="text-xs text-zinc-600">{t("application.course.oneCourse")}</p>}
      {course && (
        <p data-course-summary className="line-clamp-3 leading-snug" title={details.join(" · ")}>
          <span className="font-semibold text-ink">{course.name}</span>
          {details.map((d) => ` · ${d}`)}
        </p>
      )}
    </div>
  );
}
