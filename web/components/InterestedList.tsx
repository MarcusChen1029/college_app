"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { computeFit } from "@/lib/fit";
import { fmtPct } from "@/lib/format";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary } from "@/lib/types";
import { buttonClass, toneClass } from "@/lib/ui";
import { FitBadge, TierBadge } from "./badges";

const noop = () => () => {};

export function InterestedList({ colleges }: { colleges: CollegeSummary[] }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return null;

  const rows = student.interested.flatMap((slug) => colleges.filter((c) => c.slug === slug));
  const hasScores = student.profile.sat != null || student.profile.act != null;

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        Nothing here yet. On any college&apos;s page, tap <span className="font-medium">☆ Interested</span> to park it here while you decide. Browse the{" "}
        <Link href="/colleges" className="text-blue-600 underline">
          Colleges
        </Link>{" "}
        page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {!student.canAdd && (
        <p className={`rounded border px-3 py-2 text-xs ${toneClass("soon")}`}>
          Your list is full on the {student.plan.name} plan. Remove a college from{" "}
          <Link href="/application/list" className="underline">
            My list
          </Link>{" "}
          or{" "}
          <Link href="/pricing" className="underline">
            upgrade
          </Link>{" "}
          to move more over.
        </p>
      )}
      <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-200">
        {rows.map((c) => {
          const fit = hasScores ? computeFit(student.profile, c) : null;
          const rate = student.profile.international && c.intl_admit_rate != null ? c.intl_admit_rate : c.admit_rate;
          return (
            <li key={c.slug} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <TierBadge tier={c.general_tier} size="sm" />
              <div className="min-w-0 flex-1">
                <Link href={`/colleges/${c.slug}`} className="font-semibold hover:text-blue-700">
                  {c.name}
                </Link>
                <p className="text-xs text-zinc-500">
                  {[c.city, c.state_region].filter(Boolean).join(", ")} · admit rate {fmtPct(rate)}
                  {student.profile.international && c.intl_admit_rate != null && " (international)"}
                </p>
              </div>
              {fit && <FitBadge fit={fit.fit} reason={fit.reason} />}
              {student.has(c.slug) ? (
                <span className="text-xs text-zinc-500">Already on my list</span>
              ) : (
                <button
                  className={buttonClass("primary", "sm")}
                  disabled={!student.canAdd}
                  onClick={() => student.promote({ slug: c.slug, id: c.id })}
                >
                  Move to my list
                </button>
              )}
              <button className={buttonClass("danger", "sm")} onClick={() => student.toggleInterested(c.slug)}>
                Remove
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
