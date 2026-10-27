// Whether a course already on a portal is the same course as one in the tracker, when the student typed it slightly differently there
// ("World Language - Japanese I" / "World Language Japanese I", "Information Technology 9" / "Information Technology", "AP Statistic" /
// "AP Statistics"). Careful on purpose: a lab is not its course ("AP Physics 1" / "AP Physics 1- Laboratory" differ), so only punctuation,
// case, Roman numerals, a trailing grade number and one typo are forgiven. A miss adds a duplicate the student can delete; a false match
// would silently drop a course, which is worse.

const ROMAN: Record<string, string> = { i: "1", ii: "2", iii: "3", iv: "4", v: "5", vi: "6" };

function words(name: string): string[] {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((w) => ROMAN[w] ?? w);
}

/** Without a trailing grade number ("Swimming 10" -> "Swimming"). */
const dropGrade = (w: string[]) => (w.length > 1 && /^(9|10|11|12)$/.test(w[w.length - 1]!) ? w.slice(0, -1) : w);

function oneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
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

export function sameCourseName(a: string, b: string): boolean {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return false;
  const ja = wa.join(" ");
  const jb = wb.join(" ");
  if (ja === jb) return true;
  if (dropGrade(wa).join(" ") === dropGrade(wb).join(" ")) return true;
  // One typo, only in names long enough that one letter can't change what the course is.
  return Math.min(ja.length, jb.length) >= 8 && oneEdit(ja, jb) && !/\d/.test(diffChar(ja, jb));
}

/** The characters that differ between two strings one edit apart (a changed digit is a different course: "Chinese 1" vs "Chinese 2"). */
function diffChar(a: string, b: string): string {
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return (a[i] ?? "") + (b[i] ?? "");
}
