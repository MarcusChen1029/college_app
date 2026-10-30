"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n/client";
import { startedFrom } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

/**
 * The landing page's phone-only "Get started" bar, pinned to the bottom. Only for new visitors, as in the header, and
 * only while none of the page's own start buttons (`data-home-cta`) is on screen, so it never doubles one up.
 */
export function HomeStickyCta() {
  const student = useStudent();
  const t = useT();
  const [ctaInView, setCtaInView] = useState(true);
  const [scrollingUp, setScrollingUp] = useState(false);
  const eligible = student.ready && student.sessionChecked && !student.auth && student.role !== "teacher" && !startedFrom(student);

  useEffect(() => {
    if (!eligible || !("IntersectionObserver" in window)) return;
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      setCtaInView(seen.size > 0);
    });
    document.querySelectorAll("[data-home-cta]").forEach((el) => io.observe(el));
    // Like a browser's own toolbar: out of the way while reading down, back when the visitor scrolls up.
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 12) return;
      setScrollingUp(y < last);
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [eligible]);

  if (!eligible) return null;
  const hidden = ctaInView || !scrollingUp;
  return (
    <>
      {/* Keeps the bar from covering the end of the page. */}
      <div aria-hidden className="h-20 md:hidden" />
      <div
        aria-hidden={hidden}
        inert={hidden}
        className={`fixed inset-x-0 bottom-0 z-20 bg-zinc-50 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgb(18_48_74/0.14)] transition-transform duration-300 md:hidden print:hidden ${
          hidden ? "translate-y-full" : "translate-y-0"
        }`}
      >
        <Link href="/start" className={`${buttonClass("primary")} w-full`}>
          {t("account.getStarted")}
        </Link>
      </div>
    </>
  );
}
