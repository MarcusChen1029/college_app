"use client";

import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";

/**
 * A college's middle-50% score band on a scale shared by every column, so the bars line up across colleges.
 * The student's own score is marked when they have one.
 */
export function CompareRange({ test, p25, p50, p75, lo, hi }: { test: "sat" | "act"; p25: number; p50: number | null; p75: number; lo: number; hi: number }) {
  const t = useT();
  const { profile } = useStudent();
  const mine = test === "sat" ? profile.sat : profile.act;
  const pos = (n: number) => `${Math.min(100, Math.max(0, ((n - lo) / (hi - lo)) * 100))}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="font-display text-base font-bold text-ink tabular-nums">
          {p25}–{p75}
        </span>
        {p50 != null && <span className="text-xs text-zinc-500 tabular-nums">{t("college.median", { n: p50 })}</span>}
      </div>
      <div className="relative h-2.5 rounded-full bg-zinc-100" aria-hidden="true">
        <div className="absolute inset-y-0 rounded-full bg-blue-300" style={{ left: pos(p25), right: `calc(100% - ${pos(p75)})` }} />
        {p50 != null && <div className="absolute -inset-y-0.5 w-0.5 -translate-x-1/2 rounded-full bg-ink" style={{ left: pos(p50) }} />}
        {mine != null && (
          <div className="absolute -top-1 h-4.5 w-1 -translate-x-1/2 rounded-full bg-coral ring-2 ring-white" style={{ left: pos(Number(mine)) }} title={t("college.youScore", { n: Number(mine) })} />
        )}
      </div>
      {mine != null && (
        <p className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 tabular-nums">
          <span className="h-2.5 w-1 rounded-full bg-coral" aria-hidden="true" />
          {t("college.youScore", { n: Number(mine) })}
        </p>
      )}
    </div>
  );
}
