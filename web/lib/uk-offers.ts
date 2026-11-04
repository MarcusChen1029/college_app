import { countryOf } from "./application-steps.ts";
import { UK_OFFER_TYPES, UK_REPLIES, type UkOfferType, type UkReply } from "./checklist.ts";
import { isIsoDate } from "./recommenders.ts";
import type { ListEntry } from "./student-rows.ts";

/** Longest offer-conditions text we keep. */
export const UK_CONDITIONS_MAX = 500;

/**
 * UCAS's own page on replying to offers: an unconditional Firm means no Insurance choice.
 * Quote (checked 2026-11-05): "accepting an unconditional offer means you won't have an insurance choice"
 */
export const INSURANCE_RULE_SOURCE: string | null = "https://www.ucas.com/connect/blogs/think-carefully-when-you-reply-your-offers";

type Stored = { [key: string]: unknown };
type Entry = Pick<ListEntry, "slug" | "status" | "checklist" | "custom">;

/** Stored values that are not one of the allowed ones read as unset, so old or hand-written data can't block anything. */
export const ukReplyOf = (c: Stored): UkReply | null => ((UK_REPLIES as readonly unknown[]).includes(c.uk_reply) ? (c.uk_reply as UkReply) : null);
export const ukOfferType = (c: Stored): UkOfferType | null => ((UK_OFFER_TYPES as readonly unknown[]).includes(c.uk_offer) ? (c.uk_offer as UkOfferType) : null);
export const ukReplyBy = (c: Stored): string | null => (isIsoDate(c.uk_reply_by) ? c.uk_reply_by : null);
export const ukConditions = (c: Stored): string => (typeof c.uk_conditions === "string" ? c.uk_conditions.trim().slice(0, UK_CONDITIONS_MAX) : "");

const isGb = (e: Entry): boolean => !e.custom && countryOf(e.slug) === "GB";
/** A reply holder: a UK college from the list (not typed in) the student has an offer from. */
const isHolder = (e: Entry): boolean => isGb(e) && (e.status === "admitted" || e.status === "enrolled");

export function replyConflicts(list: readonly Entry[]): { firm: string[]; insurance: string[] } {
  const slugs = (reply: UkReply) => list.filter((e) => isHolder(e) && ukReplyOf(e.checklist) === reply).map((e) => e.slug);
  const firm = slugs("firm");
  const insurance = slugs("insurance");
  return { firm: firm.length > 1 ? firm : [], insurance: insurance.length > 1 ? insurance : [] };
}

export function canSetReply(list: readonly Entry[], slug: string, reply: UkReply): boolean {
  const entry = list.find((e) => e.slug === slug);
  if (!entry || !isGb(entry)) return false;
  if (reply === "decline") return true;
  if (!isHolder(entry)) return false;
  const others = list.filter((e) => e.slug !== slug && isHolder(e));
  if (others.some((e) => ukReplyOf(e.checklist) === reply)) return false;
  if (INSURANCE_RULE_SOURCE !== null) {
    const unconditionalFirm = others.some((e) => ukReplyOf(e.checklist) === "firm" && ukOfferType(e.checklist) === "unconditional");
    if (reply === "insurance" && unconditionalFirm) return false;
    if (reply === "firm" && ukOfferType(entry.checklist) === "unconditional" && others.some((e) => ukReplyOf(e.checklist) === "insurance")) return false;
  }
  return true;
}
