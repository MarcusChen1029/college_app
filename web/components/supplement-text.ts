// Shared wording for supplemental prompts, used by the college page (server) and Writing > Essays (client).
import { fmtDate } from "@/lib/format";
import type { TFunction } from "@/lib/i18n";
import { choiceGroups, promptCounts, promptTextMissing, supplementStatus, type CollegeSupplements, type IntlFinance, type SupplementPrompt } from "@/lib/supplements";

const num = (n: number) => n.toLocaleString("en-US");

/** "250 words", "1,000 characters", "250 words / 1,500 characters" or "No limit stated". */
export function limitLabel(t: TFunction, p: Pick<SupplementPrompt, "word_limit" | "char_limit">): string {
  const parts = [p.word_limit != null && t("supplements.words", { n: num(p.word_limit) }), p.char_limit != null && t("supplements.chars", { n: num(p.char_limit) })].filter(Boolean);
  return parts.length ? parts.join(" / ") : t("supplements.noLimit");
}

/** "Only for Honors College applicants"; text that already names its group ("All applicants except …") as is. */
export const whoLabel = (t: TFunction, who: string): string => (/^all\b/i.test(who) ? who : t("supplements.onlyFor", { who }));

export const categoryLabel =(t: TFunction, p: Pick<SupplementPrompt, "category">) => t(`supplements.cat.${p.category}`);

/**
 * One line for the "Essays" row of Application requirements: "1 required · choose 1 of 2 · 1 optional",
 * a sourced "None", or null when we don't know (the caller then falls back or says unknown).
 */
export function summaryText(t: TFunction, rec: CollegeSupplements | null): string | null {
  const status = supplementStatus(rec);
  if (!rec || status === "not_researched" || status === "unknown") return null;
  if (status === "none") return t("supplements.summary.none");
  if (rec.shared_set === "uc-piq") return t("supplements.summary.ucPiq");
  if (promptTextMissing(rec)) return t("supplements.summary.requiredNoText");
  const c = promptCounts(rec.prompts);
  // Optional prompts in a choose-N set read as one choice ("optional: choose 1 of 3"), not as N optional essays.
  const optionalSets = choiceGroups(rec.prompts).filter((g) => g.kind === "optional");
  const looseOptional = rec.prompts.filter((p) => !p.required && !p.choose).length;
  return [
    c.required > 0 && t("supplements.summary.required", { n: c.required }),
    ...c.groups.map((g) => t("supplements.summary.choice", { pick: g.pick, total: g.prompts.length })),
    c.conditional > 0 && t("supplements.summary.conditional", { n: c.conditional }),
    ...optionalSets.map((g) => t("supplements.summary.optionalChoice", { pick: g.pick, total: g.prompts.length })),
    looseOptional > 0 && t("supplements.summary.optional", { n: looseOptional }),
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Certification of Finances + bank statement · after admission · I-20 documents: May 1, 2027". */
export function financeText(t: TFunction, f: IntlFinance): string {
  const dates = f.deadlines.map((d) => `${d.label}: ${d.date ? fmtDate(d.date) : d.note}${d.date && d.note ? ` (${d.note})` : ""}`);
  return [f.document, t(`supplements.fin.when.${f.when}`), ...dates].join(" · ");
}
