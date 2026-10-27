// Picks STARS's generic course title ("Course/Exam Content") for a course from STARS's own list, by the course name. No guessing beyond
// the name: level words ("AP", "Honors", "Level 1"), lab suffixes and grade numbers are dropped, Roman numerals read as numbers, and the
// longest STARS title whose words all appear in what is left wins ("AP Calculus BC" -> CALCULUS). English courses named by grade take
// STARS's year title (international page: "ENGLISH 11 (THIRD YEAR)"; US page: "ENGLISH 3"). Nothing found -> the subject's "OTHER ..." title.

export type StarsTitleMatch = { title: string; how: "exact" | "matched" | "other" };

const ROMAN: Record<string, string> = { I: "1", II: "2", III: "3", IV: "4", V: "5", VI: "6" };
/** Words that say how hard a course is, or which section it is, not what it is. */
const NOISE = new Set(["AP", "HONORS", "HONOR", "HON", "IB", "HL", "SL", "ADVANCED", "PLACEMENT", "LEVEL", "LABORATORY", "LAB", "SEMESTER", "ACCELERATED", "ENRICHED", "PRE-AP", "THE", "OF"]);

/** Upper case words: "&" read as AND, "United States"/"U.S." as US, Roman numerals as digits, punctuation dropped. */
function words(s: string): string[] {
  return s
    .normalize("NFKC")
    .toUpperCase()
    .replace(/\bU\.S\.?/g, "US")
    .replace(/\bUNITED STATES\b/g, "US")
    .replace(/&/g, " AND ")
    .replace(/\([^)]*\)/g, " ") // STARS's "(FIRST YEAR)" etc.
    .replace(/[^A-Z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => ROMAN[w] ?? w);
}

/** The course name's meaningful words: level words, "Level N", "Semester N" and grade numbers 9-12 dropped. */
function nameWords(name: string): string[] {
  const w = words(name);
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    if ((w[i] === "LEVEL" || w[i] === "SEMESTER") && /^\d$/.test(w[i + 1] ?? "")) {
      i++;
      continue;
    }
    if (NOISE.has(w[i]!) || /^(9|10|11|12)$/.test(w[i]!)) continue;
    out.push(w[i]!);
  }
  return out;
}

const YEAR_WORD = ["FIRST", "SECOND", "THIRD", "FOURTH"];

export function matchStarsTitle(
  name: string,
  subject: string,
  gradeLevel: number | null,
  list: readonly string[],
  kind: "intl" | "us",
): StarsTitleMatch {
  const other = list.find((t) => t.startsWith(subject === "english" ? "OTHER ENGLISH" : "OTHER")) ?? list.find((t) => t.startsWith("OTHER")) ?? list[list.length - 1]!;
  const upper = name.normalize("NFKC").trim().toUpperCase().replace(/\s+/g, " ");
  if (list.includes(upper)) return { title: upper, how: "exact" };

  // "English 9 Level 1", "English 12-Imagined Realities…": an English course named by its grade.
  const all = words(name);
  if (subject === "english" && all[0] === "ENGLISH" && gradeLevel != null && gradeLevel >= 9 && gradeLevel <= 12 && (all.length === 1 || /^(9|10|11|12)$/.test(all[1]!))) {
    const n = gradeLevel - 8;
    const title = kind === "intl" ? `ENGLISH ${gradeLevel} (${YEAR_WORD[n - 1]} YEAR)` : `ENGLISH ${n}`;
    if (list.includes(title)) return { title, how: "matched" };
  }

  const have = new Set(nameWords(name));
  let best: { title: string; size: number } | null = null;
  for (const t of list) {
    if (t.startsWith("OTHER")) continue;
    const tw = words(t);
    if (!tw.length || !tw.every((w) => have.has(w))) continue;
    if (!best || tw.length > best.size) best = { title: t, size: tw.length };
  }
  return best ? { title: best.title, how: "matched" } : { title: other, how: "other" };
}
