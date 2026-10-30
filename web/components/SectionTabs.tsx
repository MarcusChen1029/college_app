"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { navLabel } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { NavItem } from "@/lib/roles";

/** An English nav label (as in lib/roles.ts and the tab lists) in the visitor's language, for server layouts. */
export function NavText({ label }: { label: string }) {
  return <>{navLabel(useT(), label)}</>;
}

/**
 * The tabs under an app screen's title (My colleges, Writing): plain links in sentence case, the current one a filled ink
 * pill, as on the college page's jump bar. Separated from the page by space, not a hairline. On a phone the row scrolls
 * sideways inside itself (never the page) and keeps the current tab in view.
 */
export function SectionTabs({ label, tabs }: { label: string; tabs: readonly NavItem[] }) {
  const path = usePathname();
  const t = useT();
  const rowRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const row = rowRef.current;
    const on = row?.querySelector<HTMLElement>("[aria-current=page]");
    if (!row || !on) return;
    // Scroll the row only (scrollIntoView would also move the page).
    const left = on.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft || left + on.offsetWidth > row.scrollLeft + row.clientWidth) row.scrollLeft = left - 16;
  }, [path]);

  return (
    <nav aria-label={navLabel(t, label)} className="print:hidden">
      {/* On a phone the row fades out at its right edge (as the college page's jump bar does), so a cut label reads as
          "scroll for more"; the end padding lets the last tab scroll clear of the fade. */}
      <ul
        ref={rowRef}
        className="flex gap-1 overflow-x-auto py-1.5 pl-1 pr-10 [mask-image:linear-gradient(to_right,#000_calc(100%-2.5rem),transparent)] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:p-0 sm:[mask-image:none] [&::-webkit-scrollbar]:hidden"
      >
        {tabs.map(([href, text]) => {
          const active = path === href;
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-10 items-center rounded-full px-4 text-[15px] font-semibold whitespace-nowrap transition-colors ${
                  active ? "bg-ink text-white" : "text-zinc-700 hover:bg-zinc-100 hover:text-ink"
                }`}
              >
                {navLabel(t, text)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
