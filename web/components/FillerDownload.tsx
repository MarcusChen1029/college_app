"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

const noop = () => () => {};

/** The Common App filler download is a Senior plan feature, like Connect AI. */
export function FillerDownload({ children }: { children: ReactNode }) {
  const t = useT();
  const student = useStudent();
  const mounted = useSyncExternalStore(noop, () => true, () => false);
  if (!mounted || !student.ready) return <div className="h-24 animate-pulse rounded-xl bg-zinc-100" />;
  if (student.plan.key === "senior") return <>{children}</>;
  return (
    <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4">
      <p className="text-sm font-semibold">{t("tools.filler.seniorOnly")}</p>
      <p className="text-sm text-zinc-600">{t("tools.filler.onPlan", { plan: student.plan.name })}</p>
      <Link href="/pricing" className={buttonClass("secondary", "sm")}>
        {t("tools.filler.seePlans")}
      </Link>
    </div>
  );
}
