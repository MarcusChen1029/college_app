"use client";

import Link from "next/link";
import { useId } from "react";
import { dueState, type WorkItem } from "@/lib/classwork";
import { useLocale, useT } from "@/lib/i18n/client";
import { LABEL } from "@/lib/ui";
import { dueLabel } from "../ClassroomText";

/**
 * The "Upcoming" box in a class page's left column: the work the screen hands it (it picks and caps them, usually with
 * `upcoming()` from lib/classwork.ts), each as its due date over its title, then "View all". `hrefFor` is where a task
 * opens; `viewAllHref` is the Classwork tab. `today` is the reader's local `YYYY-MM-DD`. `onRetry`, when given, means the
 * work could not be loaded: the box then says so with a retry button instead of "nothing due soon".
 */
export function UpcomingBox({
  items,
  today,
  hrefFor,
  viewAllHref,
  onRetry,
}: {
  items: WorkItem[];
  today: string;
  hrefFor: (id: string) => string;
  viewAllHref: string;
  onRetry?: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="rounded-[10px] border border-neutral-line bg-white p-3.5">
      <h2 id={headingId} className={LABEL}>
        {t("classroom.upcoming.title")}
      </h2>
      {onRetry ? (
        <p role="alert" className="mt-2 text-[13px] text-urgent">
          {t("common.tryAgain")}{" "}
          <button type="button" className="font-semibold underline underline-offset-4" onClick={onRetry}>
            {t("classroom.retry")}
          </button>
        </p>
      ) : items.length === 0 ? (
        <p className="mt-2 text-[13px] text-neutral">{t("classroom.due.nothingSoon")}</p>
      ) : (
        <ul className="mt-2 space-y-3">
          {items.map((w) => {
            const state = dueState(w, today);
            return (
              <li key={w.id}>
                <p className={`text-[13px] ${state.kind === "missing" ? "font-semibold text-urgent" : "text-neutral"}`}>{dueLabel(t, state, locale, today)}</p>
                <Link href={hrefFor(w.id)} className="text-sm font-semibold text-ink underline-offset-2 hover:underline [overflow-wrap:anywhere]">
                  {w.title}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <Link href={viewAllHref} className="mt-3 inline-block text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
        {t("classroom.upcoming.viewAll")}
      </Link>
    </section>
  );
}
