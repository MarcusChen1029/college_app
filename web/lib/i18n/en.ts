// English messages: the default language and the source of truth for keys.
import { SECTIONS as S } from "./sections.ts";

export const en = {
  ...S.application.en,
  ...S.college.en,
  ...S.colleges.en,
  ...S.common.en,
  ...S.extension.en,
  ...S.home.en,
  ...S.match.en,
  ...S.misc.en,
  ...S.outcomes.en,
  ...S.portals.en,
  ...S.profile.en,
  ...S.quiz.en,
  ...S.recommenders.en,
  ...S.scholarships.en,
  ...S.settings.en,
  ...S.share.en,
  ...S.status.en,
  ...S.supplements.en,
  ...S.teacher.en,
  ...S.tools.en,
  ...S.transcript.en,
  ...S.writing.en,
} as const;

export type MessageKey = keyof typeof en;

/** A full dictionary. zh-TW.ts is typed with this, so a missing or extra key fails `tsc`. */
export type Messages = { readonly [K in MessageKey]: string };
