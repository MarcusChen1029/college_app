// Display helpers for the teacher's private notes: when a note was written and whether it was edited afterwards, and
// which notes are about an item.

import { anchorKey, type Anchor } from "./anchors.ts";
import type { AnchorInfo } from "./classroom.ts";

const EDITED_AFTER_MS = 60_000;

/** "Oct 24, 2026, 3:05 PM" in the reader's locale; an unreadable timestamp gives "". */
export function noteDate(iso: string, locale?: string, timeZone?: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  return new Date(t).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short", timeZone });
}

/** True when the note was changed more than a minute after it was written (saving right away doesn't count). */
export function noteEdited(createdAt: string, updatedAt: string): boolean {
  const c = Date.parse(createdAt);
  const u = Date.parse(updatedAt);
  return !Number.isNaN(c) && !Number.isNaN(u) && u - c > EDITED_AFTER_MS;
}

/** True when `body` is worth saving: not empty or whitespace, and within the length limit. */
export function noteSaveable(body: string, max: number): boolean {
  return body.trim().length > 0 && body.length <= max;
}

/** Plain wording for the database errors a teacher can hit (a student who left, a note already gone). */
export function noteErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("foreign key") || m.includes("violates row-level security")) return "This student is no longer linked to you, so the note can't be saved.";
  if (m.includes("note not found")) return "That note no longer exists. It may have been deleted when the student left.";
  if (m.includes("check constraint")) return "Notes can't be empty and are limited to 4000 characters.";
  return message || "Something went wrong. Please try again.";
}

export type NoteFilter = "all" | "general" | "item";

const hasItem = (n: { anchor: Pick<Anchor, "kind"> | null }): boolean => n.anchor !== null && n.anchor.kind !== "general";

/** The notes for the Notes tab's filter: all of them, the ones about the student in general, or the ones about an item. Keeps the order. */
export function filterNotes<T extends { anchor: Pick<Anchor, "kind"> | null }>(notes: readonly T[], f: NoteFilter): T[] {
  return notes.filter((n) => f === "all" || (f === "item" ? hasItem(n) : !hasItem(n)));
}

/**
 * What a note's chip is about, or null for a general note. `labels` maps anchorKey to the item's name in the student's record
 * as the teacher sees it (teacherAnchorOptions); a note keeps no name of its own, so an item that is no longer there
 * (a removed college, essays no longer shared) comes back without a label and unavailable, and the chip says so.
 */
export function noteAbout(anchor: Anchor | null, labels: ReadonlyMap<string, string>): AnchorInfo | null {
  if (!anchor || anchor.kind === "general") return null;
  const label = labels.get(anchorKey(anchor)) ?? null;
  return { anchor, label, available: label !== null };
}
