"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { isSubmitted, RESULT_OPTIONS, resultStatus } from "@/lib/application";
import { customSummary, isCustomSlug } from "@/lib/custom-college";
import { useT } from "@/lib/i18n/client";
import { registerColleges, useStudent } from "@/lib/student-store";
import { resultTone } from "@/lib/status";
import type { MessageKey } from "@/lib/i18n";
import { buttonClass, PANEL, toneClass } from "@/lib/ui";
import type { CollegeSummary, Lookups } from "@/lib/types";
import { TierBadge } from "./badges";
import { SELECT_BASE, usePlanLabel, useResultLabel } from "./ChecklistPanel";
import { EmptyNote } from "./EmptyState";

const noop = () => () => {};

export function ResultsList({ colleges, plans }: { colleges: CollegeSummary[]; plans: Lookups["plans"] }) {
  const t = useT();
  const planLabel = usePlanLabel();
  const resultLabel = useResultLabel();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return null;

  const rows = student.list
    .filter((e) => isSubmitted(e.status))
    .flatMap((entry) => {
      const college = entry.custom ? customSummary(entry.rowId ?? entry.slug, entry.custom) : colleges.find((c) => c.slug === entry.slug);
      return college ? [{ entry, college }] : [];
    });

  // The season's board: every submitted application in the column of its decision. Empty columns say what lands there.
  const columns: { key: string; title: MessageKey; empty: MessageKey; results: readonly (typeof RESULT_OPTIONS)[number][] }[] = [
    { key: "admitted", title: "application.res.col.admitted", empty: "application.res.colEmpty.admitted", results: ["admitted", "enrolled"] },
    { key: "waiting", title: "application.res.col.waiting", empty: "application.res.colEmpty.waiting", results: ["submitted"] },
    { key: "hold", title: "application.res.col.hold", empty: "application.res.colEmpty.hold", results: ["deferred", "waitlisted"] },
    { key: "closed", title: "application.res.col.closed", empty: "application.res.colEmpty.closed", results: ["rejected", "withdrawn"] },
  ];

  return (
    <div className="space-y-4">
      {rows.length === 0 && (
        <EmptyNote
          action={
            <Link href="/application/list" className={buttonClass("secondary", "sm")}>
              {t("application.openMyList")}
            </Link>
          }
        >
          <strong className="font-semibold">{t("application.res.emptyTitle")}.</strong> {t("application.res.emptyPre")}
          {t("nav.myList")}
          {t("application.res.emptyPost")}
        </EmptyNote>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const cards = rows.filter(({ entry }) => (col.results as readonly string[]).includes(resultStatus(entry.status)));
          return (
            <section key={col.key} aria-labelledby={`res-${col.key}`} className={`${PANEL} p-4`}>
              <h2 id={`res-${col.key}`} className="flex items-baseline justify-between gap-3 font-display text-lg font-bold text-ink">
                {t(col.title)}
                <span className="text-2xl tabular-nums">{cards.length}</span>
              </h2>
              {cards.length === 0 ? (
                <p className="mt-3 text-[15px] text-zinc-700">{t(col.empty)}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {cards.map(({ entry, college }) => {
                    const result = resultStatus(entry.status);
                    const plan = plans.find((x) => x.key === entry.plan);
                    return (
                      <li key={entry.slug} className="space-y-2 rounded-2xl bg-white p-3">
                        <div className="flex items-center gap-2">
                          <TierBadge tier={college.general_tier} size="sm" />
                          {isCustomSlug(college.slug) ? (
                            <span className="min-w-0 truncate font-semibold">{college.short_name ?? college.name}</span>
                          ) : (
                            <Link href={`/colleges/${college.slug}`} className="min-w-0 truncate font-semibold hover:underline">
                              {college.short_name ?? college.name}
                            </Link>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {plan && <span className="text-[13px] text-zinc-600">{planLabel(plan.key, plan.label)}</span>}
                          <select
                            className={`${SELECT_BASE} ${toneClass(resultTone(result))}`}
                            value={result}
                            onChange={(e) => student.update(entry.slug, { status: e.target.value as typeof result })}
                            aria-label={t("application.res.decisionFor", { name: college.name })}
                          >
                            {RESULT_OPTIONS.map((r) => (
                              <option key={r} value={r}>
                                {resultLabel(r)}
                              </option>
                            ))}
                          </select>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
      {rows.length > 0 && (
        <p className="text-[13px] text-zinc-600">
          {t("application.res.undoPre", { label: resultLabel("submitted") })}
          <Link href="/application/list" className="text-blue-700 underline">
            {t("nav.myList")}
          </Link>
          {t("application.res.undoPost")}
        </p>
      )}
    </div>
  );
}
