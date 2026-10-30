"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { fmtPct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { activeWindow, taipeiToday } from "@/lib/plans";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
import { FitBadge, TierBadge } from "./badges";
import { Star } from "./Doodles";
import { EmptyState } from "./EmptyState";
import { StatusIcon } from "./StatusPill";

const noop = () => () => {};

// The shortlist waiting to be moved onto My list, set as one ticket like My list's route tickets (globals.css, "My list"):
// its stub says how many are waiting, one white line per college carries the SAT middle 50% beside the fit it explains,
// and a "My list" panel beside the ticket says how much room is left there.

export function InterestedList({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return null;

  const rows = student.interested.flatMap((slug) => colleges.filter((c) => c.slug === slug));
  const hasScores = scoredTests(student.profile).length > 0;

  // Display only: the plan line on the "My list" panel says what My list's own banner says.
  const pass = activeWindow(student.planWindows, taipeiToday());
  const planName = t(`payments.planName.${student.plan.key}`);
  // Where "Move to my list" sends a college: My list's count, the plan and the room left on it.
  const myListPanel = (
    <aside className="min-w-0 xl:sticky xl:top-24 xl:self-start">
      <div className="rounded-3xl bg-blue-100 px-6 py-6">
        <h2 className="font-display text-xl font-bold leading-tight text-ink">{t("nav.myList")}</h2>
        <p className={`mt-3 tabular-nums ${student.canAdd ? "text-ink" : "font-semibold text-soon"}`}>
          <span className="font-display text-[28px] font-extrabold leading-none tracking-tight">
            {student.list.length}
            {student.plan.limit != null && ` / ${student.plan.limit}`}
          </span>
          {t("application.collegesSuffix")}
        </p>
        <p className="mt-1 text-sm text-zinc-700">{pass ? t("payments.passFor", { year: pass.entry_year }) : t("application.planName", { name: planName })}</p>
        {student.plan.limit != null && student.canAdd && (
          <p className="mt-3 text-sm text-ink">
            {student.plan.limit - student.list.length === 1
              ? t("application.int.placeLeft", { plan: planName })
              : t("application.int.placesLeft", { n: student.plan.limit - student.list.length, plan: planName })}
          </p>
        )}
        <Link href="/application/list" className={`${buttonClass("secondary", "sm")} mt-5`}>
          {t("application.openMyList")}
        </Link>
      </div>
    </aside>
  );

  if (rows.length === 0) {
    return (
      <div className="grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
      <EmptyState
        art={<Star className="h-14 w-auto" />}
        title={t("application.int.emptyTitle")}
        actions={
          <Link href="/colleges" className={buttonClass("primary")}>
            {t("home.browse")}
          </Link>
        }
      >
        {t("application.int.emptyPre")}
        <span className="font-semibold text-ink">{t("application.int.emptyStar")}</span>
        {t("application.int.emptyMid")}
      </EmptyState>
      {myListPanel}
      </div>
    );
  }

  return (
    <div className="grid gap-x-8 gap-y-8 xl:grid-cols-[minmax(0,1fr)_17rem]">
    <div className="min-w-0 space-y-5">
      {!student.canAdd && (
        <p className={`flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-[15px] leading-relaxed ${toneClass("soon")}`}>
          <span className="pt-1">
            <StatusIcon tone="soon" />
          </span>
          <span>
            {t("application.int.fullPre", { plan: t(`payments.planName.${student.plan.key}`) })}
            <Link href="/application/list" className="font-semibold underline underline-offset-4">
              {t("nav.myList")}
            </Link>
            {t("application.int.fullMid")}
            <Link href="/pricing" className="font-semibold underline underline-offset-4">
              {t("application.int.fullUpgrade")}
            </Link>
            {t("application.int.fullPost")}
          </span>
        </p>
      )}
      <div className="ml-ticket">
        <div className="ml-stub px-5 py-4">
          <h2 className="font-display text-xl font-bold leading-tight text-ink">
            {rows.length === 1 ? t("application.int.countOne") : t("application.int.count", { n: rows.length })}
          </h2>
        </div>
        <ul className="ml-body space-y-1.5 px-2 pb-2 pt-4">
          {rows.map((c) => {
            const fit = hasScores ? computeFit(student.profile, c) : null;
            const rate = student.profile.international && c.intl_admit_rate != null ? c.intl_admit_rate : c.admit_rate;
            return (
              <li key={c.slug} className="ml-int-row items-center gap-x-4 gap-y-3 rounded-2xl bg-white px-3 py-3">
                <div className="ml-int-name flex min-w-0 items-center gap-3">
                  <TierBadge tier={c.general_tier} size="sm" />
                  <div className="min-w-0">
                    <Link href={`/colleges/${c.slug}`} className="text-base font-semibold leading-snug text-ink hover:underline">
                      {c.name}
                    </Link>
                    <p className="text-sm text-zinc-600">
                      {[c.city, c.state_region].filter(Boolean).join(", ")}
                      {t("application.int.admitRate", { rate: fmtPct(rate) })}
                      {student.profile.international && c.intl_admit_rate != null && t("application.int.international")}
                    </p>
                  </div>
                </div>
                <div className="ml-int-sat">
                  <div className="text-[15px] font-semibold tabular-nums text-ink">{c.sat_p25 != null && c.sat_p75 != null ? `${c.sat_p25}–${c.sat_p75}` : "—"}</div>
                  <div className="text-[13px] text-zinc-600">{t("application.int.satLabel")}</div>
                </div>
                <div className="ml-int-fit">{fit ? <FitBadge fit={fit.fit} result={fit} /> : <span className="text-[13px] text-zinc-500">—</span>}</div>
                <div className="ml-int-act flex items-center justify-end gap-1">
                  {student.has(c.slug) ? (
                    <span className="inline-flex h-9 items-center gap-1.5 px-2 text-sm font-semibold text-done">
                      <StatusIcon tone="done" />
                      {t("application.int.onList")}
                    </span>
                  ) : (
                    <button
                      className={buttonClass("secondary", "sm")}
                      disabled={!student.canAdd}
                      onClick={() => student.promote({ slug: c.slug, id: c.id })}
                    >
                      {t("application.int.move")}
                    </button>
                  )}
                  <button
                    className="inline-flex h-9 items-center rounded-full px-3 text-sm font-semibold text-zinc-600 transition-colors hover:bg-urgent-bg hover:text-urgent"
                    onClick={() => student.toggleInterested(c.slug)}
                  >
                    {t("common.remove")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>

    {myListPanel}
    </div>
  );
}
