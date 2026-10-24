// Account roles: student or teacher/counselor, chosen once at /welcome (table user_roles).
// Pure helpers only; the UI gating built on them is client-side, real access control is in the database.

export type Role = "student" | "teacher";

export function parseRole(v: unknown): Role | null {
  return v === "student" || v === "teacher" ? v : null;
}

export function validateTeacher(i: { displayName: string; school: string }):
  | { ok: true; value: { displayName: string; school: string | null } }
  | { ok: false; error: string } {
  const displayName = i.displayName.trim();
  if (!displayName) return { ok: false, error: "Enter your name." };
  return { ok: true, value: { displayName, school: i.school.trim() || null } };
}

/** Pages that only make sense for a student (their own list, profile, résumé…). */
export const STUDENT_ONLY_PATHS = ["/profile", "/application", "/activities", "/resume", "/connect-ai", "/oauth", "/start", "/pricing"] as const;

export function isStudentOnlyPath(pathname: string): boolean {
  return STUDENT_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function homePathFor(role: Role | null): string {
  if (role === "teacher") return "/teacher";
  if (role === "student") return "/application/list";
  return "/welcome";
}

/**
 * Where a signed-in user should be sent instead of the page they are on, or null to stay.
 * `role` is undefined while loading or signed out, null when signed in with no role chosen yet.
 */
export function redirectFor(role: Role | null | undefined, pathname: string, signedIn: boolean): string | null {
  if (!signedIn || role === undefined) return null;
  // The AI-connection consent screen is mid-flow elsewhere; don't lose it by detouring through /welcome.
  if (role === null) return pathname === "/welcome" || pathname.startsWith("/oauth/") ? null : "/welcome";
  if (pathname === "/welcome") return homePathFor(role);
  if (role === "teacher" && isStudentOnlyPath(pathname)) return "/teacher";
  return null;
}

const STUDENT_NAV = [
  ["/colleges", "Colleges"],
  ["/compare", "Compare"],
  ["/application", "My application"],
  ["/activities", "Activities"],
  ["/resume", "Resume"],
  ["/connect-ai", "Connect AI"],
  ["/pricing", "Pricing"],
] as const;

const TEACHER_NAV = [
  ["/colleges", "Colleges"],
  ["/compare", "Compare"],
  ["/teacher", "Dashboard"],
  ["/teacher/classes", "Classes"],
  ["/teacher/students", "Students"],
  ["/teacher/deadlines", "Deadlines"],
] as const;

export function navFor(role: Role | null | undefined): readonly (readonly [href: string, label: string])[] {
  return role === "teacher" ? TEACHER_NAV : STUDENT_NAV;
}

/** Plain wording for the errors change_my_role can return. */
export function roleChangeMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("leave your teachers first")) return "Leave your teachers and counselors first (see My counselors and teachers above), then switch.";
  if (m.includes("remove your students first")) return "Remove all your linked students first (see Classes and One-on-one students), then switch.";
  if (m.includes("teacher name required")) return "Enter your name.";
  return message || "Something went wrong. Please try again.";
}
