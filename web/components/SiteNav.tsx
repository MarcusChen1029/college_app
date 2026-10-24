"use client";

import Link from "next/link";
import { AccountLink } from "@/components/AccountPanel";
import { navFor } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";

/** The header links; teachers get their own set and no "Get started" button. */
export function SiteNav() {
  const { role } = useStudent();
  return (
    <>
      <div className="flex items-center gap-5">
        {navFor(role).map(([href, label]) => (
          <Link key={href} href={href} className="text-zinc-600 hover:text-blue-600">
            {label}
          </Link>
        ))}
      </div>
      <span className="ml-auto flex items-center gap-4">
        <AccountLink />
        {role !== "teacher" && (
          <Link href="/start" className="rounded-full bg-ink px-4 py-1.5 text-white hover:bg-blue-700">
            Get started
          </Link>
        )}
      </span>
    </>
  );
}
