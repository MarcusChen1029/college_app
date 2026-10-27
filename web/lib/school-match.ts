// Matches a transcript school to the school a portal shows. Portals spell names their own way ("KANG CHIAO INTL SCH LINKOU CMP",
// "Kang Chiao International School - Linkou Campus, New Taipei"), so names are compared by their words after expanding common
// abbreviations, and the school code (CEEB) wins whenever both sides have one.

/** Abbreviations portals and transcripts use, each read as its full word(s). */
const ABBR: Record<string, string> = {
  intl: "international", int: "international", sch: "school", schl: "school", hs: "high school",
  acad: "academy", acd: "academy", cmp: "campus", camp: "campus", cmps: "campus", st: "saint", ste: "sainte", mt: "mount",
  jr: "junior", sr: "senior", sci: "science", tech: "technology", inst: "institute", univ: "university", coll: "college",
  prep: "preparatory", ctr: "center", centre: "center", elem: "elementary", sec: "secondary", natl: "national", ms: "middle school",
  bil: "bilingual", amer: "american", ctry: "country", co: "county", cty: "county", dist: "district", isd: "independent school district",
};
/** Words that carry no identity. */
const STOP = new Set(["the", "of", "and", "at", "a", "an", "in", "for", "de", "la", "le"]);

/** A school name's identifying words: lower case, accents and punctuation dropped, abbreviations expanded, filler words removed. */
export function schoolWords(name: string): string[] {
  const out: string[] = [];
  const raw = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\bh\.\s?s\./g, " hs ")
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .split(" ")
    .filter(Boolean);
  for (const w of raw) for (const x of (ABBR[w] ?? w).split(" ")) if (!STOP.has(x)) out.push(x);
  return out;
}

/** Same word, or one typo (one letter added, dropped or changed) apart when both words have 5+ letters. */
function sameWord(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.min(a.length, b.length) < 5 || Math.abs(a.length - b.length) > 1) return false;
  // One insertion, deletion or substitution.
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

const shared = (a: readonly string[], b: readonly string[]) => a.filter((w) => b.some((x) => sameWord(w, x))).length;

/**
 * How alike two school names are, 0..1. 1 = the same words; ~0.9+ = every word of the shorter name is in the longer one
 * ("Lincoln High" / "Lincoln High School, Portland OR"); below 0.75 = treat as different schools.
 */
export function schoolNameScore(a: string, b: string): number {
  const wa = [...new Set(schoolWords(a))];
  const wb = [...new Set(schoolWords(b))];
  if (!wa.length || !wb.length) return 0;
  if (wa.join("") === wb.join("")) return 1;
  const both = shared(wa, wb);
  const small = Math.min(wa.length, wb.length);
  const big = Math.max(wa.length, wb.length);
  // "Lin Kou" vs "Linkou": compare with the spaces taken out.
  const ca = wa.join("");
  const cb = wb.join("");
  if (both === small && (small >= 2 || big === 1)) return 0.9 + 0.1 * (small / big);
  if (Math.min(ca.length, cb.length) >= 8 && (ca.includes(cb) || cb.includes(ca))) return 0.88;
  return 0.85 * ((2 * both) / (wa.length + wb.length));
}

export const SAME_SCHOOL = 0.75;

/** Codes compare without case, spaces or dashes ("00-1234" = "001234"). */
const codeKey = (c: string | null | undefined) => (c ?? "").toUpperCase().replace(/[\s-]+/g, "");

export function sameSchoolCode(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = codeKey(a);
  return ka !== "" && ka === codeKey(b);
}

/** The school code shown in a page's text as a whole word ("School code: 694132"). */
export function codeInText(code: string | null | undefined, text: string): boolean {
  const k = codeKey(code);
  if (!k) return false;
  return new RegExp(`(^|[^A-Za-z0-9])${k.replace(/[^A-Z0-9]/g, "")}($|[^A-Za-z0-9])`, "i").test(text);
}

/**
 * The one option that names the school, or null. Exact text first, then the school code (when the option carries one), then the single
 * best-scoring name at or above SAME_SCHOOL. A tie at the top is null: two options look like this school and guessing could pick wrong.
 */
export function bestSchoolMatch<T>(options: readonly T[], school: { name: string; code?: string | null }, view: (o: T) => { name: string; code?: string | null }): T | null {
  const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  const exact = options.filter((o) => norm(view(o).name) === norm(school.name));
  if (exact.length === 1) return exact[0]!;
  if (school.code) {
    const byCode = options.filter((o) => sameSchoolCode(view(o).code, school.code));
    if (byCode.length === 1) return byCode[0]!;
  }
  const scored = options.map((o) => ({ o, s: schoolNameScore(view(o).name, school.name) })).sort((x, y) => y.s - x.s);
  const top = scored[0];
  if (!top || top.s < SAME_SCHOOL) return null;
  if (scored[1] && scored[1].s >= top.s - 0.02) return null;
  return top.o;
}

/**
 * Which of several schools a page is about, from the page's text: the one whose code the page shows, else the one whose name's words all
 * appear on the page (the most specific when several do). null when that leaves no single school.
 */
export function schoolOnPage<T>(items: readonly T[], pageText: string, view: (o: T) => { name: string; code?: string | null }): T | null {
  const byCode = items.filter((o) => codeInText(view(o).code, pageText));
  if (byCode.length === 1) return byCode[0]!;
  const page = new Set(schoolWords(pageText));
  const words = [...page];
  const hits = items
    .map((o) => {
      const w = [...new Set(schoolWords(view(o).name))];
      return { o, n: w.length, all: w.length > 0 && w.every((x) => page.has(x) || words.some((p) => sameWord(p, x))) };
    })
    .filter((h) => h.all)
    .sort((a, b) => b.n - a.n);
  if (!hits.length) return null;
  if (hits[1] && hits[1].n === hits[0]!.n) return null;
  return hits[0]!.o;
}
