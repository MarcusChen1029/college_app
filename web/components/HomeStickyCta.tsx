"use client";

import Link from "next/link";
import { useT } from "@/lib/i18n/client";
import { startedFrom } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

/** The landing page's phone-only "Get started" bar, pinned to the bottom. Only for new visitors, as in the header. */
export function HomeStickyCta() {
  const student = useStudent();
  const t = useT();
  if (!student.ready || !student.sessionChecked || student.auth || student.role === "teacher" || startedFrom(student)) return null;
  return (
    <>
      {/* Keeps the bar from covering the end of the page. */}
      <div aria-hidden className="h-20 md:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-blue-100 bg-white/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:hidden print:hidden">
        <Link href="/start" className={`${buttonClass("primary")} w-full`}>
          {t("account.getStarted")}
        </Link>
      </div>
    </>
  );
}
