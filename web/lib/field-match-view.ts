// What the /tools/match page needs on top of field-match.ts: the compact college row sent to the browser, and
// the message keys that explain a score. Pure; the component turns the keys into text.
import type { FieldScore, MatchCollege } from "./field-match.ts";
import type { MessageKey } from "./i18n/en.ts";
import type { CollegeSummary } from "./types.ts";

/** The columns the page uses, so the whole summary is not sent to the browser. */
export type MatchRow = MatchCollege & { short_name: string | null };

export const toMatchRow = (c: CollegeSummary): MatchRow => ({
  slug: c.slug,
  name: c.name,
  short_name: c.short_name,
  country_code: c.country_code,
  general_tier: c.general_tier,
  tiers: c.tiers,
  admit_rate: c.admit_rate,
  intl_admit_rate: c.intl_admit_rate,
  sat_p25: c.sat_p25,
  sat_p75: c.sat_p75,
  act_p25: c.act_p25,
  act_p75: c.act_p75,
  test_policy: c.test_policy,
});

export type Reason = { key: MessageKey; vars?: Record<string, number> };

/** Why a college is not in the ranked list for the field (not offered, no data, small program, or just weak). */
export function reasonFor(score: FieldScore): Reason {
  if (score.status === "not_offered") return { key: "match.reason.notOffered" };
  if (score.status === "no_data") return { key: "match.reason.noData" };
  if (score.depth === "small" && score.grads != null && score.grads > 0) return { key: "match.reason.small", vars: { n: score.grads } };
  return { key: "match.reason.weak", vars: { n: score.strength ?? 0 } };
}
