"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";

// The college's middle 50% (25th to 75th percentile) of SAT total or ACT composite drawn on the test's own scale, the
// median as a tick, and the student's score as a dot when they have one (the same score lib/fit.ts uses). The scale
// starts a little below the lower of the 25th percentile and the student's score, on round steps, and ends at the top
// score, so the band is never stretched to fill the width.
const SCALE = { sat: { max: 1600, pad: 100, steps: [100, 200, 300] }, act: { max: 36, pad: 4, steps: [2, 4, 6] } } as const;

export function ScoreRange({ test, label, p25, p50, p75 }: { test: "sat" | "act"; label: string; p25: number; p50: number | null; p75: number }) {
  const t = useT();
  const student = useStudent();
  const used = scoredTests(student.profile).includes(test);
  const you = used ? (test === "sat" ? student.profile.sat : student.profile.act) ?? null : null;
  const { max, pad, steps } = SCALE[test];
  const low = Math.min(p25, you ?? p25) - pad;
  const step = steps.find((s) => (max - Math.floor(low / s) * s) / s <= 6) ?? steps[steps.length - 1];
  const lo = Math.max(0, Math.floor(low / step) * step);
  const ticks = Array.from({ length: Math.round((max - lo) / step) + 1 }, (_, i) => lo + i * step);
  const at = (x: number) => `${(Math.min(max, Math.max(lo, x)) - lo) / (max - lo) * 100}%`;
  const youPct = you != null ? (Math.min(max, Math.max(lo, you)) - lo) / (max - lo) : 0;
  const testName = test === "sat" ? "SAT" : "ACT";

  return (
    <figure className="min-w-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-base font-semibold">{label}</span>
        <span className="text-sm text-zinc-600 tabular-nums">
          {t("college.middle50", { lo: p25, hi: p75 })}
          {p50 != null && <> · {t("college.median", { n: p50 })}</>}
        </span>
      </figcaption>
      <div className="relative mt-2 h-14">
        {you != null && (
          <span
            className={`absolute top-0 text-sm font-semibold whitespace-nowrap tabular-nums ${youPct > 0.85 ? "-translate-x-full" : youPct < 0.15 ? "" : "-translate-x-1/2"}`}
            style={{ left: at(you) }}
          >
            {t("college.youScore", { n: you })}
          </span>
        )}
        <div className="absolute inset-x-0 top-8 h-2.5 rounded-full bg-zinc-100" aria-hidden="true" />
        <div className="absolute top-8 h-2.5 rounded-full bg-blue-500" style={{ left: at(p25), width: `calc(${at(p75)} - ${at(p25)})` }} aria-hidden="true" />
        {p50 != null && <div className="absolute top-[26px] h-[22px] w-[3px] -translate-x-1/2 rounded-full bg-ink" style={{ left: at(p50) }} aria-hidden="true" />}
        {you != null && (
          <div className="absolute top-[29px] h-4 w-4 -translate-x-1/2 rounded-full border-[3px] border-white bg-coral ring-1 ring-ink" style={{ left: at(you) }} aria-hidden="true" />
        )}
      </div>
      <div className="relative h-5 text-[13px] text-zinc-600 tabular-nums" aria-hidden="true">
        {ticks.map((x, i) => (
          <span key={x} className={`absolute top-0 ${i === 0 ? "" : i === ticks.length - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: at(x) }}>
            {x}
          </span>
        ))}
      </div>
      {you == null && student.role !== "teacher" && (
        <Link href="/profile" className="mt-2 inline-block text-sm font-semibold text-blue-700 hover:underline">
          {t("college.addTestScore", { test: testName })}
        </Link>
      )}
    </figure>
  );
}
