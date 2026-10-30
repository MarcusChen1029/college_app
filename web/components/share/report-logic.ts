// Pure helpers for the parent report (tested in lib/share-report.test.ts). Relative .ts imports so node --test can load it.

import { isDeadlineDone } from "../../lib/application.ts";
import type { ParentCollege, ParentDeadline } from "../../lib/share-links.ts";
import type { Status } from "../../lib/student-rows.ts";

export type ReportDeadline = ParentDeadline & { college: string; status: Status };

/**
 * The timetable rows and the next deadline, from the WHOLE upcoming list (parentDeadlines): open deadlines first,
 * soonest first, then the ones already handled. `next` is the soonest open one, so a long run of submitted
 * applications can never hide it. `more` counts what did not fit.
 */
export function reportDeadlines(all: readonly ReportDeadline[], max: number): { next: ReportDeadline | null; rows: ReportDeadline[]; more: number } {
  const open = all.filter((d) => !isDeadlineDone(d.kind, d.status));
  const done = all.filter((d) => isDeadlineDone(d.kind, d.status));
  // Open ones are CHOSEN first (so they always make the cut), then the chosen rows are SHOWN in date order.
  const rows = [...open, ...done].slice(0, max).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.college.localeCompare(b.college));
  return { next: open[0] ?? null, rows, more: Math.max(0, all.length - max) };
}

// ── the name on a share page: sized so it fits its column in at most two lines ──

const WIDE = new Set([..."MWmw@"]);
const NARROW = new Set([..."ijlI.,'!"]);
const BREAK_SPACE = /[ \t\r\n]/; // not \s: \s also matches U+00A0, the no-break space that binds short words

function isCjkOrFullwidth(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** Width of one character in em for the display face at weight 800 (rounded up, so estimates err wide). */
function charEm(ch: string): number {
  // Measured: a capital W in the display face at weight 800 (-0.04em tracking) is about 1.04em, so 0.95 let "WWWWWWWWWWWW" break.
  if (WIDE.has(ch)) return 1.05;
  if (NARROW.has(ch)) return 0.3;
  if (isCjkOrFullwidth(ch.codePointAt(0) ?? 0)) return 1;
  if (/\p{Lu}/u.test(ch)) return 0.74;
  return 0.6;
}

/** Estimated width of a text in em. */
export function ems(text: string): number {
  let n = 0;
  for (const ch of text) n += charEm(ch);
  return n;
}

/** Joins every 1–2 character word to its neighbour with a no-break space (to the next word when it comes first),
 *  so no line is a lone "A" or "Jr". Spaces only; a hyphen stays a break point. */
export function bindShortWords(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/[ \t\r\n]+/).filter(Boolean);
  const out: string[] = [];
  let carry = "";
  for (const w of words) {
    const short = [...w].length <= 2;
    if (short && out.length > 0) out[out.length - 1] += "\u00a0" + w;
    else if (short) carry += (carry ? "\u00a0" : "") + w;
    else {
      out.push(carry ? `${carry}\u00a0${w}` : w);
      carry = "";
    }
  }
  if (carry) out.push(carry);
  return out.join(" ");
}

const FALLBACK_UNITS = 6;

/**
 * The width, in em, the name needs to fit in at most two lines: one line if it has no break point, otherwise the widest
 * line of the best split at a space (dropped at the line end) or after a hyphen (kept on the first line). A greedy line
 * breaker at that width never needs a third line, and every unbreakable run fits.
 */
export function nameUnits(name: string | null | undefined): number {
  const s = bindShortWords(name);
  if (!s) return FALLBACK_UNITS;
  let best = ems(s);
  for (let i = 0; i < s.length; i++) {
    const cut = BREAK_SPACE.test(s[i]) ? [s.slice(0, i).trimEnd(), s.slice(i).trimStart()] : s[i] === "-" && i < s.length - 1 ? [s.slice(0, i + 1), s.slice(i + 1)] : null;
    if (cut) best = Math.min(best, Math.max(ems(cut[0]), ems(cut[1])));
  }
  return Math.max(best, 1);
}

/**
 * The name's font size: as large as `max`, as small as it must be for at most two lines in its column (container query
 * units; the h1's container needs `container-type: inline-size`), never under 1.5rem. Render bindShortWords(name).
 */
export function nameSize(name: string | null | undefined, max = "4.5rem"): string {
  return `clamp(1.5rem, calc(100cqi / ${nameUnits(name).toFixed(2)}), ${max})`;
}

/** Entrance delay for row i of n: spread over at most 600ms however many rows there are. */
export function revealDelay(i: number, n: number): string {
  return `${Math.round((Math.min(i, n) / Math.max(n, 1)) * 600)}ms`;
}

export type StageKey = "ready" | "working" | "waiting" | "decided" | "withdrawn";

/** The stages a parent follows, in order. Withdrawn is its own stage (shown only when used), never a decision. */
export const STAGES: readonly { key: StageKey; statuses: readonly Status[] }[] = [
  { key: "ready", statuses: ["researching", "planning"] },
  { key: "working", statuses: ["in_progress"] },
  { key: "waiting", statuses: ["submitted", "interview"] },
  { key: "decided", statuses: ["admitted", "enrolled", "deferred", "waitlisted", "rejected"] },
  { key: "withdrawn", statuses: ["withdrawn"] },
];

/** Colleges grouped by stage. The "decided" stage is exactly the set parentSummary counts as decisions. */
export function stages(colleges: readonly ParentCollege[]): { key: StageKey; colleges: ParentCollege[] }[] {
  return STAGES.map((s) => ({ key: s.key, colleges: colleges.filter((c) => s.statuses.includes(c.status)) })).filter((s) => s.key !== "withdrawn" || s.colleges.length > 0);
}
