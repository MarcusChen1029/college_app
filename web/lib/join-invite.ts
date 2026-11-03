// Invite links (classroom phase 1, spec §4): /join#ABCD2345. The code sits in the URL fragment so it never reaches
// server logs; the page copies it to sessionStorage first because sign-in and role choice can drop the fragment.
// Pure helpers only; the database does the real validation (preview_code / redeem_code).

import type { Role } from "./roles.ts";
import { isPlausibleCode, normalizeCode, type CodeResult } from "./join-codes.ts";

export const PENDING_JOIN_KEY = "pending-join-code";

/** The link a teacher copies: the code goes after the #, so servers never see it. */
export const inviteUrl = (origin: string, code: string): string => `${origin}/join#${code}`;

/** Reads a code out of location.hash ("#abcd-2345" -> "ABCD2345"); null when it can't be a code. */
export function parseInviteHash(hash: string): string | null {
  const code = normalizeCode(hash.replace(/^#/, ""));
  return isPlausibleCode(code) ? code : null;
}

/** The given Storage, or sessionStorage; null when the browser blocks it (or there is none). */
function store(s?: Storage): Storage | null {
  try {
    return s ?? sessionStorage;
  } catch {
    return null;
  }
}

export function savePendingCode(code: string, s?: Storage): void {
  try {
    store(s)?.setItem(PENDING_JOIN_KEY, normalizeCode(code));
  } catch {
    // blocked or full: the code is then only in the address bar, which is fine
  }
}

/** The saved code, or null when there is none, it isn't a code, or storage is blocked. */
export function readPendingCode(s?: Storage): string | null {
  try {
    const v = store(s)?.getItem(PENDING_JOIN_KEY);
    return v && isPlausibleCode(v) ? normalizeCode(v) : null;
  } catch {
    return null;
  }
}

export function clearPendingCode(s?: Storage): void {
  try {
    store(s)?.removeItem(PENDING_JOIN_KEY);
  } catch {
    // nothing to clear
  }
}

export type InviteStep = "loading" | "sign_in" | "welcome" | "teacher" | "no_code" | "preview";

/**
 * What the /join page shows. `role` is undefined while it is loading, null for a signed-in account that hasn't
 * chosen one yet. Only a student with a code gets to the preview; a student without one gets the empty code box.
 */
export function inviteStep(s: { sessionChecked: boolean; signedIn: boolean; role: Role | null | undefined; code: string | null }): InviteStep {
  if (!s.sessionChecked) return "loading";
  if (!s.signedIn) return "sign_in";
  if (s.role === undefined) return "loading";
  if (s.role === null) return "welcome";
  if (s.role === "teacher") return "teacher";
  return s.code ? "preview" : "no_code";
}

/** The saved code is cleared after a join, a cancel or a failed preview; only a good preview keeps it. */
export const keepPendingAfter = (r: CodeResult): boolean => r.ok;
