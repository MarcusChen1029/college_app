"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { useT } from "@/lib/i18n/client";
import { computeFit } from "@/lib/fit";
import { isoOf } from "@/lib/calendar";
import { CHECKLIST, progress } from "@/lib/checklist";
import { customDeadline, customSummary } from "@/lib/custom-college";
import { isDeadlineDone } from "@/lib/application";
import { deadlineApplies } from "@/lib/deadline-rules";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import type { CollegeSummary, Deadline } from "@/lib/types";
import { FitBadge } from "./badges";
import { DeadlineCalendar, type CalendarEvent } from "./DeadlineCalendar";
import { ProfileCards } from "./ProfileCards";
import { buttonClass, PAGE_TITLE, PANEL, SECTION_TITLE } from "@/lib/ui";

const noop = () => () => {};

export function ProfileDashboard({ colleges, deadlines }: { colleges: CollegeSummary[]; deadlines: Deadline[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return <div className="h-96 animate-pulse rounded-3xl bg-zinc-100" />;

  const { profile } = student;
  // Custom colleges count too (no fit, but their checklist, submission and deadline do).
  const entries = student.list
    .map((e) => ({ entry: e, college: e.custom ? customSummary(e.rowId ?? e.slug, e.custom) : colleges.find((c) => c.slug === e.slug) }))
    .filter((x): x is { entry: typeof x.entry; college: CollegeSummary } => !!x.college);
  const allDeadlines = [
    ...deadlines,
    ...student.list.flatMap((e) => (e.custom ? [customDeadline(e.rowId ?? e.slug, e.custom)] : [])).filter((d): d is Deadline => !!d),
  ];

  const hasScores = scoredTests(profile).length > 0;
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
    allDeadlines
      .filter((d) => d.institution_id === college.id && d.due_date)
      .filter((d) => deadlineApplies(d, { plan: entry.plan, international: !!profile.international }))
      .map((d) => ({
        id: d.id,
        date: d.due_date!,
        label: d.label ?? d.kind,
        college: college.short_name ?? college.name,
        slug: college.slug,
        done: isDeadlineDone(d.kind, entry.status),
      })),
  );
  const now = new Date();
  const today = isoOf(now.getFullYear(), now.getMonth(), now.getDate());

  const name = student.auth?.email?.split("@")[0] ?? t("profile.guest");

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4 rounded-3xl bg-blue-50 p-6">
        <span aria-hidden className="grid h-16 w-16 place-items-center rounded-full bg-sun font-display text-2xl font-bold">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className={`${PAGE_TITLE} truncate`}>{name}</h1>
          <p className="mt-1 text-base text-ink">
            {student.auth ? t("profile.signedInAs", { email: student.auth.email ?? "" }) : t("profile.notSignedIn")}
            {" · "}
            {profile.international ? t("profile.fromAbroad") : t("profile.fromUS")}
          </p>
        </div>
        <Link href="/start" className={buttonClass("secondary", "sm")}>
          {t("profile.redoSetup")}
        </Link>
      </section>

      <ProfileCards />

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section className={`${PANEL} p-6`}>
            <h2 className={SECTION_TITLE}>{t("profile.listHeading")}</h2>
            {entries.length === 0 ? (
              <p className="mt-3 text-base text-ink">
                {t("profile.emptyPre")}{" "}
                <Link href="/colleges" className="font-semibold text-blue-700 underline underline-offset-4">
                  {t("nav.colleges")}
                </Link>{" "}
                {t("profile.emptyPost")}
              </p>
            ) : (
              <>
                {hasScores ? (
                  <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    {(["super_reach", "reach", "target", "safety"] as const).map((f) => (
                      <div key={f} className="flex flex-col items-center gap-2 rounded-2xl bg-white p-3">
                        <p className="font-display text-3xl font-bold tabular-nums">{counts[f]}</p>
                        <FitBadge fit={f} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-zinc-600">{t("profile.scoresHint")}</p>
                )}
                <div className="mt-5">
                  <div className="flex justify-between text-sm">
                    <span>{t("profile.checklistProgress")}</span>
                    <span className="font-semibold">
                      {t("profile.checklistCount", { done: checklistDone, total: checklistTotal })}
                    </span>
                  </div>
                  <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full rounded-full bg-blue-500" style={{ width: `${checklistTotal ? (checklistDone / checklistTotal) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">
                    {t("profile.submittedCount", { submitted, total: entries.length })}{" "}
                    <Link href="/application/list" className="font-semibold text-blue-700 underline underline-offset-4">
                      {t("profile.openList")}
                    </Link>
                  </p>
                </div>
              </>
            )}
          </section>
        </div>

        <aside aria-labelledby="deadlines-heading" className={`h-fit space-y-4 ${PANEL} p-6`}>
          <h2 id="deadlines-heading" className={SECTION_TITLE}>
            {t("nav.deadlines")}
          </h2>
          <DeadlineCalendar events={events} today={today} />
          <p className="border-t border-zinc-200 pt-4 text-sm text-zinc-700">
            {t("profile.reminderEmails")}{" "}
            <Link href="/settings#reminders" className="font-semibold text-blue-700 underline underline-offset-4">
              {t("nav.settings")}
            </Link>
          </p>
        </aside>
      </div>
    </div>
  );
}
