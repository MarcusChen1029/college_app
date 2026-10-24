"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { isoOf } from "@/lib/calendar";
import { CHECKLIST, progress } from "@/lib/checklist";
import { isDeadlineDone } from "@/lib/application";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, Deadline } from "@/lib/types";
import { ReminderToggle } from "./AccountPanel";
import { FitBadge } from "./badges";
import { DeadlineCalendar, type CalendarEvent } from "./DeadlineCalendar";
import { ProfileCards } from "./ProfileCards";
import { SettingsButton, SettingsPanel, useSettingsOpen } from "./SettingsPanel";

const noop = () => () => {};

export function ProfileDashboard({ colleges, deadlines }: { colleges: CollegeSummary[]; deadlines: Deadline[] }) {
  const student = useStudent();
  const [settingsOpen, setSettingsOpen] = useSettingsOpen();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const { profile } = student;
  const entries = student.list
    .map((e) => ({ entry: e, college: colleges.find((c) => c.slug === e.slug) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);

  const hasScores = profile.sat != null || profile.act != null;
  const counts = { super_reach: 0, reach: 0, target: 0, safety: 0 };
  if (hasScores)
    entries.forEach(({ college }) => {
      const f = computeFit(profile, college);
      if (f) counts[f.fit]++;
    });

  const checklistTotal = entries.length * CHECKLIST.length;
  const checklistDone = entries.reduce((n, { entry }) => n + progress(entry.checklist).done, 0);
  const submitted = entries.filter(({ entry }) => ["submitted", "interview", "admitted", "deferred", "waitlisted", "rejected", "enrolled"].includes(entry.status)).length;

  // Every dated deadline for the colleges on the list (only the plan picked for applications), past ones included.
  const events: CalendarEvent[] = entries.flatMap(({ entry, college }) =>
    deadlines
      .filter((d) => d.institution_id === college.id && d.due_date)
      .filter((d) => d.kind !== "application" || !entry.plan || d.plan_key === entry.plan)
      .map((d) => ({
        id: d.id,
        date: d.due_date!,
        label: d.label ?? d.kind,
        college: college.short_name ?? college.name,
        slug: college.slug,
        done: isDeadlineDone(d.kind, entry.status, entry.checklist),
      })),
  );
  const now = new Date();
  const today = isoOf(now.getFullYear(), now.getMonth(), now.getDate());

  const name = student.auth?.email?.split("@")[0] ?? "Guest";

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-blue-50 p-6">
        <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full border-2 border-ink bg-sun font-display text-2xl font-bold">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-3xl font-bold">{name}</h1>
          <p className="text-sm text-zinc-600">
            {student.auth ? `Signed in as ${student.auth.email}` : "Not signed in. Your info is saved in this browser only."}
            {" · "}
            {profile.international ? "Applying from abroad" : "Applying from the US"}
          </p>
        </div>
        <SettingsButton open={settingsOpen} onToggle={() => setSettingsOpen((o) => !o)} />
        <Link href="/start" className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold hover:bg-white">
          Redo setup
        </Link>
      </section>

      <SettingsPanel open={settingsOpen} />

      <ProfileCards />

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border-2 border-zinc-200 p-6">
            <h2 className="text-xl font-bold">How my list looks</h2>
            {entries.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">
                Nothing here yet. Add colleges from the{" "}
                <Link href="/colleges" className="font-semibold text-blue-700 underline underline-offset-4">
                  Colleges
                </Link>{" "}
                page.
              </p>
            ) : (
              <>
                {hasScores ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    {(["super_reach", "reach", "target", "safety"] as const).map((f) => (
                      <div key={f} className="flex flex-col items-center gap-2 rounded-2xl bg-zinc-50 p-3">
                        <p className="font-display text-3xl font-bold">{counts[f]}</p>
                        <FitBadge fit={f} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">Add an SAT or ACT score above to see super reach, reach, target and safety counts.</p>
                )}
                <div className="mt-5">
                  <div className="flex justify-between text-sm">
                    <span>Checklist progress</span>
                    <span className="font-semibold">
                      {checklistDone} of {checklistTotal}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-zinc-100">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${checklistTotal ? (checklistDone / checklistTotal) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    {submitted} of {entries.length} applications submitted.{" "}
                    <Link href="/application/list" className="font-semibold text-blue-700 underline underline-offset-4">
                      Open my list
                    </Link>
                  </p>
                </div>
              </>
            )}
          </section>
        </div>

        <aside aria-labelledby="deadlines-heading" className="h-fit space-y-4 rounded-3xl border-2 border-zinc-200 p-6">
          <h2 id="deadlines-heading" className="text-xl font-bold">
            Deadlines
          </h2>
          <DeadlineCalendar events={events} today={today} />
          <div className="border-t border-zinc-100 pt-4">
            <ReminderToggle />
          </div>
        </aside>
      </div>
    </div>
  );
}
