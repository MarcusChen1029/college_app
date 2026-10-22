"use client";

import Link from "next/link";
import { computeFit, type FitInput } from "@/lib/fit";
import { useStudent } from "@/lib/student-store";
import { FitBadge } from "./badges";

export function CollegeActions({ slug, id, fitInput }: { slug: string; id: string; fitInput?: FitInput }) {
  const student = useStudent();
  const inList = student.has(slug);
  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fit = hasScores && fitInput ? computeFit(student.profile, fitInput) : null; // no fit for grade-based (non-US) colleges
  return (
    <div className="flex flex-col items-end gap-2">
      {!inList && !student.canAdd ? (
        <Link href="/pricing" className="rounded-md border border-blue-600 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50">
          List full ({student.plan.name} plan) · Upgrade
        </Link>
      ) : (
      <button
        className={`rounded-md px-3 py-1.5 text-sm font-medium ${inList ? "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}
        onClick={() => (inList ? student.remove(slug) : student.add({ slug, id }))}
      >
        {inList ? "✓ In my list (remove)" : "+ Add to my list"}
      </button>
      )}
      {!inList && (
        <button
          className={`rounded-md px-3 py-1 text-xs font-medium ${student.isInterested(slug) ? "bg-amber-100 text-amber-800" : "border border-zinc-300 text-zinc-700 hover:bg-zinc-50"}`}
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
        <div className="text-xs text-zinc-400">Add your scores on the Colleges page to see your fit.</div>
      ) : null}
    </div>
  );
}
