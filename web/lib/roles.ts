// Account roles: student or teacher/counselor, chosen once at /welcome (table user_roles).
// Pure helpers only; the UI gating built on them is client-side, real access control is in the database.

import type { ClassroomUnread } from "./classroom.ts";

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

/** Pages that only make sense for a student (their own list, profile, tools…). */
export const STUDENT_ONLY_PATHS = ["/profile", "/application", "/activities", "/resume", "/connect-ai", "/oauth", "/start", "/pricing", "/redeem", "/materials", "/tools", "/counselor"] as const;

export function isStudentOnlyPath(pathname: string): boolean {
  return STUDENT_ONLY_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function homePathFor(role: Role | null): string {
  if (role === "teacher") return "/teacher";
  if (role === "student") return "/application/list";
  return "/welcome";
}

/**
 * Where a freshly chosen role lands when it leaves /welcome. A student with a class invite code waiting (`joining`, see
 * lib/join-invite.ts) goes back to /join to finish joining; everyone else goes home.
 */
export function homeAfterWelcome(role: Role, joining: boolean): string {
  return role === "student" && joining ? "/join" : homePathFor(role);
}

/**
 * Where a signed-in user should be sent instead of the page they are on, or null to stay.
 * `role` is undefined while loading or signed out, null when signed in with no role chosen yet. `joining` says a class
 * invite code is saved in this tab; it only changes where a student goes from /welcome (homeAfterWelcome).
 */
export function redirectFor(role: Role | null | undefined, pathname: string, signedIn: boolean, joining = false): string | null {
  if (!signedIn || role === undefined) return null;
  // The AI-connection consent screen and the extension's sign-in popup are mid-flow elsewhere; don't lose them by detouring through
  // /welcome (the extension popup must end at the extension's own address). Those pages tell a no-role user what to do instead.
  // Share links (/share/...) are read-only pages for anyone holding the link, whatever their own account is.
  // /join (an invite link) has to load for a no-role account too: it saves the invite code first, then sends them to /welcome itself.
  if (pathname.startsWith("/share/")) return null;
  if (role === null) return pathname === "/welcome" || pathname === "/join" || pathname.startsWith("/oauth/") || pathname.startsWith("/extension/") ? null : "/welcome";
  if (pathname === "/welcome") return homeAfterWelcome(role, joining);
  if (role === "teacher" && isStudentOnlyPath(pathname)) return "/teacher";
  return null;
}

export type NavItem = readonly [href: string, label: string];

const STUDENT_NAV: readonly NavItem[] = [
  ["/colleges", "Explore"],
  ["/compare", "Compare"],
  ["/application", "My colleges"],
  ["/materials", "Materials"],
  ["/tools", "Tools"],
  ["/profile", "Profile"],
];

/** The student nav of someone linked to a teacher: Counselors sits right after My colleges. */
const LINKED_STUDENT_NAV: readonly NavItem[] = [...STUDENT_NAV.slice(0, 3), ["/counselor", "Counselors"], ...STUDENT_NAV.slice(3)];

const TEACHER_NAV: readonly NavItem[] = [
  ["/teacher", "Home"],
  ["/teacher/students", "Students"],
  ["/teacher/classes", "Classes"],
  ["/teacher/messages", "Messages"],
  ["/teacher/tasks", "Tasks"],
  ["/teacher/deadlines", "Deadlines"],
  ["/colleges", "Explore"],
  ["/compare", "Compare"],
];

/** The tabs under the Students page's title: the roster and the class charts (spec 5.1: Charts is a tab of Students, not a nav item). */
export const STUDENTS_TABS: readonly NavItem[] = [
  ["/teacher/students", "Roster"],
  ["/teacher/charts", "Charts"],
];

const PUBLIC_NAV: readonly NavItem[] = [
  ["/colleges", "Explore"],
  ["/pricing", "Pricing"],
  ["/help", "Help"],
];

const STUDENT_MENU: readonly NavItem[] = [
  ["/settings", "Settings"],
  ["/connect-ai", "Connect AI"],
  ["/pricing", "Plan & billing"],
  ["/redeem", "Redeem code"],
  ["/help", "Help"],
];

const TEACHER_MENU: readonly NavItem[] = [
  ["/settings", "Settings"],
  ["/help", "Help"],
];

/**
 * Header links: teachers get theirs; signed-in or started students the student nav (with Counselors once they are
 * `linked` to a teacher); other visitors the public nav.
 */
export function navFor(role: Role | null | undefined, opts: { signedIn: boolean; started: boolean; linked?: boolean }): readonly NavItem[] {
  if (role === "teacher") return TEACHER_NAV;
  if (!opts.signedIn && !opts.started) return PUBLIC_NAV;
  return opts.linked ? LINKED_STUDENT_NAV : STUDENT_NAV;
}

/**
 * The nav hrefs that carry an unread dot: a student's Counselors link when an announcement or a comment is waiting, a
 * teacher's Messages link when a student's message is. Nothing while the numbers are loading or for someone without a role.
 */
export function navDots(role: Role | null | undefined, u: ClassroomUnread | null): ReadonlySet<string> {
  const dots = new Set<string>();
  if (!u) return dots;
  if (role === "student" && u.posts + u.conversations > 0) dots.add("/counselor");
  if (role === "teacher" && u.conversations > 0) dots.add("/teacher/messages");
  return dots;
}

/** Items under the username (before the divider and Sign out); anything but a teacher gets the student menu. */
export function accountMenuFor(role: Role | null | undefined): readonly NavItem[] {
  return role === "teacher" ? TEACHER_MENU : STUDENT_MENU;
}

/** A signed-out visitor has "started" once they saved a college or entered a score. */
export function hasStarted(s: { collegeCount: number; hasScore: boolean }): boolean {
  return s.collegeCount > 0 || s.hasScore;
}

/** `hasStarted` for a student state: a saved or starred college, a test score, or any English test score. */
export function startedFrom(s: {
  list: readonly unknown[];
  profile: { sat?: number | null; act?: number | null; interested?: readonly unknown[]; tests?: { english?: Record<string, { total?: number | null } | undefined> } };
}): boolean {
  const english = Object.values(s.profile.tests?.english ?? {});
  const hasScore = s.profile.sat != null || s.profile.act != null || english.some((e) => e?.total != null);
  return hasStarted({ collegeCount: s.list.length + (s.profile.interested?.length ?? 0), hasScore });
}

/** Pages that live under another page's nav item: Charts is a tab of Students. */
const NAV_PARENTS: readonly (readonly [page: string, navHref: string])[] = [["/teacher/charts", "/teacher/students"]];

/** The nav href that matches the current page: the longest whole-segment prefix of `pathname`, or null. */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  const parent = NAV_PARENTS.find(([page]) => pathname === page || pathname.startsWith(`${page}/`));
  const path = parent ? parent[1] : pathname;
  let best: string | null = null;
  for (const h of hrefs) {
    if ((path === h || path.startsWith(`${h}/`)) && (best === null || h.length > best.length)) best = h;
  }
  return best;
}

/** Plain wording for the errors change_my_role can return. */
export function roleChangeMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("leave your teachers first")) return "Leave your teachers and counselors first (see Counselors and teachers above), then switch.";
  if (m.includes("remove your students first")) return "Remove all your linked students first (see Classes and One-on-one students), then switch.";
  if (m.includes("teacher name required")) return "Enter your name.";
  return message || "Something went wrong. Please try again.";
}
