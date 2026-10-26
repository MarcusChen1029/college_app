"use client";

import Link from "next/link";
import { computeFit, type FitInput } from "@/lib/fit";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { FitBadge } from "./badges";

export function CollegeActions({ slug, id, fitInput }: { slug: string; id: string; fitInput?: FitInput }) {
  const student = useStudent();
  const inList = student.has(slug);
  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fit = hasScores && fitInput ? computeFit(student.profile, fitInput) : null; // no fit for grade-based (non-US) colleges
  if (student.role === "teacher") return null; // teachers have no personal college list
  return (
    <div className="flex flex-col items-end gap-2">
      {!inList && !student.canAdd ? (
        <Link href="/pricing" className={buttonClass("secondary", "sm")}>
          List full ({student.plan.name} plan) · Upgrade
        </Link>
      ) : (
      <button
        className={buttonClass(inList ? "secondary" : "primary", "sm")}
        onClick={() => (inList ? student.remove(slug) : student.add({ slug, id }))}
      >
        {inList ? "✓ In my list (remove)" : "+ Add to my list"}
      </button>
      )}
      {!inList && (
        <button
          className={buttonClass("secondary", "sm")}
          onClick={() => student.toggleInterested(slug)}
          title="Keep it on your Interested page while you decide"
        >
          {student.isInterested(slug) ? "★ Interested (remove)" : "☆ Interested"}
        </button>
      )}
      {fit ? (
        <div className="max-w-xs text-right text-xs text-zinc-500">
          <FitBadge fit={fit.fit} /> <span className="ml-1">{fit.reason}</span>
        </div>
      ) : fitInput ? (
        <div className="text-xs text-zinc-400">
          Add your scores on your{" "}
          <Link href="/profile" className="font-semibold text-blue-700 underline underline-offset-4">
            Profile
          </Link>{" "}
          to see your fit.
        </div>
      ) : null}
    </div>
  );
}
