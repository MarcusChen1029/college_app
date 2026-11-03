"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { readPendingCode } from "@/lib/join-invite";
import { redirectFor } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";

/**
 * Sends signed-in users to /welcome until they pick a role, and keeps teachers off the student-only pages. A student who
 * leaves /welcome with a class invite code saved in this tab is sent back to /join instead of home (redirectFor's `joining`),
 * so the two redirects can never disagree. Renders nothing.
 */
export function RoleGate() {
  const { auth, role } = useStudent();
  const pathname = usePathname();
  const router = useRouter();
  // Only read once there is a role to act on (a signed-out or loading render, including the server's, never looks at storage).
  const joining = !!auth && role === "student" && pathname === "/welcome" && readPendingCode() !== null;
  const target = redirectFor(role, pathname, !!auth, joining);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  return null;
}
