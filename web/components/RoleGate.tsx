"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { redirectFor } from "@/lib/roles";
import { useStudent } from "@/lib/student-store";

/** Sends signed-in users to /welcome until they pick a role, and keeps teachers off the student-only pages. Renders nothing. */
export function RoleGate() {
  const { auth, role } = useStudent();
  const pathname = usePathname();
  const router = useRouter();
  const target = redirectFor(role, pathname, !!auth);
  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);
  return null;
}
