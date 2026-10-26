"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};

/** The Common App filler download is a Senior plan feature, like Connect AI. */
export function FillerDownload({ children }: { children: ReactNode }) {
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return <div className="h-24 animate-pulse rounded-xl bg-zinc-100" />;
  if (student.plan.key === "senior") return <>{children}</>;
  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-sm font-semibold">The college application filler is a Senior plan feature</p>
      <p className="text-sm text-zinc-600">You&apos;re on the {student.plan.name} plan. Switch to Senior to download it.</p>
      <Link href="/pricing" className={buttonClass("primary", "sm")}>
        See plans
      </Link>
    </div>
  );
}
