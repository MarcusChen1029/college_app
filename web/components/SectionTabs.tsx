"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navLabel } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import type { NavItem } from "@/lib/roles";

/** An English nav label (as in lib/roles.ts and the tab lists) in the visitor's language, for server layouts. */
export function NavText({ label }: { label: string }) {
  return <>{navLabel(useT(), label)}</>;
}

export function SectionTabs({ label, tabs }: { label: string; tabs: readonly NavItem[] }) {
  const path = usePathname();
  const t = useT();
  return (
    <nav aria-label={navLabel(t, label)} className="flex flex-wrap gap-1 border-b border-zinc-200 print:hidden">
      {tabs.map(([href, text]) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${active ? "border-blue-700 text-ink" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {navLabel(t, text)}
          </Link>
        );
      })}
    </nav>
  );
}
