"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { AccountLink } from "@/components/AccountPanel";
import { activeNavHref, hasStarted, navFor, type Role } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";
import { buttonClass } from "@/lib/ui";

type NavState = { signedIn: boolean; started: boolean };

function NavLinks({ role, nav, pathname }: { role: Role | null | undefined; nav: NavState; pathname: string | null }) {
  const items = navFor(role, nav);
  const active = pathname === null ? null : activeNavHref(pathname, items.map(([href]) => href));
  return (
    <div className="flex items-center gap-5">
      {items.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={href === active ? "page" : undefined}
          className={
            href === active
              ? "font-semibold text-ink underline decoration-blue-700 decoration-[3px] underline-offset-8"
              : "text-zinc-600 hover:text-ink"
          }
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

// usePathname can suspend under cacheComponents, so it lives in its own boundary.
function ActiveNavLinks({ role, nav }: { role: Role | null | undefined; nav: NavState }) {
  return <NavLinks role={role} nav={nav} pathname={usePathname()} />;
}

/** The header links; teachers get their own set and no "Get started" button. */
export function SiteNav() {
  const { role, auth, list, profile } = useStudent();
  const english = Object.values(profile.tests?.english ?? {});
  const hasScore = profile.sat != null || profile.act != null || english.some((e) => e?.total != null);
  const nav = { signedIn: !!auth, started: hasStarted({ collegeCount: list.length + (profile.interested?.length ?? 0), hasScore }) };
  return (
    <>
      <Suspense fallback={<NavLinks role={role} nav={nav} pathname={null} />}>
        <ActiveNavLinks role={role} nav={nav} />
      </Suspense>
      <span className="ml-auto flex items-center gap-4">
        <AccountLink />
        {role !== "teacher" && (
          <Link href="/start" className={buttonClass("primary", "sm")}>
            Get started
          </Link>
        )}
      </span>
    </>
  );
}
