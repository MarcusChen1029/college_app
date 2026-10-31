"use client";

// One area of /settings: its title and a plain sentence about it in a label column, its controls in a quiet panel
// beside it (stacked on a phone). Areas are split by one full-width rule. Presentation only.

import { useEffect, useRef, type ReactNode } from "react";

/** The panel an area's controls sit in: one tone step from the white page, no outline. */
export const SETTINGS_PANEL = "rounded-3xl bg-zinc-50 p-5 sm:p-6";

export function SettingsRow({
  id,
  headingId,
  title,
  description,
  aside,
  children,
  panel = true,
  className = "",
}: {
  id?: string;
  headingId: string;
  title: ReactNode;
  description?: ReactNode;
  /** A short summary under the description (the pass on the plan row, Sign out on the account row), so the label
   *  column beside a tall panel isn't left empty. */
  aside?: ReactNode;
  children: ReactNode;
  /** false when the area draws its own surfaces (the pass ticket, the payment history). */
  panel?: boolean;
  className?: string;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  // Opened by a link to this area (/settings#passwords): keyboard and screen-reader users land on it too. The page
  // scrolls there (SettingsPage); the heading takes focus when the area mounts, which for some areas is after that.
  useEffect(() => {
    if (id && window.location.hash === `#${id}`) heading.current?.focus({ preventScroll: true });
  }, [id]);
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`grid scroll-mt-[25rem] items-start gap-4 lg:scroll-mt-56 border-t border-zinc-200 py-8 lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-10 xl:grid-cols-[19rem_minmax(0,1fr)] ${className}`}
    >
      <div className="space-y-2">
        <h2 ref={heading} id={headingId} tabIndex={-1} className="font-display text-xl font-bold tracking-tight text-ink focus:outline-none">
          {title}
        </h2>
        {description && <div className="max-w-sm text-[15px] leading-relaxed text-zinc-700">{description}</div>}
        {aside && <div className="pt-3">{aside}</div>}
      </div>
      <div className={`min-w-0 ${panel ? SETTINGS_PANEL : ""}`}>{children}</div>
    </section>
  );
}
