"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { PAGE_INTRO, PAGE_TITLE } from "@/lib/ui";

// The places most people were heading: where the colleges are, their own list, and what Trakur is.
const PLACES: { href: string; title: MessageKey; hint: MessageKey }[] = [
  { href: "/colleges", title: "nav.explore", hint: "notFound.exploreHint" },
  { href: "/application/list", title: "nav.myList", hint: "notFound.listHint" },
  { href: "/", title: "nav.home", hint: "notFound.homeHint" },
];

/** The path as a person typed it (%20 shown as a space), so a typo is easy to spot. */
function readable(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Any unknown address. A missing college says so; anything else is a page we can't find. An app screen: slim footer.
 *  The block sits in the middle of the space between the header and the footer, so the short page reads as placed. */
export default function NotFound() {
  const t = useT();
  const path = usePathname() ?? "";
  const college = path.startsWith("/colleges/");
  return (
    <div
      data-app-screen
      className="mx-auto flex w-full max-w-7xl flex-col justify-center px-4 py-12 sm:min-h-[calc(100svh-14rem)] sm:py-16"
    >
      <h1 className={PAGE_TITLE}>{t(college ? "notFound.collegeTitle" : "notFound.title")}</h1>
      <p className={`${PAGE_INTRO} mt-3`}>{t(college ? "notFound.body" : "notFound.pageBody")}</p>
      {path.length > 1 && (
        <p className="mt-3 text-[15px] text-zinc-700">
          {t("notFound.address")} <span className="break-all font-semibold text-ink">{readable(path)}</span>
        </p>
      )}
      <ul className="mt-8 grid gap-3 md:grid-cols-3">
        {PLACES.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="group flex h-full flex-col gap-2 rounded-3xl bg-zinc-50 p-6 transition-colors hover:bg-zinc-100 sm:p-7"
            >
              <span className="flex items-center justify-between font-display text-2xl font-bold text-ink">
                {t(p.title)}
                <span aria-hidden className="text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-ink">
                  →
                </span>
              </span>
              <span className="text-[15px] text-zinc-700">{t(p.hint)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
