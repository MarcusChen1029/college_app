"use client";

import type { CollegeEnglish } from "@/lib/english-fit";
import { computeFit, type FitInput } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import { fitClass, FIT_LEVEL } from "@/lib/ui";
import { englishReadout, type Recommended } from "./EnglishCheck";

/** The student's own read of this college, at the top of the navy answer band: their fit label set large, why (the admit
 *  rate it used, international when that is published, and where their SAT/ACT sits), and whether their English score
 *  meets the minimum. Renders nothing until the profile holds a score, so a visitor without one sees the plain band.
 *  Same rules as everywhere else (lib/fit.ts, lib/english-fit.ts). */
export function YouRow({ fitInput, english, recommended }: { fitInput: FitInput; english: CollegeEnglish | undefined; recommended: Recommended }) {
  const t = useT();
  const student = useStudent();
  if (student.role === "teacher") return null;
  const fit = scoredTests(student.profile).length > 0 ? computeFit(student.profile, fitInput) : null;
  const scores = student.profile.tests?.english;
  const engText = englishReadout(t, scores, english, recommended)?.text ?? "";
  if (!fit && !engText) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-zinc-700 bg-zinc-800 px-5 py-4 sm:px-7 lg:px-6 xl:px-7">
      <span className="text-sm font-semibold text-sky">{t("college.forYou")}</span>
      {fit && (
        <span className={`inline-flex h-10 shrink-0 items-center gap-2.5 rounded-full border px-4 font-display text-xl font-bold whitespace-nowrap ${fitClass(fit.fit)}`}>
          <span className="flex gap-1" aria-hidden="true">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`h-2 w-2 rounded-full border border-current ${n <= FIT_LEVEL[fit.fit] ? "bg-current" : ""}`} />
            ))}
          </span>
          {fitLabel(t, fit.fit)}
        </span>
      )}
      <span className="min-w-0 flex-1 basis-64 text-base leading-snug text-white">
        {fit && <span className="block first-letter:uppercase">{fitReasonText(t, fit)}</span>}
        {engText && <span className="block text-blue-100">{engText}</span>}
      </span>
    </div>
  );
}
