// Display helpers for the teacher's private notes: when a note was written and whether it was edited afterwards.

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
