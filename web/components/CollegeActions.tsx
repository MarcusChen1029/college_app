"use client";

import Link from "next/link";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";
import { useT } from "@/lib/i18n/client";

/** The college page's list actions: add to (or remove from) my list, and an Interested toggle while the college isn't on the
 *  list. Signed out both save to localStorage. Teachers have no personal list. The student's fit is shown in the page's
 *  answer band (components/college/FitAnswer.tsx), next to the admit rate it is computed from. */
export function CollegeActions({ slug, id }: { slug: string; id: string }) {
  const t = useT();
  const student = useStudent();
  if (student.role === "teacher") return null; // teachers have no personal college list
  const inList = student.has(slug);
  const interested = student.isInterested(slug);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {!inList && !student.canAdd ? (
        <Link href="/pricing" className={buttonClass("secondary")}>
          {t("college.listFull", { plan: t(`payments.planName.${student.plan.key}`) })}
        </Link>
      ) : (
        <button
          type="button"
          className={buttonClass(inList ? "secondary" : "primary", "md", inList)}
          onClick={() => (inList ? student.remove(slug) : student.add({ slug, id }))}
        >
          {inList ? <Icon d="M20 6 9 17l-5-5" /> : <Icon d="M12 5v14M5 12h14" />}
          {inList ? t("college.inMyList") : t("college.addToList")}
        </button>
      )}
      {!inList && (
        <button
          type="button"
          aria-pressed={interested}
          className={buttonClass("secondary", "md", interested)}
          onClick={() => student.toggleInterested(slug)}
          title={interested ? t("college.interestedRemove") : t("college.interestedTitle")}
        >
          <Icon d="m12 3.5 2.6 5.3 5.9.9-4.25 4.1 1 5.8L12 16.9l-5.25 2.7 1-5.8L3.5 9.7l5.9-.9z" filled={interested} />
          {t("college.interested")}
        </button>
      )}
    </div>
  );
}

/** An 18px outline icon; `filled` is the pressed state of a toggle. */
function Icon({ d, filled = false }: { d: string; filled?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
