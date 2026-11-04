// Anchors: the "what is this about" reference that comments, tasks and notes carry (classroom phase 1, spec §6).
// Pure helpers only. validateAnchor mirrors the SQL CHECK constraint and the format part of anchor_visible() in the
// classroom migration, so keep the two in step. The database decides whether a teacher may see the item itself.

export const ANCHOR_KINDS = ["general", "section", "college", "essay", "activity", "profile", "task"] as const;
export type AnchorKind = (typeof ANCHOR_KINDS)[number];

/** `ref` is null only for "general" (a conversation about nothing in particular). */
export type Anchor = { kind: AnchorKind; ref: string | null };

/** Phase 2 adds transcript, recommenders, scholarships, resume and portals. */
export const SECTIONS = ["colleges", "essays", "activities", "profile"] as const;
export const PROFILE_CARDS = ["gpa", "test", "english", "regions"] as const;

const MAX_REF = 200;
const SLUG = /^[a-z0-9-]+$/;
const ESSAY_REF = /^(ps|uc:[1-8]|supp:[a-z0-9-]+:\S+)$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const has = (list: readonly string[], v: string): boolean => list.includes(v);

/** True when the anchor has a well-formed kind and ref. Does not check that the item exists. */
export function validateAnchor(a: Anchor): boolean {
  if (!has(ANCHOR_KINDS, a.kind)) return false;
  if (a.kind === "general") return a.ref === null;
  const ref = a.ref;
  if (typeof ref !== "string" || ref === "" || ref.length > MAX_REF) return false;
  switch (a.kind) {
    case "section":
      return has(SECTIONS, ref);
    case "profile":
      return has(PROFILE_CARDS, ref);
    case "college":
      return SLUG.test(ref);
    case "essay":
      return ESSAY_REF.test(ref);
    case "activity":
      return !ref.startsWith("legacy-"); // old entries without a stored id get a made-up one
    case "task":
      return UUID.test(ref);
  }
}

/** "general" or "<kind>:<ref>": the value of `data-focus` and of the `focus` query parameter. */
export const anchorKey = (a: Anchor): string => (a.kind === "general" ? "general" : `${a.kind}:${a.ref ?? ""}`);

/** The `data-focus` value for an item on a page, or undefined when the item cannot be an anchor (a made-up `legacy-`
 *  activity id, a malformed ref). Pages use it so that only items a comment or task could point at carry the attribute. */
export const focusAttr = (a: Anchor): string | undefined => (validateAnchor(a) ? anchorKey(a) : undefined);

/** Reads a focus value (already decoded by useSearchParams). Splits at the first ":"; null unless it is a valid anchor. */
export function parseFocus(s: string | null): Anchor | null {
  if (!s) return null;
  const i = s.indexOf(":");
  const kind = i === -1 ? s : s.slice(0, i);
  if (!has(ANCHOR_KINDS, kind)) return null;
  const a: Anchor = { kind: kind as AnchorKind, ref: i === -1 ? null : s.slice(i + 1) };
  return validateAnchor(a) ? a : null;
}

export type TeacherTab = "overview" | "colleges" | "activities" | "essays" | "interested" | "tasks" | "messages" | "notes";

/** The student-detail tab a teacher lands on for an item (spec §6 table). */
export function teacherTabFor(a: Anchor): TeacherTab {
  switch (a.kind) {
    case "general":
      return "messages";
    case "college":
      return "colleges";
    case "essay":
      return a.ref?.startsWith("supp:") ? "colleges" : "essays";
    case "activity":
      return "activities";
    case "task":
      return "tasks";
    case "profile":
      return "overview";
    case "section":
      return a.ref === "colleges" || a.ref === "essays" || a.ref === "activities" ? a.ref : "overview";
  }
}

const focusParam = (a: Anchor): string => `focus=${encodeURIComponent(anchorKey(a))}`;

const SECTION_PAGE: Record<(typeof SECTIONS)[number], string> = {
  colleges: "/application/list",
  essays: "/materials/essays",
  activities: "/materials/activities",
  profile: "/profile",
};

/** The student page that holds the item (the page the focus hook runs on). */
function studentPage(a: Anchor): string {
  switch (a.kind) {
    case "profile":
      return SECTION_PAGE.profile;
    case "college":
      return SECTION_PAGE.colleges;
    case "essay":
      return SECTION_PAGE.essays;
    case "activity":
      return SECTION_PAGE.activities;
    default:
      return SECTION_PAGE[a.ref as (typeof SECTIONS)[number]] ?? SECTION_PAGE.profile;
  }
}

/** Where a student opens the item. A general anchor opens its conversation on the Counselors page; a task has its own page. */
export function studentHref(a: Anchor, conversationId?: string): string {
  if (a.kind === "general") return conversationId ? `/counselor?c=${encodeURIComponent(conversationId)}` : "/counselor";
  if (a.kind === "task") return a.ref ? `/counselor/task/${encodeURIComponent(a.ref)}` : "/counselor";
  return `${studentPage(a)}?${focusParam(a)}`;
}

/** Where a teacher opens the item: the student's detail page on the matching tab. */
export function teacherHref(a: Anchor, studentId: string): string {
  const base = `/teacher/students?s=${encodeURIComponent(studentId)}&tab=${teacherTabFor(a)}`;
  return a.kind === "general" ? base : `${base}&${focusParam(a)}`;
}

/** Suffix of the i18n key `classroom.anchor.generic.<kind>`, the label shown when the saved one may not be. */
export const genericLabelKey = (kind: AnchorKind): string => kind;
