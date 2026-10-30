// The /help answer to "How many colleges can I keep?", built from whatever plans lib/plans.ts holds, so it stays right
// when plans are added, removed or change their limits: "5 colleges on Free and any number on Admission-year pass".
// Plan names come from the payments dictionary (payments.planName.<key>), as everywhere else a plan is named.
import type { TFunction } from "../../lib/i18n/index.ts";
import type { PlanKey } from "../../lib/plans.ts";

export function planLimitsText(plans: readonly { key: PlanKey; limit: number | null }[], t: TFunction, lang: string): string {
  const parts = plans.map((p) => {
    const plan = t(`payments.planName.${p.key}`);
    return p.limit == null ? t("misc.help.planNoLimit", { plan }) : t("misc.help.planLimit", { plan, n: p.limit });
  });
  return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(parts);
}
