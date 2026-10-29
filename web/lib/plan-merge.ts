// The first-sign-in merge under a list limit. Colleges saved in this browser while signed out join the account only
// as far as the account's plan allows: the account's own colleges count first, then the local ones go in, oldest
// (addedAt) first. The rest stay in this browser's copy, untouched, until the account can take them (after buying the
// pass, the next merge adds them). Pure: student-store.ts does the reading and writing.

import { collegeSlot } from "./portal-slots.ts";

/** `limit` null = no limit (everything is inserted). Both lists are in addedAt order; equal addedAt keeps input order. */
export function splitMerge<T extends { addedAt: string }>(existingCount: number, missing: readonly T[], limit: number | null): { insert: T[]; keep: T[] } {
  const ordered = [...missing].sort((a, b) => (a.addedAt < b.addedAt ? -1 : a.addedAt > b.addedAt ? 1 : 0)); // stable
  const room = limit == null ? ordered.length : Math.max(0, limit - existingCount);
  return { insert: ordered.slice(0, room), keep: ordered.slice(room) };
}

/**
 * This browser's saved passwords, split for the merge: those of a kept college's own portal (slot "college:" + its
 * institution id, or row id for a typed-in college; portal-slots.ts collegeSlot) `stay` in the browser with it; the
 * rest are `movable` into the account. Input order is kept and nothing is dropped.
 */
export function splitPasswords<P extends { slot: string }>(keep: readonly { custom?: unknown; rowId?: string; institutionId?: string }[], passwords: readonly P[]): { movable: P[]; stay: P[] } {
  const kept = new Set(keep.map((e) => collegeSlot(e)).filter((s): s is string => !!s));
  return { movable: passwords.filter((p) => !kept.has(p.slot)), stay: passwords.filter((p) => kept.has(p.slot)) };
}

/**
 * What a sign-in can offer from this browser's colleges, worked out again on every account read: only those that fit
 * the account's plan today (`insert`, `offerCount`). The rest (`keep`, `leftover`) are never offered; My list says
 * they stay in this browser until a pass makes room.
 */
export function mergeOffer<T extends { addedAt: string }>(listLength: number, missing: readonly T[], limit: number | null): { insert: T[]; keep: T[]; offerCount: number; leftover: number } {
  const { insert, keep } = splitMerge(listLength, missing, limit);
  return { insert, keep, offerCount: insert.length, leftover: keep.length };
}
