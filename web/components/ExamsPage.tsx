"use client";

import { useState } from "react";
import { ExamCard } from "@/components/ExamCard";
import { ExamForm } from "@/components/ExamForm";
import { EXAM_LIMITS, groupEntries, type ExamSystem } from "@/lib/exams";
import { useT } from "@/lib/i18n/client";
import { localDate } from "@/lib/roster";
import { useStudent } from "@/lib/student-store";
import { buttonClass, PAGE_INTRO, PANEL } from "@/lib/ui";

const QUICK_STARTS: readonly [ExamSystem, "exams.quickAp" | "exams.quickIb" | "exams.quickAlevel"][] = [
  ["ap", "exams.quickAp"],
  ["ib", "exams.quickIb"],
  ["a_level", "exams.quickAlevel"],
];

/**
 * Materials > Exams: the student's exam results by curriculum, predicted and final grades side by side (spec
 * docs/superpowers/specs/2026-11-05-exams-page-design.md). Private: no teacher, parent or AI view reads it.
 */
export function ExamsPage() {
  const t = useT();
  const { exams, examsAvailable, auth, ready, error, clearError, addExam } = useStudent();
  // The form's curriculum when adding; null = closed.
  const [adding, setAdding] = useState<ExamSystem | null>(null);
  const [today] = useState(() => localDate(new Date()));
  const groups = groupEntries(exams.entries);
  const full = exams.entries.length >= EXAM_LIMITS.entries;
  const empty = exams.entries.length === 0;
  // Editing what the account has needs its copy: while it can't be read, nothing is shown or saved here.
  const locked = !!auth && !examsAvailable;

  return (
    <div className="space-y-5">
      <p className={PAGE_INTRO}>{t("exams.intro")}</p>
      {error && (
        <p role="alert" className="text-sm text-urgent">
          {error}{" "}
          <button type="button" className="underline" onClick={clearError}>
            {t("exams.dismiss")}
          </button>
        </p>
      )}
      {!ready ? (
        <div className="h-24 animate-pulse rounded-3xl bg-zinc-100" />
      ) : locked ? (
        <p className={`${PANEL} p-5 text-[15px] text-ink sm:p-6`}>{t("exams.unavailable")}</p>
      ) : (
        <>
          {adding ? (
            <section className={`${PANEL} p-5 sm:p-6`}>
              <ExamForm
                key={adding}
                initial={{ system: adding }}
                heading={t("exams.formAdd")}
                submitLabel={t("exams.add")}
                onSave={(v) => {
                  const ok = addExam(v) !== null;
                  if (ok) setAdding(null);
                  return ok;
                }}
                onCancel={() => setAdding(null)}
              />
            </section>
          ) : empty ? (
            <section aria-labelledby="exams-first-run" className="rounded-3xl bg-blue-50 px-6 py-8 sm:px-10 sm:py-10">
              <h2 id="exams-first-run" className="font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[28px]">
                {t("exams.emptyTitle")}
              </h2>
              <p className="mt-3 max-w-2xl text-base leading-relaxed text-ink">{t("exams.emptyBody")}</p>
              <div className="mt-6 flex flex-wrap gap-3">
                {QUICK_STARTS.map(([system, label], i) => (
                  <button key={system} type="button" className={buttonClass(i === 0 ? "primary" : "secondary")} onClick={() => setAdding(system)}>
                    {t(label)}
                  </button>
                ))}
                <button type="button" className={buttonClass("quiet")} onClick={() => setAdding("other")}>
                  {t("exams.add")}
                </button>
              </div>
            </section>
          ) : full ? (
            <p className="text-sm text-zinc-600">{t("exams.limit", { n: exams.entries.length })}</p>
          ) : (
            <button type="button" className={buttonClass("primary", "sm")} onClick={() => setAdding(groups[0]?.system ?? "ap")}>
              {t("exams.add")}
            </button>
          )}
          {groups.map((g) => (
            <ExamCard key={g.key} system={g.system} title={g.title} entries={g.entries} today={today} />
          ))}
        </>
      )}
    </div>
  );
}
