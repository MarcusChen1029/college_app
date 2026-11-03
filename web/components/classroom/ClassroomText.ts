// Words, in the reader's language, the classroom components show for things lib/*.ts describes in English (pattern of
// components/TeacherText.ts): what a conversation is about, and error messages.

import { genericLabelKey } from "@/lib/anchors";
import { classroomErrorMessage, type AnchorInfo } from "@/lib/classroom";
import type { MessageKey, TFunction } from "@/lib/i18n";

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

// validateMessage (lib/classroom.ts) returns these two sentences.
const MESSAGE_EMPTY = /^Write a message first\.$/;
const MESSAGE_LONG = /^Keep the message under (\d+) characters\.$/;

/** An error from a classroom call or from validateMessage, in the reader's language. Anything unknown becomes the generic retry line. */
export function classroomError(t: TFunction, e: unknown): string {
  const raw = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  const lower = raw.toLowerCase();
  for (const [kind, key] of ERROR_KINDS) {
    if (lower.includes(`classroom: ${kind}`) || raw === classroomErrorMessage(`classroom: ${kind}`)) return t(key);
  }
  if (MESSAGE_EMPTY.test(raw)) return t("classroom.err.messageEmpty");
  const long = MESSAGE_LONG.exec(raw);
  if (long) return t("classroom.err.messageLong", { n: long[1] });
  return t("common.tryAgain");
}
