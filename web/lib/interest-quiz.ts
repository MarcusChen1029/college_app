// RIASEC (Holland code) interest quiz: pure scoring and career matching. Not the official O*NET Interest Profiler;
// the items are our own. Occupation interest data comes from O*NET (see interest-careers.ts and docs/superpowers/research/).
import type { InterestCareer } from "./interest-careers.ts";

export type RiasecType = "R" | "I" | "A" | "S" | "E" | "C";
/** Canonical order; also the tie-break order and the order of scores in InterestCareer. */
export const RIASEC: readonly RiasecType[] = ["R", "I", "A", "S", "E", "C"];

export const TYPE_INFO: Record<RiasecType, { name: string; blurb: string }> = {
  R: { name: "Realistic", blurb: "You like hands-on work: building, fixing, operating equipment, working outdoors or with animals." },
  I: { name: "Investigative", blurb: "You like figuring things out: science, math, research, and solving problems by analyzing evidence." },
  A: { name: "Artistic", blurb: "You like creating: art, writing, music, design, performance, and original ideas." },
  S: { name: "Social", blurb: "You like helping people: teaching, caring, advising, and working together for others." },
  E: { name: "Enterprising", blurb: "You like leading and persuading: starting things, selling ideas, managing people and taking risks." },
  C: { name: "Conventional", blurb: "You like order: organizing information, following clear procedures, working with numbers and records accurately." },
};

export type Question = { id: string; type: RiasecType; text: string };

// 5 items per type, interleaved so consecutive questions rarely share a type.
const ITEMS: Record<RiasecType, string[]> = {
  R: ["Fix a bike, a car or an appliance", "Build something with hand or power tools", "Spend your workday outdoors", "Set up or repair electronics and wiring", "Operate machines or drive heavy equipment"],
  I: ["Run a science experiment", "Work out a hard math or logic puzzle", "Read about new scientific discoveries", "Look for patterns in a set of data", "Research why something happens"],
  A: ["Draw, paint or design things", "Write stories, poems or scripts", "Play or compose music", "Act, dance or perform for an audience", "Make videos or take photographs"],
  S: ["Teach or tutor younger students", "Help a friend work through a personal problem", "Volunteer for a community cause", "Look after people who are sick or hurt", "Work in a team whose goal is to help others"],
  E: ["Lead a group project", "Persuade people to back your idea", "Start your own small business", "Run for a school or club office", "Negotiate a deal or a price"],
  C: ["Keep records neat, complete and accurate", "Make a budget and track the money", "Follow a clear set of steps every time", "Check documents for mistakes", "Organize files or a spreadsheet"],
};

export const QUESTIONS: Question[] = Array.from({ length: 5 }, (_, n) =>
  RIASEC.map((t): Question => ({ id: `${t}${n + 1}`, type: t, text: ITEMS[t][n] })),
).flat();

export const ANSWER_LABELS = ["Strongly dislike", "Dislike", "Not sure", "Like", "Strongly like"] as const;

/** One answer per question (1-5), or null when unanswered; same order as QUESTIONS. */
export type Answers = (number | null)[];

export function emptyAnswers(): Answers {
  return QUESTIONS.map(() => null);
}

export function answeredCount(a: Answers): number {
  return a.filter((v) => v !== null).length;
}

/** Score per type on 0-100 (sum of answers mapped 1..5 -> 0..4, over the answered items of that type). Null if none answered. */
export function scoreAnswers(a: Answers): Record<RiasecType, number | null> {
  const out = {} as Record<RiasecType, number | null>;
  for (const t of RIASEC) {
    let sum = 0;
    let n = 0;
    QUESTIONS.forEach((q, i) => {
      const v = a[i];
      if (q.type === t && typeof v === "number" && v >= 1 && v <= 5) {
        sum += v - 1;
        n += 1;
      }
    });
    out[t] = n ? Math.round((sum / (n * 4)) * 100) : null;
  }
  return out;
}

/** Top three types, highest first; equal scores fall back to R, I, A, S, E, C order. Unscored types are skipped. */
export function interestCode(scores: Record<RiasecType, number | null>): RiasecType[] {
  return RIASEC.filter((t) => scores[t] !== null)
    .sort((x, y) => (scores[y] as number) - (scores[x] as number) || RIASEC.indexOf(x) - RIASEC.indexOf(y))
    .slice(0, 3);
}

export type CareerMatch = { career: InterestCareer; similarity: number };

function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  const mx = x.reduce((s, v) => s + v, 0) / n;
  const my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/**
 * Rank occupations by how closely the shape of the student's six scores follows the occupation's six O*NET interest scores
 * (Pearson correlation, -1..1). A flat profile (all types equal) has no shape, so it returns no matches.
 */
export function matchCareers(scores: Record<RiasecType, number | null>, careers: readonly InterestCareer[], limit = 12): CareerMatch[] {
  const mine = RIASEC.map((t) => scores[t]);
  if (mine.some((v) => v === null)) return [];
  const me = mine as number[];
  const ranked: CareerMatch[] = [];
  for (const career of careers) {
    const r = pearson(me, career.scores);
    if (r !== null) ranked.push({ career, similarity: Math.round(r * 1000) / 1000 });
  }
  ranked.sort((a, b) => b.similarity - a.similarity || a.career.title.localeCompare(b.career.title));
  return ranked.slice(0, limit);
}

/** College programs linked (NCES CIP-SOC crosswalk) to the matched occupations, most frequent first. */
export function suggestPrograms(matches: readonly CareerMatch[], limit = 8): { program: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const m of matches) for (const p of m.career.programs) counts.set(p, (counts.get(p) ?? 0) + 1);
  return [...counts.entries()]
    .map(([program, count]) => ({ program, count }))
    .sort((a, b) => b.count - a.count || a.program.localeCompare(b.program))
    .slice(0, limit);
}

export function onetUrl(code: string): string {
  return `https://www.onetonline.org/link/summary/${encodeURIComponent(code)}`;
}

export const STORAGE_KEY = "interest-quiz-v1";

/** Parse what we stored; anything malformed yields null so the quiz just starts fresh. */
export function parseStored(raw: string | null): Answers | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (!Array.isArray(v) || v.length !== QUESTIONS.length) return null;
    return v.map((x) => (typeof x === "number" && Number.isInteger(x) && x >= 1 && x <= 5 ? x : null));
  } catch {
    return null;
  }
}
