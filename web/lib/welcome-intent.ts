// The role a visitor picked on a /welcome card before leaving for Google. It lives in this tab's sessionStorage for ten
// minutes and is used once on the way back. It is never read from the URL: a link (/welcome?as=student) must not be able
// to choose a role for whoever opens it. Pure apart from the storage passed in; tests in welcome-intent.test.ts.

export type WelcomeRole = "student" | "teacher";

export const WELCOME_INTENT_KEY = "trakur:welcome-intent";
export const WELCOME_INTENT_TTL_MS = 10 * 60 * 1000;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** This tab's sessionStorage, or null where it is blocked (private modes, previews) or on the server. */
export function sessionStore(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

/** Remember the card the visitor clicked, just before the browser leaves for Google. */
export function saveWelcomeIntent(store: Store | null, role: WelcomeRole, now = Date.now()): void {
  try {
    store?.setItem(WELCOME_INTENT_KEY, JSON.stringify({ role, at: now }));
  } catch {
    // Storage blocked: the visitor comes back to the plain chooser, which is safe.
  }
}

/** The remembered card, when it is a known role and at most ten minutes old; null otherwise. Reading never changes it. */
export function readWelcomeIntent(store: Store | null, now = Date.now()): WelcomeRole | null {
  try {
    const raw = store?.getItem(WELCOME_INTENT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { role?: unknown; at?: unknown };
    const age = typeof v.at === "number" ? now - v.at : -1;
    const fresh = age >= 0 && age <= WELCOME_INTENT_TTL_MS;
    return fresh && (v.role === "student" || v.role === "teacher") ? v.role : null;
  } catch {
    return null;
  }
}

/** Forget it: done on the first load back, whatever happens next, so it is used once. */
export function clearWelcomeIntent(store: Store | null): void {
  try {
    store?.removeItem(WELCOME_INTENT_KEY);
  } catch {
    // Nothing to clear.
  }
}

export type WelcomeStep = "loading" | "signIn" | "saveStudent" | "teacherForm" | "choose";

/** What /welcome shows. Signed out: the two cards. Signed in with a role, or still loading: a placeholder (RoleGate moves them
 *  on). Signed in with no role: the student role is saved straight away only when the visitor clicked the student card in
 *  this tab (`intent`); the teacher card opens the name form; anything else is the plain chooser. A save that failed falls
 *  back to the chooser. */
export function welcomeStep(s: { ready: boolean; signedIn: boolean; role: string | null | undefined; intent: WelcomeRole | null; failed?: boolean }): WelcomeStep {
  if (!s.ready) return "loading";
  if (!s.signedIn) return "signIn";
  if (s.role !== null) return "loading";
  if (s.intent === "student" && !s.failed) return "saveStudent";
  if (s.intent === "teacher") return "teacherForm";
  return "choose";
}
