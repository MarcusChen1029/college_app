import type { Fit } from "./fit.ts";
import type { Tone } from "./status.ts";
import { tierLetter, type TierLetter } from "./tiers.ts";
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

// Marks (dots, the share bar, legend swatches) use the band's mark colour: an even lightness ladder, darker = harder,
// so the four bands stay apart at bar size, in greyscale and for colour-blind readers (globals.css, the fit tokens).
// Each mark carries a 1px ring a step darker than itself, so a light mark (safety) still holds 3:1 against its ground.
const FIT_DOT: Record<Fit, string> = {
  super_reach: "bg-fit-super-reach-mark ring-1 ring-inset ring-fit-super-reach-edge",
  reach: "bg-fit-reach-mark ring-1 ring-inset ring-fit-reach-edge",
  target: "bg-fit-target-mark ring-1 ring-inset ring-fit-target-edge",
  safety: "bg-fit-safety-mark ring-1 ring-inset ring-fit-safety-edge",
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

/** Section heading on long reading pages (the college page and its sections) and inside app screens. */
export const SECTION_TITLE = "font-display text-2xl font-bold tracking-tight text-ink";

/** An app screen's title (My colleges, Writing, Tools, Profile, Compare): a confident 24-30px noun, never a landing-page size. */
export const PAGE_TITLE = "font-display text-2xl font-bold leading-tight tracking-tight text-ink sm:text-[30px]";

/** The sentence under a page title or a tab: what this screen holds, in full ink at reading size (never small grey text). */
export const PAGE_INTRO = "max-w-3xl text-base leading-relaxed text-ink";

/** A panel on an app screen: a tone step from the white page, no outline (forms and tables inside keep their own lines). */
export const PANEL = "rounded-3xl bg-zinc-50";

/** A small heading inside a panel ("Submitted colleges", "Other accounts"): sentence case at reading size, never tracked caps. */
export const LABEL = "text-[15px] font-semibold text-ink";

/** A table header row: 13px grey sentence case, no fill band. */
export const TABLE_HEAD = "text-left text-[13px] font-medium text-zinc-600";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50";
const BUTTON_SIZE = { md: "h-11 px-5 text-[15px]", sm: "h-9 px-4 text-sm" } as const;
const BUTTON_VARIANT = {
  primary: "bg-ink text-white hover:bg-zinc-800",
  secondary: "border-2 border-ink bg-white text-ink hover:bg-zinc-50",
  quiet: "text-blue-700 hover:underline underline-offset-4",
  danger: "border-2 border-urgent bg-white text-urgent hover:bg-urgent-bg",
  // A row action repeated down a list or table: one quiet outline, so a column of them never outshouts the data.
  ghost: "border border-zinc-300 bg-white text-ink hover:border-ink",
} as const;
const SECONDARY_ACTIVE = "border-2 border-ink bg-zinc-100 text-ink hover:bg-zinc-50";
const GHOST_ACTIVE = "border border-zinc-200 bg-zinc-100 text-ink hover:border-ink";
export const buttonClass = (variant: keyof typeof BUTTON_VARIANT, size: keyof typeof BUTTON_SIZE = "md", active = false): string =>
  `${BUTTON_BASE} ${BUTTON_SIZE[size]} ${active && variant === "secondary" ? SECONDARY_ACTIVE : active && variant === "ghost" ? GHOST_ACTIVE : BUTTON_VARIANT[variant]}`;

/** Segmented control (Map | Table, US | UK | CA | AU): a quiet track; the chosen option is a white pill in ink. 36px tall in all.
 *  On a narrow phone a long one scrolls inside its own track, never the page. */
export const SEGMENT_TRACK = "inline-flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-zinc-100 p-1 [scrollbar-width:none]";
export const segmentClass = (on: boolean): string =>
  `inline-flex h-7 shrink-0 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-semibold whitespace-nowrap transition-colors sm:px-3.5 ${
    on ? "border-zinc-200 bg-white text-ink" : "border-transparent text-zinc-600 hover:text-ink"
  }`;

/** Text fields and selects in filter rows: 36px, one 1px control border a step darker than card edges. Disabled stays legible. */
export const FIELD_CLASS =
  "h-9 rounded-full border border-zinc-300 bg-white px-3.5 text-sm text-ink placeholder:text-zinc-500 hover:border-zinc-400 focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:hover:border-zinc-300";

/** A filter that is on, removable: a pale chip with ink text (never a saturated blob). */
export const CHIP_CLASS =
  "inline-flex h-7 items-center gap-1 rounded-full border border-zinc-200 bg-zinc-100 px-2.5 text-[13px] font-semibold text-ink hover:border-zinc-400";

/** Map dots by tier letter: one blue ramp, darkest = most selective, and D an open ring, like the ink ladder of the tier badges
 *  (filled at the top, outlined below). The legend swatch uses `cls`; the WebGL map reads the same colour from the CSS token
 *  (`hex` until the stylesheet is there) and draws `ring` dots hollow. "none" = no tier. */
export const TIER_DOT: Record<TierLetter | "none", { cls: string; token: string; hex: string; ring?: boolean }> = {
  S: { cls: "bg-ink", token: "--color-ink", hex: "#12304a" },
  A: { cls: "bg-blue-700", token: "--color-blue-700", hex: "#0a6ba1" },
  B: { cls: "bg-blue-500", token: "--color-blue-500", hex: "#1fa4e4" },
  C: { cls: "bg-blue-300 ring-1 ring-inset ring-ink/25", token: "--color-blue-300", hex: "#87d1f6" },
  // The ring is a step darker than B's fill, so 320 open rings still hold 3:1 against the map's pale ground.
  D: { cls: "bg-white ring-2 ring-inset ring-blue-600", token: "--color-blue-600", hex: "#0b86c6", ring: true },
  none: { cls: "bg-zinc-300 ring-1 ring-inset ring-ink/20", token: "--color-zinc-300", hex: "#b9cfe2" },
};

/** Map dots by fit (when the student has scores): the fit mark colours (`fitDotClass`), as CSS tokens for the WebGL map. */
export const FIT_DOT_COLOR: Record<Fit, { token: string; hex: string }> = {
  super_reach: { token: "--color-fit-super-reach-mark", hex: "#003e44" },
  reach: { token: "--color-fit-reach-mark", hex: "#006c70" },
  target: { token: "--color-fit-target-mark", hex: "#009393" },
  safety: { token: "--color-fit-safety-mark", hex: "#68bfba" },
};
