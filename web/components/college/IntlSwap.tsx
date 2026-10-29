"use client";

import { useStudent } from "@/lib/student-store";

/** Shows `intl` instead of `all` when the visitor applies from abroad (profile.international) and the college publishes
 *  an international figure, so the answer band leads with the rate the student's fit is computed from. Signed-out
 *  visitors and US students keep `all`. */
export function IntlSwap({ all, intl }: { all: React.ReactNode; intl?: React.ReactNode }) {
  const student = useStudent();
  return <>{intl != null && student.profile.international ? intl : all}</>;
}
