// Subscription plans. No payment yet: students pick a plan directly. A plan changes how many
// colleges fit in My list, whether "Copy for AI" includes each college's sourced details, and whether Connect AI
// (the MCP server for ChatGPT / Claude) is available.

export const PLANS = [
  { key: "free", name: "Free", priceTwd: 0, limit: 3, fullAiContext: false, connectAi: false, blurb: "Try the tracker with a short list." },
  { key: "junior", name: "Junior", priceTwd: 50, limit: 10, fullAiContext: true, connectAi: false, blurb: "Enough for a full reach / target / safety list." },
  { key: "senior", name: "Senior", priceTwd: 150, limit: null, fullAiContext: true, connectAi: true, blurb: "No cap — track every college you're considering." },
] as const;
export type PlanKey = (typeof PLANS)[number]["key"];
export type Plan = (typeof PLANS)[number];

export const DEFAULT_PLAN: PlanKey = "free";

export function getPlan(key: string | null | undefined): Plan {
  return PLANS.find((p) => p.key === key) ?? PLANS[0];
}

/** null = unlimited */
export const listLimit = (key: string | null | undefined): number | null => getPlan(key).limit;

export function canAddMore(key: string | null | undefined, listed: number): boolean {
  const limit = listLimit(key);
  return limit == null || listed < limit;
}
