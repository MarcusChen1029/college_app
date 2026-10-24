"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { daysUntil } from "@/lib/format";
import { progress, type Checklist } from "@/lib/checklist";
import { hasDecision, isDeadlineDone, RESULT_LABEL, resultStatus, stage } from "@/lib/application";
import { customDeadline, customSummary, isCustomSlug } from "@/lib/custom-college";
import { registerColleges, useStudent, type ListEntry } from "@/lib/student-store";
import { resultTone, stageTone } from "@/lib/status";
import { toneClass } from "@/lib/ui";
import type { CollegeSummary, Deadline, Lookups, ScoreCode } from "@/lib/types";
import { AddCustomCollege } from "./AddCustomCollege";
import { AiContextButton } from "./AiContextButton";
import { FitBadge, TierBadge } from "./badges";
import { ChecklistPanel, SELECT, SELECT_BASE } from "./ChecklistPanel";
import { Modal } from "./Modal";
import { SchoolCodes } from "./SchoolCodes";
import { DeadlineChip, StatusPill } from "./StatusPill";

const noop = () => () => {};

/** In progress → Ready (checklist complete) → Submitted. Decisions are recorded on Results. */
function StatusCell({ entry, name, onSubmit }: { entry: ListEntry; name: string; onSubmit: (submitted: boolean) => void }) {
  if (hasDecision(entry.status)) {
    return (
      <Link href="/application/results" className="hover:underline">
        <StatusPill tone={resultTone(resultStatus(entry.status))}>{RESULT_LABEL[resultStatus(entry.status)]}</StatusPill>
      </Link>
    );
  }
  const st = stage(entry.status, entry.checklist);
  return (
    <select
      className={`${SELECT_BASE} ${toneClass(stageTone(st))}`}
      value={st === "submitted" ? "submitted" : "working"}
      onChange={(e) => onSubmit(e.target.value === "submitted")}
      aria-label={`Status for ${name}`}
      title={st === "in_progress" ? "Finish every checklist item to mark it Ready, then Submitted." : undefined}
    >
      <option value="working">{st === "ready" ? "✓ Ready" : "In progress"}</option>
      <option value="submitted" disabled={st === "in_progress"}>
        Submitted
      </option>
    </select>
  );
}

function ProgressBadge({ checklist }: { checklist: Checklist }) {
  const { done, total, missing } = progress(checklist);
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="tabular-nums text-zinc-600">
        {done}/{total}
      </span>
      <StatusPill tone={missing === 0 ? "done" : "neutral"}>{missing === 0 ? "all done" : `${missing} missing`}</StatusPill>
    </div>
  );
}

