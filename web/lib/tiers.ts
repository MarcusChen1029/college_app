import type { TierCode } from "./types";

export type TierLetter = "S" | "A" | "B" | "C" | "D";

/** Subject tiers use only these five. */
export const BASE_TIERS: TierLetter[] = ["S", "A", "B", "C", "D"];

/** The general tier also allows ++ and + inside each letter. Best first. */
export const TIER_ORDER: TierCode[] = BASE_TIERS.flatMap((l) => [`${l}++`, `${l}+`, l] as TierCode[]);

export const tierLetter = (t: TierCode): TierLetter => t[0] as TierLetter;

export const tierRank = (t: TierCode | null | undefined) => (t ? TIER_ORDER.indexOf(t) : 99);
