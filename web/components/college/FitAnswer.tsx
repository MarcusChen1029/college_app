"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { scoredTests } from "@/lib/test-plan";

/** Where to add scores, for a student who has none yet: inside the navy answer band on wider screens; `light` is the phone
 *  copy under the band, on white. Once the profile holds an SAT or ACT, the band's "For you" row (YouRow) shows the fit
 *  instead, so this renders nothing. Teachers have no scores, so nothing either. */
export function FitAnswer({ light = false }: { light?: boolean }) {
  const t = useT();
  const student = useStudent();
  if (student.role === "teacher" || scoredTests(student.profile).length > 0) return null;
  return (
    <p className={`${light ? "text-zinc-700" : "mt-3 text-blue-100"} text-[15px] leading-snug`}>
      {t("college.addScoresPre")}{" "}
      <Link href="/profile" className={`font-semibold underline underline-offset-4 ${light ? "text-blue-700" : "text-white hover:text-sky"}`}>
        {t("college.profile")}
      </Link>{" "}
      {t("college.addScoresPost")}
    </p>
  );
}
