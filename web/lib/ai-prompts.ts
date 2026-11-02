// Ready-made questions for "Copy for AI" (components/AiPromptPack.tsx) and the same questions as connector prompts
// (lib/mcp/prompts.ts). The text lives in the i18n dictionary (lib/i18n/messages/ai.ts); this file holds the list, the
// literal keys and the few pure helpers, so tests can run without React.

import { interpolate, type Locale } from "./i18n/core.ts";
import type { MessageKey } from "./i18n/en.ts";

export type AiPromptId = "due14" | "conflicts" | "balance" | "essayOverlap" | "costAid" | "weekPlan" | "weekly";
export type AiPrompt = {
  id: AiPromptId;
  /** Needs the pass-level pack (per-college details). On Free the card previews what the pass adds instead of copying. */
  needsPass: boolean;
  /** Only offered through the connector (its data comes from a tool, not from the pasted pack). */
  mcpOnly: boolean;
};

export const AI_PROMPTS: readonly AiPrompt[] = [
  { id: "due14", needsPass: false, mcpOnly: false },
  { id: "conflicts", needsPass: false, mcpOnly: false },
  { id: "balance", needsPass: true, mcpOnly: false },
  { id: "essayOverlap", needsPass: true, mcpOnly: false },
  { id: "costAid", needsPass: true, mcpOnly: false },
  { id: "weekPlan", needsPass: false, mcpOnly: false },
  { id: "weekly", needsPass: false, mcpOnly: true },
];

// Literal keys, written out: i18n.test.ts finds a key in use only when its full text appears in the source, so these
// must not be built with a template string.
export const PROMPT_KEYS = {
  due14: { title: "ai.prompt.due14.title", body: "ai.prompt.due14.body" },
  conflicts: { title: "ai.prompt.conflicts.title", body: "ai.prompt.conflicts.body" },
  balance: { title: "ai.prompt.balance.title", body: "ai.prompt.balance.body" },
  essayOverlap: { title: "ai.prompt.essayOverlap.title", body: "ai.prompt.essayOverlap.body" },
  costAid: { title: "ai.prompt.costAid.title", body: "ai.prompt.costAid.body" },
  weekPlan: { title: "ai.prompt.weekPlan.title", body: "ai.prompt.weekPlan.body" },
  weekly: { title: "ai.prompt.weekly.title", body: "ai.prompt.weekly.body" },
} as const satisfies Record<AiPromptId, { title: MessageKey; body: MessageKey }>;

/** What `{language}` becomes in a prompt body, by UI language. */
export const LANGUAGE_NAME: Record<Locale, string> = { en: "English", "zh-TW": "Traditional Chinese (Taiwan)" };

/** A dictionary body with `{language}` filled in from the UI language. */
export const promptText = (body: string, locale: Locale): string => interpolate(body, { language: LANGUAGE_NAME[locale] });

/** The prompt, a rule, then the student's pack. */
export const withPrompt = (prompt: string, pack: string): string => `${prompt.trim()}\n\n---\n\n${pack}`;

/** The first `max` lines that are not blank (kept as written, so indentation survives). */
export const previewLines = (detail: string, max = 10): string[] =>
  detail
    .split("\n")
    .filter((line) => line.trim() !== "")
    .slice(0, max);

/** The college whose details the Free preview shows: the first listed US college (no country counts as US); null when none. */
export const previewSlug = (list: { slug: string; countryCode: string | null }[]): string | null =>
  list.find((e) => e.countryCode == null || e.countryCode === "US")?.slug ?? null;

/** The sentence every English body starts its closing with; the connector replaces it (the AI has tools, not a pasted pack). */
export const ASK_SENTENCE = "Use only the information below.";
const TOOLS_SENTENCE = "Use the tracker's tools for the data.";

/** An English body as a connector prompt: no pasted pack, so it points at the tools, and the AI answers in the student's own language. */
export const connectorBody = (body: string): string => body.replace(ASK_SENTENCE, TOOLS_SENTENCE).replace("{language}", "the language I write in");

/** Connector prompt names are snake_case like the tools: essayOverlap -> essay_overlap. */
export const connectorName = (id: AiPromptId): string => id.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
