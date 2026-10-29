"use client";

import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { checkText, essayStatusText, statusText } from "@/components/TeacherText";
import { isDeadlineDone } from "@/lib/application";
import { CHECKLIST, isDone, progress } from "@/lib/checklist";
import { useT } from "@/lib/i18n/client";
import { daysUntil, type DetailCollege, type StudentDetail } from "@/lib/roster";
import { statusLabel, statusTone } from "@/lib/roster-view";
import type { Status } from "@/lib/student-store";

function CollegeCard({ college: c, now }: { college: DetailCollege; now: Date }) {
  const t = useT();
  const { done, total } = progress(c.checklist);
  const essays = (c.checklist.essay_list ?? []).filter((e) => e.title || e.status !== "not_started");
  return (
    <li className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">
            {c.name} {c.custom && <span className="align-middle text-[13px] font-normal text-zinc-500">{t("teacher.colleges.custom")}</span>}
          </h3>
          <p className="text-sm text-zinc-500">{c.plan ? t("teacher.colleges.plan", { plan: c.plan }) : t("teacher.colleges.noPlan")}</p>
        </div>
        <StatusPill tone={statusTone(c.status, c.checklist)}>{statusText(t, statusLabel(c.status, c.checklist))}</StatusPill>
      </div>

      <div>
        <h4 className="text-sm font-semibold">
          {t("teacher.checklist")} <span className="font-normal text-zinc-500">{t("teacher.colleges.doneCount", { done, total })}</span>
        </h4>
        <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {CHECKLIST.map(([key, label]) => (
            <li key={key} className="flex justify-between gap-3">
              <span>{checkText(t, label)}</span>
              <span className={isDone(key, c.checklist) ? "font-semibold text-done" : "text-zinc-500"}>{isDone(key, c.checklist) ? t("teacher.done") : t("teacher.notDone")}</span>
            </li>
          ))}
        </ul>
      </div>

      {essays.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">{t("teacher.colleges.essaysFor")}</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {essays.map((e, i) => (
              <li key={e.id ?? i}>
                {e.title || (e.id ? t("teacher.colleges.untitledEssay") : t("teacher.colleges.essay"))} <span className="text-zinc-500">({essayStatusText(t, e.status)})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="text-sm font-semibold">{t("teacher.colleges.deadlinesAhead")}</h4>
        {c.deadlines.length === 0 ? (
          <p className="mt-1 text-sm text-zinc-500">{t("teacher.colleges.noneComing")}</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-sm">
            {c.deadlines.map((d) => {
              const days = daysUntil(d.dueDate, now);
              return (
                <li key={`${d.kind}-${d.dueDate}-${d.label}`} className="flex flex-wrap items-center gap-2">
                  <DeadlineChip date={d.dueDate} days={days} done={isDeadlineDone(d.kind, c.status as Status)} />
                  <span>
                    {d.label}
                    {d.plan ? ` (${d.plan})` : ""}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

export function CollegesPanel({ detail, now }: { detail: StudentDetail; now: Date }) {
  const t = useT();
  if (detail.colleges.length === 0) return <p className="text-sm text-zinc-500">{t("teacher.colleges.empty", { name: detail.displayName })}</p>;
  return (
    <ul className="space-y-4">
      {detail.colleges.map((c) => (
        <CollegeCard key={c.slug} college={c} now={now} />
      ))}
    </ul>
  );
}
