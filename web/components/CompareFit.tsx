"use client";

import { computeFit } from "@/lib/fit";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { FitBadge } from "./badges";

export function CompareFit({ college }: { college: CollegeSummary }) {
  const { profile } = useStudent();
  if (profile.sat == null && profile.act == null) return <span className="text-xs text-zinc-400">Add scores on the Colleges page</span>;
  const fit = computeFit(profile, college);
  return fit ? <FitBadge fit={fit.fit} reason={fit.reason} /> : <span className="text-zinc-400">—</span>;
}
