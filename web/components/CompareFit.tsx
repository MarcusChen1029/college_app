"use client";

import { computeFit } from "@/lib/fit";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { useT } from "@/lib/i18n/client";
import { FitBadge } from "./badges";

export function CompareFit({ college }: { college: CollegeSummary }) {
  const t = useT();
  const { profile } = useStudent();
  if (profile.sat == null && profile.act == null) return <span className="text-xs text-zinc-400">{t("college.addScoresColleges")}</span>;
  const fit = computeFit(profile, college);
  return fit ? <FitBadge fit={fit.fit} result={fit} /> : <span className="text-zinc-400">—</span>;
}
