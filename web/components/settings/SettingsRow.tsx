// One area of /settings: its title and a plain sentence about it in a label column, its controls in a quiet panel
// beside it (stacked on a phone). Areas are split by one full-width rule. Presentation only.

import type { ReactNode } from "react";

/** The panel an area's controls sit in: one tone step from the white page, no outline. */
export const SETTINGS_PANEL = "rounded-3xl bg-zinc-50 p-5 sm:p-6";

export function SettingsRow({
  id,
  headingId,
  title,
  description,
  children,
  panel = true,
  className = "",
}: {
  id?: string;
  headingId: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** false when the area draws its own surfaces (the pass ticket, the payment history). */
  panel?: boolean;
  className?: string;
}) {
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`grid scroll-mt-4 gap-4 border-t border-zinc-200 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12 ${className}`}
    >
      <div className="space-y-2">
        <h2 id={headingId} className="font-display text-xl font-bold tracking-tight text-ink">
          {title}
        </h2>
        {description && <div className="max-w-sm text-[15px] leading-relaxed text-zinc-700">{description}</div>}
      </div>
      <div className={`min-w-0 ${panel ? SETTINGS_PANEL : ""}`}>{children}</div>
    </section>
  );
}