export function MyList({
  colleges,
  deadlines,
  plans,
  englishTests,
  codes,
}: {
  colleges: CollegeSummary[];
  deadlines: Deadline[];
  plans: Lookups["plans"];
  englishTests: Lookups["englishTests"];
  codes: ScoreCode[];
}) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return null;

  // Custom colleges have no row in our data; build the same shape from what the student typed.
  const resolve = (e: ListEntry) => (e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug));
  const allDeadlines = [...deadlines, ...student.list.flatMap((e) => (e.custom ? [customDeadline(e.rowId ?? e.slug, e.custom)] : [])).filter((d): d is Deadline => !!d)];
  const listed = student.list.flatMap((e) => colleges.filter((c) => c.slug === e.slug));
  const addCustomButton = (
    <button className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium hover:bg-zinc-100" onClick={() => setAdding(true)}>
      + Custom college
    </button>
  );
  const banner = (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      {student.auth ? (
        <span className="text-zinc-500">
          Synced to <span className="font-medium text-zinc-700">{student.auth.email}</span>
          {student.syncing && " · syncing…"}
        </span>
      ) : (
        <span className="text-zinc-500">
          Saved in this browser only.{" "}
          <Link href="/profile#account" className="text-blue-600 underline">
            Sign in
          </Link>{" "}
          to keep your list on every device.
        </span>
      )}
      <span className="ml-auto flex items-center gap-3">
        <span className="text-xs text-zinc-500">
          <span className={`tabular-nums ${student.canAdd ? "" : "font-medium text-soon"}`}>
            {student.list.length}
            {student.plan.limit != null && ` / ${student.plan.limit}`} colleges
          </span>{" "}
          · {student.plan.name} plan ·{" "}
          <Link href="/pricing" className="text-blue-600 underline">
            {student.plan.key === "senior" ? "Plans" : "Upgrade"}
          </Link>
        </span>
        {addCustomButton}
        {listed.length > 0 && <SchoolCodes colleges={listed} codes={codes} />}
        {student.list.length > 0 && (
          <AiContextButton
            colleges={student.list.flatMap((e) => {
              const college = resolve(e);
              return college ? [{ college, plan: e.plan, status: e.status, checklist: e.checklist }] : [];
            })}
            profile={student.profile}
            plan={student.plan}
            deadlines={allDeadlines}
            lookups={{ plans, englishTests }}
          />
        )}
      </span>
      {student.plan.limit != null && student.list.length > student.plan.limit && (
        <span className={`w-full rounded border px-2 py-1 text-xs ${toneClass("soon")}`}>
          Your list has more colleges than the {student.plan.name} plan allows ({student.plan.limit}). You keep them all, but can&apos;t add more
          until you remove some or upgrade.
        </span>
      )}
      {student.error && (
        <span className={`rounded border px-2 py-0.5 ${toneClass("urgent")}`}>
          {student.error}{" "}
          <button className="underline" onClick={student.clearError}>
            dismiss
          </button>
        </span>
      )}
    </div>
  );

  const entries = student.list
    .map((e) => ({ entry: e, college: resolve(e) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);
  const addDialog = adding && <AddCustomCollege onAdd={student.addCustom} onClose={() => setAdding(false)} />;

  if (entries.length === 0) {
    return (
      <>
      {banner}
      {addDialog}
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        Your list is empty. Add colleges from the{" "}
        <Link href="/colleges" className="text-blue-600 underline">
          Colleges
        </Link>{" "}
        page.
      </p>
      </>
    );
  }

  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fits = new Map(entries.map(({ college }) => [college.slug, hasScores ? computeFit(student.profile, college) : null]));
  const counts = { super_reach: 0, reach: 0, target: 0, safety: 0 };
  fits.forEach((f) => f && counts[f.fit]++);

  // Upcoming dates for listed colleges. If a plan is chosen, show only that plan's application deadline.
  const upcoming = entries
    .flatMap(({ entry, college }) =>
      allDeadlines
        .filter((d) => d.institution_id === college.id && d.due_date && daysUntil(d.due_date) >= 0)
        .filter((d) => d.kind !== "application" || !entry.plan || d.plan_key === entry.plan)
        .map((d) => ({ d, college, entry })),
    )
    .sort((a, b) => a.d.due_date!.localeCompare(b.d.due_date!));

  const opened = entries.find(({ entry }) => entry.slug === openSlug);
  // A custom college doesn't say which plans it offers, so let the student pick any.
  const planOptions = (c: CollegeSummary) => (isCustomSlug(c.slug) ? plans : plans.filter((p) => (c.plans ?? []).includes(p.key)));
  const collegeLink = (c: CollegeSummary, text: string, className: string) =>
    isCustomSlug(c.slug) ? (
      <button className={`${className} text-left`} onClick={() => setOpenSlug(c.slug)}>
        {text}
      </button>
    ) : (
      <Link href={`/colleges/${c.slug}`} className={className}>
        {text}
      </Link>
    );
  const place = (c: CollegeSummary, e: ListEntry) => [c.city, c.state_region, e.custom?.country].filter(Boolean).join(", ");

  return (
    <>
    {banner}
    {addDialog}
    {opened && (
      <Modal
        key={opened.entry.slug}
        onClose={() => setOpenSlug(null)}
        title={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <TierBadge tier={opened.college.general_tier} size="sm" />
            {isCustomSlug(opened.college.slug) ? (
              <span className="text-lg font-semibold">{opened.college.name}</span>
            ) : (
              <Link href={`/colleges/${opened.college.slug}`} className="text-lg font-semibold hover:underline">
                {opened.college.name}
              </Link>
            )}
            {opened.entry.custom?.website && (
              <a href={opened.entry.custom.website} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline">
                Website ↗
              </a>
            )}
            {fits.get(opened.college.slug) && <FitBadge fit={fits.get(opened.college.slug)!.fit} reason={fits.get(opened.college.slug)!.reason} />}
            <ProgressBadge checklist={opened.entry.checklist} />
          </div>
        }
      >
        <ChecklistPanel
          key={student.auth?.userId ?? "local"}
          entry={opened.entry}
          college={opened.college}
          international={!!student.profile.international}
          onChange={(patch) => student.update(opened.entry.slug, patch)}
          onRemove={() => {
            setOpenSlug(null);
            student.remove(opened.entry.slug);
          }}
        />
      </Modal>
    )}
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="p-2">College</th>
              <th className="p-2">Fit</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Status</th>
              <th className="p-2">Checklist</th>
              <th className="w-8 p-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map(({ entry, college }) => {
              const fit = fits.get(college.slug);
              return (
                <tr
                  key={entry.slug}
                  className="cursor-pointer border-t border-zinc-100 hover:bg-zinc-50"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest("a, select, input, button")) setOpenSlug(entry.slug);
                  }}
                >
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={college.general_tier} size="sm" />
                      <div>
                        {collegeLink(college, college.short_name ?? college.name, "font-medium hover:underline")}
                        {entry.custom && (
                          <div className="text-[11px] text-zinc-500">Custom{place(college, entry) && ` · ${place(college, entry)}`}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-2">{fit ? <FitBadge fit={fit.fit} reason={fit.reason} /> : <span className="text-xs text-zinc-400">—</span>}</td>
                  <td className="p-2">
                    <select
                      className={SELECT}
                      value={entry.plan ?? ""}
                      onChange={(e) => student.update(entry.slug, { plan: e.target.value || null })}
                      aria-label={`Plan for ${college.name}`}
                    >
                      <option value="">Undecided</option>
                      {planOptions(college).map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.label}
                          {p.binding ? " (binding)" : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <StatusCell
                      entry={entry}
                      name={college.name}
                      onSubmit={(submitted) => student.update(entry.slug, { status: submitted ? "submitted" : "in_progress" })}
                    />
                  </td>
                  <td className="p-2">
                    <ProgressBadge checklist={entry.checklist} />
                  </td>
                  <td className="p-2 text-right">
                    <button
                      className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                      onClick={() => setOpenSlug(entry.slug)}
                      aria-haspopup="dialog"
                      aria-label={`Open checklist for ${college.name}`}
                    >
                      ▸
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasScores && (
          <p className="border-t border-zinc-100 p-2 text-xs text-zinc-500">
            Balance: {counts.super_reach} super reach · {counts.reach} reach · {counts.target} target · {counts.safety} safety
            {counts.safety === 0 && " — consider adding at least one safety."}
          </p>
        )}
        {entries.filter(({ entry }) => entry.plan === "ED" || entry.plan === "ED2").length > 1 && (
          <p className="border-t border-zinc-100 p-2 text-xs text-urgent">
            You picked Early Decision at more than one college. ED is binding — you can only apply ED to one school per round.
          </p>
        )}
      </div>

      <aside>
        <h2 className="mb-2 font-semibold">Upcoming dates</h2>
        {upcoming.length ? (
          <ol className="space-y-2 text-sm">
            {upcoming.map(({ d, college, entry }) => {
              const days = daysUntil(d.due_date!);
              return (
                <li key={d.id} className="rounded-md border border-zinc-200 p-2">
                  <div>
                    <DeadlineChip date={d.due_date!} days={days} done={isDeadlineDone(d.kind, entry.status, entry.checklist)} />
                  </div>
                  <div>
                    {college.short_name ?? college.name} — {d.label ?? plans.find((p) => p.key === d.plan_key)?.label ?? d.kind}
                  </div>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">No upcoming dates.</p>
        )}
      </aside>
    </div>
    </>
  );
}
