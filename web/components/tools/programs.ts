// The college programs the interest quiz suggests: undergraduate programs only, ranked by how strongly they link to the
// student's top careers. The career data (lib/interest-careers.ts, from the NCES CIP-SOC crosswalk) carries program titles
// only, no credential level, so graduate and professional programs are recognised by their CIP titles.
import type { CareerMatch } from "../../lib/interest-quiz.ts";

/**
 * CIP titles that are not bachelor's programs: medical and other residency, fellowship and combined-specialty programs,
 * and the first-professional and graduate degrees the crosswalk lists by their bare CIP titles (Law = JD, Medicine = MD,
 * Pharmacy = PharmD, Veterinary Medicine = DVM, Advanced Legal Research = LLM, Dental Clinical Sciences = graduate dentistry).
 */
const NOT_UNDERGRADUATE: readonly RegExp[] = [
  /\bresidency\b/i,
  /\bfellowship\b/i,
  /\bcombined specialty program\b/i,
  /^(law|medicine|pharmacy|veterinary medicine)$/i,
  /^advanced legal research\b/i,
  /^dental clinical sciences\b/i,
];

export const isUndergraduateProgram = (title: string): boolean => !NOT_UNDERGRADUATE.some((r) => r.test(title));

export type RankedProgram = { program: string; weight: number; careers: number };

/**
 * Each undergraduate program linked to the matched careers, weighted by the sum of those careers' match (a program two
 * close careers share outranks one a distant career lists); ties go to the program more careers share, then A–Z.
 */
export function rankPrograms(matches: readonly CareerMatch[], limit = 8): RankedProgram[] {
  const by = new Map<string, RankedProgram>();
  for (const { career, similarity } of matches) {
    for (const program of career.programs) {
      if (!isUndergraduateProgram(program)) continue;
      const cur = by.get(program) ?? { program, weight: 0, careers: 0 };
      cur.weight += Math.max(0, similarity);
      cur.careers += 1;
      by.set(program, cur);
    }
  }
  return [...by.values()]
    .sort((a, b) => b.weight - a.weight || b.careers - a.careers || a.program.localeCompare(b.program))
    .slice(0, limit)
    .map((p) => ({ ...p, weight: Math.round(p.weight * 1000) / 1000 }));
}
