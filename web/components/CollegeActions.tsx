"use client";

import Link from "next/link";
import { computeFit, type FitInput } from "@/lib/fit";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { useT } from "@/lib/i18n/client";
import { fitReasonText } from "@/lib/i18n/fit-text";
import { FitBadge } from "./badges";

export function CollegeActions({ slug, id, fitInput }: { slug: string; id: string; fitInput?: FitInput }) {
  const t = useT();
  const student = useStudent();
  const inList = student.has(slug);
  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fit = hasScores && fitInput ? computeFit(student.profile, fitInput) : null; // no fit for grade-based (non-US) colleges
  if (student.role === "teacher") return null; // teachers have no personal college list
  return (
    <div className="flex flex-col items-end gap-2">
      {!inList && !student.canAdd ? (
        <Link href="/pricing" className={buttonClass("secondary", "sm")}>
          {t("college.listFull", { plan: student.plan.name })}
        </Link>
      ) : (
      <button
        className={buttonClass(inList ? "secondary" : "primary", "sm")}
        onClick={() => (inList ? student.remove(slug) : student.add({ slug, id }))}
      >
        {inList ? t("college.inMyList") : t("college.addToList")}
      </button>
      )}
      {!inList && (
        <button
          className={buttonClass("secondary", "sm")}
          onClick={() => student.toggleInterested(slug)}
          title={t("college.interestedTitle")}
        >
          {student.isInterested(slug) ? t("college.interestedRemove") : t("college.interested")}
        </button>
      )}
      {fit ? (
        <div className="max-w-xs text-right text-xs text-zinc-500">
          <FitBadge fit={fit.fit} /> <span className="ml-1">{fitReasonText(t, fit)}</span>
        </div>
      ) : fitInput ? (
        <div className="text-xs text-zinc-400">
          {t("college.addScoresPre")}{" "}
          <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
            {t("college.profile")}
          </Link>{" "}
          {t("college.addScoresPost")}
        </div>
      ) : null}
    </div>
  );
}
