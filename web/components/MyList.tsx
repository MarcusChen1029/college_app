"use client";

import Link from "next/link";
import { Fragment, useEffect, useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { daysUntil, fmtDate } from "@/lib/format";
import { CHECKLIST, registerColleges, STATUSES, useStudent, type Status } from "@/lib/student-store";
import type { CollegeSummary, Deadline, Lookups } from "@/lib/types";
import { FitBadge, Pill, TierBadge } from "./badges";

const noop = () => () => {};

const STATUS_LABEL: Record<Status, string> = {
  researching: "Researching",
  planning: "Planning",
  in_progress: "In progress",
  submitted: "Submitted",
  interview: "Interview",
  admitted: "Admitted",
  deferred: "Deferred",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  enrolled: "Enrolled",
};

export function MyList({ colleges, deadlines, plans }: { colleges: CollegeSummary[]; deadlines: Deadline[]; plans: Lookups["plans"] }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return null;

  const banner = (
    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
      {student.auth ? (
        <span className="text-zinc-500">
          Synced to <span className="font-medium text-zinc-700 dark:text-zinc-200">{student.auth.email}</span>
          {student.syncing && " · syncing…"}
        </span>
      ) : (
        <span className="text-zinc-500">
          Saved in this browser only.{" "}
          <Link href="/account" className="text-blue-600 underline dark:text-blue-400">
            Sign in
          </Link>{" "}
          to keep your list on every device.
        </span>
      )}
      {student.error && (
        <span className="rounded bg-rose-50 px-2 py-0.5 text-rose-700 dark:bg-rose-950 dark:text-rose-200">
          {student.error}{" "}
          <button className="underline" onClick={student.clearError}>
            dismiss
          </button>
        </span>
      )}
    </div>
  );

  const entries = student.list
    .map((e) => ({ entry: e, college: colleges.find((c) => c.slug === e.slug) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);

  if (entries.length === 0) {
    return (
      <>
      {banner}
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Your list is empty. Add colleges from the{" "}
        <Link href="/" className="text-blue-600 underline dark:text-blue-400">
          Colleges
        </Link>{" "}
        page.
      </p>
      </>
    );
  }

  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fits = new Map(entries.map(({ college }) => [college.slug, hasScores ? computeFit(student.profile, college) : null]));
  const counts = { reach: 0, target: 0, safety: 0 };
  fits.forEach((f) => f && counts[f.fit]++);

  // Upcoming dates for listed colleges. If a plan is chosen, show only that plan's application deadline.
  const upcoming = entries
    .flatMap(({ entry, college }) =>
      deadlines
        .filter((d) => d.institution_id === college.id && d.due_date && daysUntil(d.due_date) >= 0)
        .filter((d) => d.kind !== "application" || !entry.plan || d.plan_key === entry.plan)
        .map((d) => ({ d, college })),
    )
    .sort((a, b) => a.d.due_date!.localeCompare(b.d.due_date!));

  const planOptions = (c: CollegeSummary) => plans.filter((p) => (c.plans ?? []).includes(p.key));

  return (
    <>
    {banner}
    <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="p-2">College</th>
              <th className="p-2">Fit</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Status</th>
              <th className="p-2">Checklist</th>
              <th className="p-2">Notes</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {entries.map(({ entry, college }) => {
              const fit = fits.get(college.slug);
              const done = CHECKLIST.filter(([k]) => entry.checklist[k]).length;
              return (
                <Fragment key={entry.slug}>
                <tr className="border-t border-zinc-100 align-top dark:border-zinc-800">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={college.general_tier} size="sm" />
                      <Link href={`/colleges/${college.slug}`} className="font-medium hover:underline">
                        {college.short_name ?? college.name}
                      </Link>
                    </div>
                  </td>
                  <td className="p-2">{fit ? <FitBadge fit={fit.fit} reason={fit.reason} /> : <span className="text-xs text-zinc-400">—</span>}</td>
                  <td className="p-2">
                    <select
                      className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
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
                    <select
                      className="rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      value={entry.status}
                      onChange={(e) => student.update(entry.slug, { status: e.target.value as Status })}
                      aria-label={`Status for ${college.name}`}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2 text-xs tabular-nums text-zinc-500">
                    {done}/{CHECKLIST.length}
                  </td>
                  <td className="p-2">
                    <input
                      key={student.auth?.userId ?? "local"}
                      className="w-full min-w-40 rounded border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-700 dark:bg-zinc-900"
                      defaultValue={entry.notes}
                      placeholder="Essay ideas, recommenders…"
                      onBlur={(e) => student.update(entry.slug, { notes: e.target.value })}
                    />
                  </td>
                  <td className="p-2 text-right">
                    <button className="text-xs text-zinc-500 hover:text-rose-600" onClick={() => student.remove(entry.slug)}>
                      Remove
                    </button>
                  </td>
                </tr>
                <tr className="text-xs">
                  <td />
                  <td colSpan={6} className="pb-2">
                    <div className="flex flex-wrap gap-x-4 gap-y-1">
                      {CHECKLIST.map(([k, label]) => (
                        <label key={k} className="flex items-center gap-1 text-zinc-600 dark:text-zinc-300">
                          <input
                            type="checkbox"
                            checked={!!entry.checklist[k]}
                            onChange={(e) => student.update(entry.slug, { checklist: { ...entry.checklist, [k]: e.target.checked } })}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {hasScores && (
          <p className="border-t border-zinc-100 p-2 text-xs text-zinc-500 dark:border-zinc-800">
            Balance: {counts.reach} reach · {counts.target} target · {counts.safety} safety
            {counts.safety === 0 && " — consider adding at least one safety."}
          </p>
        )}
        {entries.filter(({ entry }) => entry.plan === "ED" || entry.plan === "ED2").length > 1 && (
          <p className="border-t border-zinc-100 p-2 text-xs text-rose-600 dark:border-zinc-800">
            You picked Early Decision at more than one college. ED is binding — you can only apply ED to one school per round.
          </p>
        )}
      </div>

      <aside>
        <h2 className="mb-2 font-semibold">Upcoming dates</h2>
        {upcoming.length ? (
          <ol className="space-y-2 text-sm">
            {upcoming.map(({ d, college }) => {
              const days = daysUntil(d.due_date!);
              return (
                <li key={d.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="font-medium tabular-nums">{fmtDate(d.due_date)}</span>
                    <Pill tone={days <= 14 ? "red" : "zinc"}>{days === 0 ? "today" : `${days} days`}</Pill>
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
