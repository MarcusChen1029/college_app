"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { isSubmitted, RESULT_OPTIONS, resultStatus } from "@/lib/application";
import { customSummary, isCustomSlug } from "@/lib/custom-college";
import { useT } from "@/lib/i18n/client";
import { registerColleges, useStudent } from "@/lib/student-store";
import { resultTone } from "@/lib/status";
import { toneClass } from "@/lib/ui";
import type { CollegeSummary, Lookups } from "@/lib/types";
import { TierBadge } from "./badges";
import { SELECT_BASE, usePlanLabel, useResultLabel } from "./ChecklistPanel";
import { PaperPlane } from "./Doodles";
import { EmptyState } from "./EmptyState";

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

  if (rows.length === 0) {
    return (
      <EmptyState art={<PaperPlane className="h-16 w-auto" />} title={t("application.res.emptyTitle")}>
        {t("application.res.emptyPre")}
        <Link href="/application/list" className="font-semibold text-blue-700 underline">
          {t("nav.myList")}
        </Link>
        {t("application.res.emptyPost")}
      </EmptyState>
    );
  }

  const counts = RESULT_OPTIONS.map((r) => [r, rows.filter(({ entry }) => resultStatus(entry.status) === r).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">{counts.map(([r, n]) => t("application.res.count", { n, label: resultLabel(r).toLowerCase() })).join(" · ")}</p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="text-left text-[13px] font-medium text-zinc-600">
            <tr>
              <th className="p-2">{t("application.col.college")}</th>
              <th className="p-2">{t("application.col.plan")}</th>
              <th className="p-2">{t("application.col.decision")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ entry, college }) => {
              const result = resultStatus(entry.status);
              return (
                <tr key={entry.slug} className="border-t border-zinc-100">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <TierBadge tier={college.general_tier} size="sm" />
                      {isCustomSlug(college.slug) ? (
                        <span className="font-medium">{college.short_name ?? college.name}</span>
                      ) : (
                        <Link href={`/colleges/${college.slug}`} className="font-medium hover:underline">
                          {college.short_name ?? college.name}
                        </Link>
                      )}
                    </div>
                  </td>
                  <td className="p-2 text-zinc-600">{(() => { const p = plans.find((x) => x.key === entry.plan); return p ? planLabel(p.key, p.label) : "—"; })()}</td>
                  <td className="p-2">
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
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        {t("application.res.undoPre", { label: resultLabel("submitted") })}
        <Link href="/application/list" className="text-blue-700 underline">
          {t("nav.myList")}
        </Link>
        {t("application.res.undoPost")}
      </p>
    </div>
  );
}
