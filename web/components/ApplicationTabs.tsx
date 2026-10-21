"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/application/interested", "Interested"],
  ["/application/list", "My list"],
  ["/application/results", "Results"],
  ["/application/portals", "Portals"],
] as const;

export function ApplicationTabs() {
  const path = usePathname();
  return (
    <nav aria-label="My application" className="flex flex-wrap gap-1 border-b border-zinc-200">
      {TABS.map(([href, label]) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${active ? "border-blue-600 text-blue-700" : "border-transparent text-zinc-500 hover:text-zinc-800"}`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
