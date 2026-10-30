// The sign-in dialog's rules for what this browser saved while signed out. Two things are never offered, sent or
// deleted by the dialog:
// - colleges the account's plan has no room for today (plan-merge.ts): they stay in this browser with their own portal
//   passwords until a pass makes room (My list's notice explains them);
// - passwords the student already agreed to move into the vault that wait for it to open (student-local.ts
//   byAgreement, MOVE_KEY): they move when the vault opens (student-store.ts moveLocalPasswords).
// Pure so the combined rules can be tested; student-store.ts does the reading and writing.

import { mergeOffer, splitPasswords } from "./plan-merge.ts";
import { loginCount, type SlotPassword } from "./portal-slots.ts";
import { byAgreement, EMPTY_LOCAL, hasLocalData, type LocalData } from "./student-local.ts";
import type { ListEntry } from "./student-rows.ts";

/** What this browser saved while signed out, as offered to the account at sign-in. */
export type LocalFound = { colleges: number; logins: number; passwords: number };

/**
 * This browser's passwords as the sign-in dialog sees them. `offered`: the only ones it counts, sends ("Add") or
 * deletes ("Don't add"). `stay`: those of kept colleges' own portals. `agreed`: those waiting for the vault. An agreed
 * password of a kept college is in both `stay` and `agreed`, never in `offered`.
 */
export type OfferPasswords = { offered: SlotPassword[]; stay: SlotPassword[]; agreed: SlotPassword[] };

/**
 * What this browser's copy can offer the signed-in account, worked out again on every read. `accountList` is the
 * account's list as read, `limit` the college limit of its plan today (null = none), `agreed` the slots this account's
 * student already agreed to move (student-local.ts agreedFor). Only the local colleges that fit join (`fit.insert`);
 * the rest (`fit.keep`, `fit.leftover`) stay. `found` is null when nothing can be added, so the dialog is shown only
 * while something can.
 */
export function localOffer(
  local: LocalData,
  passwords: readonly SlotPassword[],
  accountList: readonly ListEntry[],
  limit: number | null,
  agreed: ReadonlySet<string>,
) {
  const missing = local.list.filter((e) =>
    e.custom ? !!e.rowId && !accountList.some((x) => x.rowId === e.rowId) : !!e.institutionId && !accountList.some((x) => x.institutionId === e.institutionId),
  );
  const fit = mergeOffer(accountList.length, missing, limit);
  const { movable, stay } = splitPasswords(fit.keep, passwords);
  const pw: OfferPasswords = { offered: byAgreement(movable, agreed).offered, stay, agreed: byAgreement(passwords, agreed).agreed };
  const rest = local.list.filter((e) => !fit.keep.includes(e));
  const found: LocalFound | null = hasLocalData({ ...local, list: rest }, pw.offered)
    ? { colleges: fit.offerCount, logins: loginCount(local.profile.portals, rest, pw.offered), passwords: pw.offered.length }
    : null;
  return { fit, pw, found };
}

/** The first password per slot. */
const unique = (list: readonly SlotPassword[]) => list.filter((p, i) => list.findIndex((q) => q.slot === p.slot) === i);

/**
 * This browser's passwords after "Add". Only `pw.offered` was paired with the account (portal-slots.ts pairWithAccount)
 * and its `send` part sent: `notStored` (every sent one while the vault is locked or not set up) stay and wait for the
 * vault; `hold` (the account has a different username there) stay and never move on their own. Kept colleges'
 * passwords and the ones agreed earlier were never sent and stay as they are.
 * - `passwords`: what stays in this browser (under LEGACY_KEY).
 * - `failed`: what this "Add" could not store (not stored or held); the never-sent ones did not fail.
 * - `moveSlots`: the agreement to write under MOVE_KEY: the slots agreed earlier plus the sent-but-not-stored ones, as
 *   far as they are still in this browser. A kept college's slot is in it only when it was agreed before.
 */
export function afterAdd(pw: Pick<OfferPasswords, "stay" | "agreed">, sent: { notStored: readonly SlotPassword[]; hold: readonly SlotPassword[] }) {
  const passwords = unique([...sent.notStored, ...sent.hold, ...pw.stay, ...pw.agreed]);
  const waiting = new Set([...pw.agreed, ...sent.notStored].map((p) => p.slot));
  return { passwords, failed: sent.notStored.length + sent.hold.length, moveSlots: passwords.filter((p) => waiting.has(p.slot)).map((p) => p.slot) };
}

/** The signed-out copy that stays once the rest has moved or been discarded: only the colleges kept for lack of room. */
export const keptCopy = (keep: readonly ListEntry[]): LocalData => (keep.length ? { ...EMPTY_LOCAL, list: [...keep] } : EMPTY_LOCAL);

/**
 * "Don't add": deletes exactly what the dialog offered. Every password it did not offer stays (the agreed ones, whose
 * agreement under MOVE_KEY is not touched, and kept colleges' own), and so do the kept colleges (`local`).
 */
export function afterDiscard(passwords: readonly SlotPassword[], offer: { fit: { keep: readonly ListEntry[] }; pw: Pick<OfferPasswords, "offered"> }) {
  const offered = new Set(offer.pw.offered.map((p) => p.slot));
  return { passwords: passwords.filter((p) => !offered.has(p.slot)), local: keptCopy(offer.fit.keep) };
}
