// Words, in the reader's language, the classroom components show for things lib/*.ts describes in English (pattern of
// components/TeacherText.ts): what a conversation is about, and error messages.

import { genericLabelKey } from "@/lib/anchors";
import { classroomErrorMessage, type AnchorInfo } from "@/lib/classroom";
import type { MessageKey, TFunction } from "@/lib/i18n";

// "Due Thursday" / "Missing · 2 days late" / "Done Oct 30" (lib/due-label.ts holds it so it can be unit-tested).
export { dueLabel } from "@/lib/due-label";

/** Text fields in the classroom dialogs: a 1px border and the same focus ring as the app's other fields. */
export const TEXTAREA_CLASS =
  "block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-ink placeholder:text-zinc-500 hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200";

const SECTION_NAME: Readonly<Record<string, MessageKey>> = {
  colleges: "classroom.anchor.section.colleges",
  essays: "classroom.anchor.section.essays",
  activities: "classroom.anchor.section.activities",
  profile: "classroom.anchor.section.profile",
};

/**
 * What a chip says for an item: the saved label when the viewer may see it, otherwise a description of the kind
 * ("General", "Your essays" / "Their essays", the Personal statement, "UC PIQ 3") or, for anything else, a generic
 * name ("A college"). A teacher is never sent a label for an item that is not shared with them, so this is what they get.
 */
export function anchorText(t: TFunction, info: AnchorInfo, role: "teacher" | "student"): string {
  if (info.label) return info.label;
  const { kind, ref } = info.anchor;
  if (kind === "general") return t("classroom.anchor.general");
  if (kind === "section" && ref && SECTION_NAME[ref]) {
    return t(role === "student" ? "classroom.anchor.yours" : "classroom.anchor.theirs", { section: t(SECTION_NAME[ref]) });
  }
  if (kind === "essay" && ref) {
    if (ref === "ps") return t("writing.psName");
    const piq = /^uc:([1-8])$/.exec(ref);
    if (piq) return t("writing.ucName", { n: piq[1] });
  }
  return t(`classroom.anchor.generic.${genericLabelKey(kind)}` as MessageKey);
}

// The server's errors all start with "classroom: <kind>". lib/classroom-api.ts has already turned them into English
// (classroomErrorMessage), so match either form: the raw text, or exactly the English sentence that kind maps to.
const ERROR_KINDS: readonly (readonly [string, MessageKey])[] = [
  ["limit", "classroom.err.limit"],
  ["not linked", "classroom.err.notLinked"],
  ["not found", "classroom.err.notFound"],
  ["invalid", "classroom.err.invalid"],
  ["rate", "classroom.err.rate"],
];

// validateMessage and validatePost (lib/classroom.ts) return these sentences. A pattern with a capture group fills {n}.
const VALIDATION_ERRORS: readonly (readonly [RegExp, MessageKey])[] = [
  [/^Write a message first\.$/, "classroom.err.messageEmpty"],
  [/^Keep the message under (\d+) characters\.$/, "classroom.err.messageLong"],
  [/^Enter a title for the announcement\.$/, "classroom.err.postTitleEmpty"],
  [/^Keep the title under (\d+) characters\.$/, "classroom.err.postTitleLong"],
  [/^Write the announcement\.$/, "classroom.err.postBodyEmpty"],
  [/^Keep the text under (\d+) characters\.$/, "classroom.err.postBodyLong"],
  [/^Keep the link under (\d+) characters\.$/, "classroom.err.postLinkLong"],
  [/^The link must start with http:\/\/ or https:\/\/\.$/, "classroom.err.postLinkBad"],
];

/** An error from a classroom call or from validateMessage / validatePost, in the reader's language. Anything unknown becomes the generic retry line. */
export function classroomError(t: TFunction, e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const lower = raw.toLowerCase();
  for (const [kind, key] of ERROR_KINDS) {
    if (lower.includes(`classroom: ${kind}`) || raw === classroomErrorMessage(`classroom: ${kind}`)) return t(key);
  }
  for (const [pattern, key] of VALIDATION_ERRORS) {
    const m = pattern.exec(raw);
    if (m) return t(key, { n: m[1] ?? "" });
  }
  return t("common.tryAgain");
}

/** "Nov 2" / "11月2日", or "" for a time that cannot be read. `tag` is the BCP 47 tag for the reader's language. */
export function shortDate(iso: string | null, tag: string): string {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(ms) ? "" : new Date(ms).toLocaleDateString(tag, { month: "short", day: "numeric" });
}

/** When a message arrived, for a list: the time of day for today, "Yesterday", otherwise the short date. "" for a time that cannot be read. */
export function messageTime(t: TFunction, iso: string, now: Date, tag: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const at = new Date(ms);
  const day = (d: Date): number => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()); // calendar days in the reader's time zone
  const ago = Math.round((day(now) - day(at)) / 86_400_000);
  if (ago <= 0) return at.toLocaleTimeString(tag, { hour: "numeric", minute: "2-digit" });
  if (ago === 1) return t("teacher.time.yesterday");
  return shortDate(iso, tag);
}
