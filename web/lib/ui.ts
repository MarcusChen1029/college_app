import type { Fit } from "./fit.ts";
import type { Tone } from "./status.ts";
import { tierLetter } from "./tiers.ts";
import type { TierCode } from "./types.ts";

// Full literal class strings only: Tailwind scans source text, so never build these with templates.
const TONE: Record<Tone, string> = {
  urgent: "text-urgent bg-urgent-bg border-urgent-line",
  soon: "text-soon bg-soon-bg border-soon-line",
  done: "text-done bg-done-bg border-done-line",
  progress: "text-progress bg-progress-bg border-progress-line",
  neutral: "text-neutral bg-neutral-bg border-neutral-line",
};
export const toneClass = (t: Tone): string => TONE[t];

export const FIT_LEVEL: Record<Fit, 1 | 2 | 3 | 4> = { super_reach: 4, reach: 3, target: 2, safety: 1 };

const FIT: Record<Fit, string> = {
  super_reach: "text-fit-super-reach bg-fit-super-reach-bg border-fit-super-reach-line",
  reach: "text-fit-reach bg-fit-reach-bg border-fit-reach-line",
  target: "text-fit-target bg-fit-target-bg border-fit-target-line",
  safety: "text-fit-safety bg-fit-safety-bg border-fit-safety-line",
};
export const fitClass = (f: Fit): string => FIT[f];

const FIT_DOT: Record<Fit, string> = {
  super_reach: "bg-fit-super-reach",
  reach: "bg-fit-reach",
  target: "bg-fit-target",
  safety: "bg-fit-safety",
};
export const fitDotClass = (f: Fit): string => FIT_DOT[f];

const TIER: Record<ReturnType<typeof tierLetter>, string> = {
  S: "bg-ink text-white border-2 border-ink",
  A: "bg-white text-ink border-2 border-ink",
  B: "bg-white text-ink border-[1.5px] border-zinc-500",
  C: "bg-white text-zinc-700 border border-zinc-400",
  D: "bg-white text-zinc-600 border border-dashed border-zinc-400",
};
export const tierClass = (t: TierCode): string => TIER[tierLetter(t)];

/** Section heading on long reading pages (the college page and its sections). */
export const SECTION_TITLE = "font-display text-xl font-bold tracking-tight text-ink";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_SIZE = { md: "h-11 px-5 text-[15px]", sm: "h-9 px-4 text-sm" } as const;
const BUTTON_VARIANT = {
  primary: "bg-ink text-white hover:bg-zinc-800",
  secondary: "border-2 border-ink bg-white text-ink hover:bg-zinc-50",
  quiet: "text-blue-700 hover:underline underline-offset-4",
  danger: "border-2 border-urgent bg-white text-urgent hover:bg-urgent-bg",
} as const;
const SECONDARY_ACTIVE = "border-2 border-ink bg-zinc-100 text-ink hover:bg-zinc-50";
export const buttonClass = (variant: keyof typeof BUTTON_VARIANT, size: keyof typeof BUTTON_SIZE = "md", active = false): string =>
  `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${active && variant === "secondary" ? SECONDARY_ACTIVE : BUTTON_VARIANT[variant]}`;
