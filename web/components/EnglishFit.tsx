"use client";

import Link from "next/link";
import { ENGLISH_TEST_SHORT, englishFit, hasEnglishScore, type CollegeEnglish, type EnglishFit } from "@/lib/english-fit";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { Tone } from "@/lib/status";
import { useStudent } from "@/lib/student-store";
import { StatusPill } from "./StatusPill";

const TONE: Record<Exclude<EnglishFit["status"], "unknown">, Tone> = { meets: "done", below: "soon", not_required: "neutral", waivable: "neutral" };

/** IELTS and the TOEFL band read with one decimal ("7.0"), the rest as whole numbers. */
const fmtScore = (test: NonNullable<EnglishFit["test"]>, n: number) => (test === "ielts" || test === "toefl_band" ? n.toFixed(1) : String(n));

/** One sentence explaining the result, e.g. "Your IELTS 7.0 meets the 6.5 minimum." */
export function englishFitSentence(t: TFunction, f: EnglishFit): string {
  const vars = f.test && f.score != null && f.min != null ? { test: ENGLISH_TEST_SHORT[f.test], score: fmtScore(f.test, f.score), min: fmtScore(f.test, f.min) } : null;
  const sub = f.subscores && (f.status === "meets" || f.status === "below") ? t("colleges.englishSubscores") : "";
  switch (f.status) {
    case "meets":
    case "below":
      return vars ? t(`colleges.englishWhy.${f.status}`, vars) + sub : "";
    case "not_required":
      return t("colleges.englishWhy.not_required");
    case "waivable":
      return vars ? t("colleges.englishWhy.waivableScore", vars) : t("colleges.englishWhy.waivable");
    case "unknown":
      return t(`colleges.englishWhy.${f.reason ?? "no_data"}` as MessageKey);
  }
}

/** Compact table cell: a toned pill, or a muted dash when it can't be told (the reason is in the tooltip). */
export function EnglishFitBadge({ fit }: { fit: EnglishFit }) {
  const t = useT();
  const why = englishFitSentence(t, fit);
  if (fit.status === "unknown")
    return (
      <span className="cursor-help text-zinc-400" title={why} aria-label={why}>
        —
      </span>
    );
  return (
    <StatusPill tone={TONE[fit.status]} title={why}>
      {t(`colleges.english.${fit.status}`)}
    </StatusPill>
  );
}

/** "Your IELTS 7.0 meets the 6.5 minimum" for the college page and the map card. Nothing for a student with no English score
 * unless they are international (then a link to add one, where a test is needed). */
export function EnglishFitLine({ english, className = "" }: { english: CollegeEnglish | undefined; className?: string }) {
  const t = useT();
  const student = useStudent();
  const scores = student.profile.tests?.english;
  const fit = englishFit(scores, english);
  if (!hasEnglishScore(scores)) {
    if (!student.profile.international || fit.status === "not_required" || fit.status === "unknown" && fit.reason === "no_data") return null;
    return (
      <span className={`block text-xs font-normal ${className}`}>
        <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
          {t("colleges.addEnglishScore")}
        </Link>
      </span>
    );
  }
  const why = englishFitSentence(t, fit);
  return (
    <span className={`flex flex-wrap items-center gap-1.5 text-xs font-normal text-zinc-600 ${className}`}>
      {fit.status !== "unknown" && <StatusPill tone={TONE[fit.status]}>{t(`colleges.english.${fit.status}`)}</StatusPill>}
      <span>{why}</span>
    </span>
  );
}
