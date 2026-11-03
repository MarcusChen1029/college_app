// What a conversation, comment or task can be about: the lists the "About" select of a new conversation offers.
// Plain functions, so lib/anchor-options.test.ts can run them; the value imports are therefore relative `.ts` paths
// (node's test runner does not know the `@/` alias). Type imports are erased and keep the usual alias.

import type { Checklist } from "@/lib/checklist";
import type { CustomCollege } from "@/lib/custom-college";
import type { MessageKey, TFunction } from "@/lib/i18n";
import type { PersonalEssays } from "@/lib/personal-essays";
import { upgradeActivities } from "../../lib/activities.ts";
import { PROFILE_CARDS, SECTIONS, validateAnchor, type Anchor } from "../../lib/anchors.ts";
import { caRole, ucName } from "../../lib/resume.ts";

/** One choice in the "About" list of a new conversation: the item and the name to show for it (and to save with the conversation). */
export type AnchorOption = { anchor: Anchor; label: string };

/** The part of the student's record the options are built from (`useStudent()` has it). */
export type StudentRecord = {
  list: readonly { slug: string; custom?: Pick<CustomCollege, "name"> | null; checklist: Pick<Checklist, "essay_list"> }[];
  profile: { essays?: PersonalEssays; activities?: unknown };
};

const SECTION_NAME: Record<(typeof SECTIONS)[number], MessageKey> = {
  colleges: "classroom.anchor.section.colleges",
  essays: "classroom.anchor.section.essays",
  activities: "classroom.anchor.section.activities",
  profile: "classroom.anchor.section.profile",
};

const CARD_NAME: Record<(typeof PROFILE_CARDS)[number], MessageKey> = {
  gpa: "profile.gpaUnweighted",
  test: "classroom.opt.testScores",
  english: "profile.englishTest",
  regions: "profile.regionsApplying",
};

/**
 * Everything a student can start a conversation about with one teacher, in the order the select shows it: General, the
 * sections (the essays only while shared with that teacher), each college on the list, the essays (only while shared:
 * the personal statement, the chosen UC questions and the saved supplement essays), each activity or honor, and the
 * profile cards. Items a comment could not point at (an activity that only has a made-up `legacy-` id) are left out, and
 * so is anything about essays while they are not shared, because the teacher could not follow it.
 * `names` maps a college slug to its display name (a custom college uses the name the student typed).
 */
export function studentAnchorOptions(student: StudentRecord, shareEssays: boolean, t: TFunction, names: ReadonlyMap<string, string> = new Map()): AnchorOption[] {
  const out: AnchorOption[] = [];
  const seen = new Set<string>();
  const add = (kind: Anchor["kind"], ref: string | null, label: string) => {
    const anchor: Anchor = { kind, ref };
    const key = kind === "general" ? "general" : `${kind}:${ref}`;
    if (seen.has(key) || !validateAnchor(anchor) || label.trim() === "") return;
    seen.add(key);
    out.push({ anchor, label: label.trim() });
  };
  const college = (e: StudentRecord["list"][number]): string => names.get(e.slug) || e.custom?.name?.trim() || e.slug;

  add("general", null, t("classroom.anchor.general"));
  for (const s of SECTIONS) {
    if (s === "essays" && !shareEssays) continue;
    add("section", s, t("classroom.anchor.yours", { section: t(SECTION_NAME[s]) }));
  }

  for (const e of student.list) add("college", e.slug, college(e));

  if (shareEssays) {
    add("essay", "ps", t("writing.psName"));
    for (const n of student.profile.essays?.uc?.picks ?? []) add("essay", `uc:${n}`, t("writing.ucName", { n }));
    for (const e of student.list) {
      for (const essay of e.checklist.essay_list ?? []) {
        add("essay", `supp:${e.slug}:${essay.id}`, `${college(e)}: ${essay.title.trim() || t("classroom.opt.untitledEssay")}`);
      }
    }
  }

  const untitled = t("classroom.opt.untitledActivity");
  const data = upgradeActivities(student.profile.activities);
  for (const a of data.commonApp.activities) add("activity", a.id, a.organization.trim() || caRole(a) || untitled);
  for (const h of data.commonApp.honors) add("activity", h.id, h.title.trim() || untitled);
  for (const u of data.uc) add("activity", u.id, ucName(u).trim() || untitled);

  for (const c of PROFILE_CARDS) add("profile", c, t(CARD_NAME[c]));
  return out;
}
