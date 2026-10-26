"use client";

import Link from "next/link";
import { useEffect, useSyncExternalStore } from "react";
import { isSubmitted, RESULT_LABEL, RESULT_OPTIONS, resultStatus } from "@/lib/application";
import { registerColleges, useStudent } from "@/lib/student-store";
import { resultTone } from "@/lib/status";
import { toneClass } from "@/lib/ui";
import type { CollegeSummary, Lookups } from "@/lib/types";
import { TierBadge } from "./badges";
import { SELECT_BASE } from "./ChecklistPanel";

const noop = () => () => {};

export function ResultsList({ colleges, plans }: { colleges: CollegeSummary[]; plans: Lookups["plans"] }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  useEffect(() => registerColleges(colleges), [colleges, student.list.length]);
  if (!mounted || !student.ready) return null;

  const rows = student.list
    .filter((e) => isSubmitted(e.status))
    .flatMap((entry) => {
      const college = colleges.find((c) => c.slug === entry.slug);
      return college ? [{ entry, college }] : [];
    });

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No submitted applications yet. Mark a college Submitted on{" "}
        <Link href="/application/list" className="text-blue-600 underline">
          My list
        </Link>{" "}
        once its checklist is complete.
      </p>
    );
  }

  const counts = RESULT_OPTIONS.map((r) => [r, rows.filter(({ entry }) => resultStatus(entry.status) === r).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-600">{counts.map(([r, n]) => `${n} ${RESULT_LABEL[r].toLowerCase()}`).join(" · ")}</p>
      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[480px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="p-2">College</th>
              <th className="p-2">Plan</th>
              <th className="p-2">Decision</th>
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
                      <Link href={`/colleges/${college.slug}`} className="font-medium hover:underline">
                        {college.short_name ?? college.name}
                      </Link>
                    </div>
                  </td>
                  <td className="p-2 text-zinc-600">{plans.find((p) => p.key === entry.plan)?.label ?? "—"}</td>
                  <td className="p-2">
                    <select
                      className={`${SELECT_BASE} ${toneClass(resultTone(result))}`}
                      value={result}
                      onChange={(e) => student.update(entry.slug, { status: e.target.value as typeof result })}
                      aria-label={`Decision for ${college.name}`}
                    >
                      {RESULT_OPTIONS.map((r) => (
                        <option key={r} value={r}>
                          {RESULT_LABEL[r]}
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
        Submitted by mistake? Set it back to &quot;Waiting for decision&quot;, then change it on{" "}
        <Link href="/application/list" className="text-blue-600 underline">
          My list
        </Link>
        .
      </p>
    </div>
  );
}
