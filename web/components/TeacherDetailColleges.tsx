"use client";

import { TeacherItemActions } from "@/components/classroom/ItemActions";
import { DeadlineChip, StatusPill } from "@/components/StatusPill";
import { checkItemText, essayStatusText, statusText } from "@/components/TeacherText";
import { focusAttr } from "@/lib/anchors";
import { isDeadlineDone } from "@/lib/application";
import { contextFor, courseFor } from "@/lib/application-steps";
import { checklistItems, progress } from "@/lib/checklist";
import { useT } from "@/lib/i18n/client";
import { daysUntil, type DetailCollege, type StudentDetail } from "@/lib/roster";
import { statusLabel, statusTone } from "@/lib/roster-view";
import type { Status } from "@/lib/student-store";

function CollegeCard({ college: c, now }: { college: DetailCollege; now: Date }) {
  const t = useT();
  // The college's own country checklist, the same items and count the student sees.
  const ctx = contextFor(c.slug, c.checklist);
  const items = checklistItems(c.checklist, ctx);
  const { done, total } = progress(c.checklist, ctx);
  // Teachers may see the chosen course (spec A2), nothing else new.
  const course = courseFor(c.slug, c.checklist.course)?.name ?? null;
  // UK, Canadian and Australian checklists have no college essays; an essay_list left on one is not shown.
  const essays = ctx.country === "US" ? (c.checklist.essay_list ?? []).filter((e) => e.title || e.status !== "not_started") : [];
  return (
    <li data-focus={focusAttr({ kind: "college", ref: c.slug })} className="space-y-3 rounded-2xl border border-zinc-200 p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-display text-lg font-bold">
            {c.name} {c.custom && <span className="align-middle text-[13px] font-normal text-zinc-500">{t("teacher.colleges.custom")}</span>}
          </h3>
          {course && <p className="text-sm text-zinc-700 [overflow-wrap:anywhere]">{t("teacher.colleges.course", { name: course })}</p>}
          <p className="text-sm text-zinc-500">{c.plan ? t("teacher.colleges.plan", { plan: c.plan }) : t("teacher.colleges.noPlan")}</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <StatusPill tone={statusTone(c.status, c.checklist, ctx)}>{statusText(t, statusLabel(c.status, c.checklist, ctx))}</StatusPill>
          <TeacherItemActions anchor={{ kind: "college", ref: c.slug }} className="-my-1 -mr-1" />
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold">
          {t("teacher.checklist")} <span className="font-normal text-zinc-500">{t("teacher.colleges.doneCount", { done, total })}</span>
        </h4>
        <ul className="mt-1 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.key} className="flex justify-between gap-3">
              <span className="min-w-0 [overflow-wrap:anywhere]">{checkItemText(t, item, ctx.country)}</span>
              <span className={item.done ? "font-semibold text-done" : "text-zinc-500"}>{item.done ? t("teacher.done") : t("teacher.notDone")}</span>
            </li>
          ))}
        </ul>
      </div>

      {essays.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold">{t("teacher.colleges.essaysFor")}</h4>
          <ul className="mt-1 space-y-0.5 text-sm">
            {essays.map((e, i) => (
              <li key={e.id ?? i} data-focus={e.id ? focusAttr({ kind: "essay", ref: `supp:${c.slug}:${e.id}` }) : undefined} className="flex flex-wrap items-center justify-between gap-x-3">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {e.title || (e.id ? t("teacher.colleges.untitledEssay") : t("teacher.colleges.essay"))} <span className="text-zinc-500">({essayStatusText(t, e.status)})</span>
                </span>
                {e.id && <TeacherItemActions anchor={{ kind: "essay", ref: `supp:${c.slug}:${e.id}` }} className="-my-1 -mr-1" />}
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
    <div className="space-y-3">
      <TeacherItemActions anchor={{ kind: "section", ref: "colleges" }} />
      <ul className="space-y-4" data-focus={focusAttr({ kind: "section", ref: "colleges" })}>
        {detail.colleges.map((c) => (
          <CollegeCard key={c.slug} college={c} now={now} />
        ))}
      </ul>
    </div>
  );
}
