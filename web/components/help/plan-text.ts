// The /help answer to "How many colleges can I keep?", built from whatever plans lib/plans.ts holds, so it stays right
// when plans are added, removed or change their limits: "3 colleges on Free, 10 colleges on Junior, and any number on Senior".
import type { TFunction } from "../../lib/i18n/index.ts";

export function planLimitsText(plans: readonly { name: string; limit: number | null }[], t: TFunction, lang: string): string {
  const parts = plans.map((p) => (p.limit == null ? t("misc.help.planNoLimit", { plan: p.name }) : t("misc.help.planLimit", { plan: p.name, n: p.limit })));
  return new Intl.ListFormat(lang, { style: "long", type: "conjunction" }).format(parts);
}
