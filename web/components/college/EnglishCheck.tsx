"use client";

import Link from "next/link";
import { englishFitSentence } from "@/components/EnglishFit";
import { ENGLISH_TEST_SHORT, englishFit, hasEnglishScore, STUDENT_TO_REQ, studentEnglishScores, type CollegeEnglish, type StudentEnglish } from "@/lib/english-fit";
import type { TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { Tone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import { Tag } from "./Tag";

/** Recommended totals by college test key (english_requirements.recommended_total). lib/english-fit.ts compares published
 *  minimums only, so a college that lists just a recommended score (Michigan: TOEFL 100) is compared here. */
export type Recommended = Partial<Record<string, number>>;

export type EnglishReadout = { tone: Tone; label: string; text: string };

const FIT_TONE = { meets: "done", below: "soon", not_required: "neutral", waivable: "neutral" } as const;
const SATISFIES = new Set(["required_option", "recommended_option"]);

/** The student's English score against this college, the best result across every test they have: a published minimum
 *  they meet; else a recommended score they meet (on a test with no minimum, worded as "recommended"); else a minimum they
 *  miss; else the recommended score they come closest to. Null when the student has no English score. */
export function englishReadout(t: TFunction, scores: StudentEnglish, college: CollegeEnglish | undefined, recommended: Recommended): EnglishReadout | null {
  if (!hasEnglishScore(scores)) return null;
  const fit = englishFit(scores, college);
  if (fit.status !== "meets" && fit.status !== "not_required") {
    // Every test of the student's that the college accepts with a recommended score but no minimum, best first.
    const recs = studentEnglishScores(scores)
      .flatMap(({ test, score }) => {
        const key = STUDENT_TO_REQ[test];
        const req = college?.tests[key];
        const rec = recommended[key];
        return rec != null && req && SATISFIES.has(req.status) && req.min == null ? [{ test, score, rec, gap: (score - rec) / rec }] : [];
      })
      .sort((a, b) => b.gap - a.gap);
    const best = recs[0];
    // A recommended score met beats a minimum missed (the student can send that test); otherwise a missed minimum is the
    // answer, and only with no minimum to compare is the closest recommended score reported.
    if (best && (best.gap >= 0 || fit.min == null)) {
      const fmt = (n: number) => (best.test === "ielts" || best.test === "toefl_band" ? n.toFixed(1) : String(n));
      const meets = best.gap >= 0;
      return {
        tone: meets ? "done" : "soon",
        label: t(meets ? "colleges.english.meets" : "colleges.english.below"),
        text: t(meets ? "college.meetsRecommended" : "college.belowRecommended", { test: ENGLISH_TEST_SHORT[best.test], score: fmt(best.score), rec: fmt(best.rec) }),
      };
    }
  }
  return {
    tone: fit.status === "unknown" ? "neutral" : FIT_TONE[fit.status],
    label: fit.status === "unknown" ? "" : t(`colleges.english.${fit.status}`),
    text: englishFitSentence(t, fit),
  };
}

/** The English section's line for the visitor: their result against this college, or (for an international student with
 *  no English score yet) where to add one. Teachers have no scores. */
export function EnglishCheck({ english, recommended, className = "" }: { english: CollegeEnglish; recommended: Recommended; className?: string }) {
  const t = useT();
  const student = useStudent();
  if (student.role === "teacher") return null;
  const scores = student.profile.tests?.english;
  const r = englishReadout(t, scores, english, recommended);
  if (!r) {
    const fit = englishFit(scores, english);
    if (!student.profile.international || fit.status === "not_required" || (fit.status === "unknown" && fit.reason === "no_data")) return null;
    return (
      <p className={`text-base ${className}`}>
        <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
          {t("colleges.addEnglishScore")}
        </Link>
      </p>
    );
  }
  return (
    <p className={`flex flex-wrap items-center gap-2 text-base ${className}`}>
      {r.label && <Tag tone={r.tone}>{r.label}</Tag>}
      <span>{r.text}</span>
    </p>
  );
}
