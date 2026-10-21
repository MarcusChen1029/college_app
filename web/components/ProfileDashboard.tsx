"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { daysUntil, fmtDate } from "@/lib/format";
import { CHECKLIST, progress } from "@/lib/checklist";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, SAT_SCALE, sectionSummary } from "@/lib/scores";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, Deadline } from "@/lib/types";
import { AccountPanel } from "./AccountPanel";
import { ProfileForm } from "./ProfileForm";
import { TestScoresForm } from "./TestScoresForm";

const noop = () => () => {};

function Stat({ label, value, sub, tint }: { label: string; value: string | number; sub?: string; tint: string }) {
  return (
    <div className={`rounded-2xl p-4 ${tint}`}>
      <p className="text-xs font-medium text-ink/70">{label}</p>
      <p className="mt-1 font-display text-3xl font-bold">{value}</p>
      {sub && <p className="mt-0.5 truncate text-xs text-ink/70">{sub}</p>}
    </div>
  );
}

export function ProfileDashboard({ colleges, deadlines }: { colleges: CollegeSummary[]; deadlines: Deadline[] }) {
  const student = useStudent();
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

  const upcoming = entries
    .flatMap(({ entry, college }) =>
      deadlines
        .filter((d) => d.institution_id === college.id && d.due_date && daysUntil(d.due_date) >= 0)
        .filter((d) => d.kind !== "application" || !entry.plan || d.plan_key === entry.plan)
        .map((d) => ({ d, college })),
    )
    .sort((a, b) => a.d.due_date!.localeCompare(b.d.due_date!))
    .slice(0, 5);

  const englishKey = ENGLISH_TEST_KEYS.find((k) => profile.tests?.english?.[k]?.total != null);
  const english = englishKey ? profile.tests!.english![englishKey]! : null;

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
        <Link href="/start" className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold hover:bg-white">
          Redo setup
        </Link>
      </section>

      <section aria-label="Your numbers" className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="GPA (unweighted)" value={profile.gpa ?? "—"} tint="bg-sun/60" />
        <Stat label="SAT" value={profile.sat ?? "—"} sub={sectionSummary(SAT_SCALE, profile.tests?.sat)} tint="bg-mint/50" />
        <Stat label="ACT" value={profile.act ?? "—"} sub={sectionSummary(ACT_SCALE, profile.tests?.act)} tint="bg-lilac/40" />
        <Stat
          label={englishKey ? ENGLISH_TESTS[englishKey].label : "English test"}
          value={english?.total ?? "—"}
          sub={englishKey ? sectionSummary(ENGLISH_TESTS[englishKey], english?.sections) : undefined}
          tint="bg-blue-100"
        />
        <Stat label="Colleges on my list" value={entries.length} tint="bg-coral/40" />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section className="rounded-3xl border-2 border-zinc-200 p-6">
            <h2 className="text-xl font-bold">Edit my numbers</h2>
            <p className="mb-4 text-sm text-zinc-600">Changes save when you leave a field.</p>
            <ProfileForm />
          </section>

          <section className="rounded-3xl border-2 border-zinc-200 p-6">
            <h2 className="text-xl font-bold">Testing</h2>
            <p className="mb-4 text-sm text-zinc-600">Totals and section scores, plus any English proficiency tests. Saves when you leave a field.</p>
            <TestScoresForm />
          </section>

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
                    <div className="rounded-2xl bg-rose-300 p-3">
                      <p className="font-display text-3xl font-bold">{counts.super_reach}</p>
                      <p className="text-xs font-medium">Super reach</p>
                    </div>
                    <div className="rounded-2xl bg-rose-100 p-3">
                      <p className="font-display text-3xl font-bold">{counts.reach}</p>
                      <p className="text-xs font-medium">Reach</p>
                    </div>
                    <div className="rounded-2xl bg-amber-100 p-3">
                      <p className="font-display text-3xl font-bold">{counts.target}</p>
                      <p className="text-xs font-medium">Target</p>
                    </div>
                    <div className="rounded-2xl bg-emerald-100 p-3">
                      <p className="font-display text-3xl font-bold">{counts.safety}</p>
                      <p className="text-xs font-medium">Safety</p>
                    </div>
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
                    <Link href="/my-list" className="font-semibold text-blue-700 underline underline-offset-4">
                      Open my list
                    </Link>
                  </p>
                </div>
              </>
            )}
          </section>

          <section className="rounded-3xl border-2 border-zinc-200 p-6">
            <h2 className="text-xl font-bold">Next deadlines</h2>
            {upcoming.length === 0 ? (
              <p className="mt-2 text-sm text-zinc-600">No upcoming dates. Add colleges to your list and they&apos;ll show up here.</p>
            ) : (
              <ul className="mt-3 divide-y divide-zinc-100">
                {upcoming.map(({ d, college }) => {
                  const days = daysUntil(d.due_date!);
                  return (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <span>
                        <Link href={`/colleges/${college.slug}`} className="font-semibold hover:text-blue-700">
                          {college.short_name ?? college.name}
                        </Link>
                        <span className="text-zinc-500"> · {d.label ?? d.kind}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        {fmtDate(d.due_date)}
                        <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${days <= 14 ? "bg-coral/40" : "bg-blue-100"}`}>
                          {days === 0 ? "today" : `${days}d`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <aside id="account" className="space-y-3">
          <h2 className="text-xl font-bold">Account</h2>
          <AccountPanel />
        </aside>
      </div>
    </div>
  );
}
