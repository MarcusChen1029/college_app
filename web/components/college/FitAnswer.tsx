"use client";

import Link from "next/link";
import { computeFit, type FitInput } from "@/lib/fit";
import { useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";
import { fitClass } from "@/lib/ui";

/** The student's own answer to "can I get in?": their fit label and why, or where to add scores. Inside the navy answer
 *  band on wider screens; `light` is the phone copy under the band, on white. Teachers have no scores, so nothing.
 *  Same rules as everywhere else (lib/fit.ts). */
export function FitAnswer({ fitInput, light = false }: { fitInput: FitInput; light?: boolean }) {
  const t = useT();
  const student = useStudent();
  if (student.role === "teacher") return null;
  const text = light ? "text-zinc-700" : "text-blue-100";
  const hasScores = scoredTests(student.profile).length > 0;
  if (!hasScores)
    return (
      <p className={`${light ? "" : "mt-3"} text-[15px] leading-snug ${text}`}>
        {t("college.addScoresPre")}{" "}
        <Link href="/profile" className={`font-semibold underline underline-offset-4 ${light ? "text-blue-700" : "text-white hover:text-sky"}`}>
          {t("college.profile")}
        </Link>{" "}
        {t("college.addScoresPost")}
      </p>
    );
  const fit = computeFit(student.profile, fitInput);
  if (!fit) return null;
  return (
    <p className={`${light ? "" : "mt-3"} flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[15px] leading-snug ${text}`}>
      <span className={`inline-flex h-7 items-center rounded-full border px-3 text-sm font-semibold whitespace-nowrap ${fitClass(fit.fit)}`}>{fitLabel(t, fit.fit)}</span>
      <span>{fitReasonText(t, fit)}</span>
    </p>
  );
}
