// UCAS personal statement character checker. Pure code; the text stays in the browser (see UcasCharChecker).
// Limits: 4,000 characters in total including spaces, at least 350 per answer (see personal-essays.ts for the source).

import { UCAS_PS_MIN, UCAS_PS_TOTAL } from "./personal-essays.ts";

/** localStorage key for the unsent draft. Never sent to the account or any server. */
export const UCAS_DRAFT_KEY = "ucas-ps-draft-v1";

/** Characters including spaces; a line break counts once (CRLF -> LF) and an emoji counts as one. */
export function countChars(s: string): number {
  return [...s.replace(/\r\n/g, "\n")].length;
}

export function checkUcasPs(answers: readonly string[]): { counts: number[]; total: number; overBy: number; short: boolean[] } {
  const counts = answers.map(countChars);
  const total = counts.reduce((a, b) => a + b, 0);
  return { counts, total, overBy: Math.max(0, total - UCAS_PS_TOTAL), short: counts.map((n) => n < UCAS_PS_MIN) };
}

/** Reads a stored draft; anything unexpected gives three empty answers. */
export function parseUcasDraft(raw: string | null): [string, string, string] {
  const out: [string, string, string] = ["", "", ""];
  if (!raw) return out;
  try {
    const v: unknown = JSON.parse(raw);
    const a = v && typeof v === "object" ? (v as { a?: unknown }).a : null;
    if (Array.isArray(a)) for (let i = 0; i < 3; i++) if (typeof a[i] === "string") out[i] = a[i];
  } catch {}
  return out;
}

export function serializeUcasDraft(a: readonly string[]): string {
  return JSON.stringify({ a: [0, 1, 2].map((i) => a[i] ?? "") });
}
