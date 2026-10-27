"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { fmtPct } from "@/lib/format";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
import { FitBadge, TierBadge } from "./badges";

const noop = () => () => {};

export function InterestedList({ colleges }: { colleges: CollegeSummary[] }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return null;

  const rows = student.interested.flatMap((slug) => colleges.filter((c) => c.slug === slug));
  const hasScores = scoredTests(student.profile).length > 0;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        {t("application.int.emptyPre")}
        <span className="font-medium">{t("application.int.emptyStar")}</span>
        {t("application.int.emptyMid")}
        <Link href="/colleges" className="text-blue-600 underline">
          {t("nav.colleges")}
        </Link>
        {t("application.int.emptyPost")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!student.canAdd && (
        <p className={`rounded border px-3 py-2 text-xs ${toneClass("soon")}`}>
          {t("application.int.fullPre", { plan: student.plan.name })}
          <Link href="/application/list" className="underline">
            {t("nav.myList")}
          </Link>
          {t("application.int.fullMid")}
          <Link href="/pricing" className="underline">
            {t("application.int.fullUpgrade")}
          </Link>
          {t("application.int.fullPost")}
        </p>
      )}
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {rows.map((c) => {
          const fit = hasScores ? computeFit(student.profile, c) : null;
          const rate = student.profile.international && c.intl_admit_rate != null ? c.intl_admit_rate : c.admit_rate;
          return (
            <li key={c.slug} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <TierBadge tier={c.general_tier} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/colleges/${c.slug}`} className="font-semibold hover:text-blue-700">
                  {c.name}
                </Link>
                <p className="text-xs text-zinc-500">
                  {[c.city, c.state_region].filter(Boolean).join(", ")}
                  {t("application.int.admitRate", { rate: fmtPct(rate) })}
                  {student.profile.international && c.intl_admit_rate != null && t("application.int.international")}
                </p>
              </div>
              {fit && <FitBadge fit={fit.fit} result={fit} />}
              {student.has(c.slug) ? (
                <span className="text-xs text-zinc-500">{t("application.int.onList")}</span>
              ) : (
                <button
                  className={buttonClass("primary", "sm")}
                  disabled={!student.canAdd}
                  onClick={() => student.promote({ slug: c.slug, id: c.id })}
                >
                  {t("application.int.move")}
                </button>
              )}
              <button className={buttonClass("danger", "sm")} onClick={() => student.toggleInterested(c.slug)}>
                {t("common.remove")}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
