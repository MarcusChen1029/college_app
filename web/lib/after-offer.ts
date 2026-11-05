// "When / how much" facts under each UK / Canada / Australia after-offer step.
// Data: data/after_offer_2026_27/*.json via scripts/build_after_offer.py -> ./data/after-offer.json.
// Every fact carries its official source URL and verified-on date; an unknown fact is simply absent (never guessed).
import raw from "./data/after-offer.json" with { type: "json" };
import { countryOf } from "./application-steps.ts";
import type { AfterOfferKey } from "./checklist.ts";

export type AfterOfferFact = {
  text: string;
  link: string | null;
  sourceUrl: string;
  verifiedOn: string;
  /** Shown only to a student whose citizenship is in this list; null = shown to everyone. */
  onlyCitizenship: string[] | null;
};

type Steps = Partial<Record<string, AfterOfferFact[]>>;
type Data = {
  GB: { steps: Steps };
  CA: { steps: Steps };
  AU: { steps: Steps };
  universities: Record<string, { variants: Partial<Record<string, "caq">>; steps: Steps }>;
};

const DATA = raw as unknown as Data;

function own<T>(obj: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(obj, key) ? obj[key] : undefined;
}

/** Facts for one step: the university's own first, then the country's, minus citizenship-only ones that don't apply. */
export function afterOfferFacts(slug: string, key: AfterOfferKey, citizenship: string | null): AfterOfferFact[] {
  const country = countryOf(slug);
  if (country === "US") return [];
  const uni = own(DATA.universities, slug)?.steps[key] ?? [];
  const general = DATA[country].steps[key] ?? [];
  return [...uni, ...general].filter((f) => f.onlyCitizenship === null || (citizenship !== null && f.onlyCitizenship.includes(citizenship)));
}

/** A university-specific wording of a step: McGill asks for a CAQ instead of a PAL. */
export function stepVariant(slug: string, key: AfterOfferKey): "caq" | null {
  return own(DATA.universities, slug)?.variants[key] ?? null;
}
