import { FIT_LABEL, type Fit } from "@/lib/fit";
import type { TierCode } from "@/lib/types";

const TIER_STYLE: Record<TierCode, string> = {
  S: "bg-violet-600 text-white",
  A: "bg-blue-600 text-white",
  B: "bg-teal-600 text-white",
  C: "bg-amber-500 text-white",
  D: "bg-zinc-500 text-white",
};

export function TierBadge({ tier, size = "md" }: { tier: TierCode | null | undefined; size?: "sm" | "md" }) {
  if (!tier) return <span className="text-zinc-400">—</span>;
  const dims = size === "sm" ? "h-5 w-5 text-[11px]" : "h-7 w-7 text-sm";
  return (
    <span className={`inline-flex items-center justify-center rounded-md font-bold ${dims} ${TIER_STYLE[tier]}`} title={`Tier ${tier}`}>
      {tier}
    </span>
  );
}

const FIT_STYLE: Record<Fit, string> = {
  super_reach: "bg-rose-600 text-white ring-rose-700 dark:bg-rose-700 dark:ring-rose-500",
  reach: "bg-rose-100 text-rose-800 ring-rose-300 dark:bg-rose-950 dark:text-rose-200 dark:ring-rose-800",
  target: "bg-amber-100 text-amber-800 ring-amber-300 dark:bg-amber-950 dark:text-amber-200 dark:ring-amber-800",
  safety: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-950 dark:text-emerald-200 dark:ring-emerald-800",
};

export function FitBadge({ fit, reason }: { fit: Fit; reason?: string }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${FIT_STYLE[fit]}`} title={reason}>
      {FIT_LABEL[fit]}
    </span>
  );
}

export function Pill({ children, tone = "zinc" }: { children: React.ReactNode; tone?: "zinc" | "blue" | "green" | "red" }) {
  const tones = {
    zinc: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
    blue: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    red: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-200",
  };
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}
