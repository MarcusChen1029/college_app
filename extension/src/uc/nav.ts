// Getting from a UC grade page to its "Enter courses & grades" page. Read live 2026-10-27: the grade page is
// /my-application/acadHistFrGrades/<NN>; each school card on it (name, "School code: 694132", the academic year) has an
// `a#edit_<NN><id>` "Enter courses & grades" link whose click handler opens /my-application/acadHistFrHighSchoolClasses/editClasses/<NN>/<id>.

import { schoolOnPage } from "../../../web/lib/school-match.ts";

export const ucGradePath = (grade: number) => `/my-application/acadHistFrGrades/${String(grade).padStart(2, "0")}`;

const text = (el: Element | null) => {
  const parts: string[] = [];
  const walk = (n: Node) => (n.nodeType === 3 ? parts.push(n.textContent ?? "") : n.childNodes.forEach(walk));
  if (el) walk(el);
  return parts.join(" ").replace(/\s+/g, " ").trim();
};

/**
 * The school year's courses button on a grade page: "Enter courses & grades" while the year is empty, "Edit" once it has courses (both
 * open the same courses page). By id (`edit_<NN><id>`) first; else any link or button with that text inside a block that shows an
 * academic year, never the school's own Edit (acadHistFrInfo) or Delete.
 */
export function ucCoursesButtons(doc: Document, grade: number): HTMLElement[] {
  const nn = String(grade).padStart(2, "0");
  const opens = (el: Element) => /^(enter courses|edit)\b/i.test(text(el)) && !/acadHistFrInfo/i.test(el.getAttribute("href") ?? "");
  const byId = [...doc.querySelectorAll(`[id^="edit_${nn}"]`)].filter((el) => /^edit_\d+$/.test(el.id) && opens(el));
  if (byId.length) return byId as HTMLElement[];
  return [...doc.querySelectorAll("a, button")].filter((el) => {
    if (!opens(el)) return false;
    if (/^enter courses/i.test(text(el))) return true;
    // An "Edit" counts only next to an academic year ("2023 - 2024 academic year"), which the school's own Edit is not.
    for (let up = el.parentElement, i = 0; up && i < 3; up = up.parentElement, i++) {
      const t = text(up);
      if (/School code/i.test(t)) return false; // reached the school's header first: that is the school's Edit
      if (/\d{4}\s*-\s*\d{4} academic year/i.test(t)) return true;
    }
    return false;
  }) as HTMLElement[];
}

/** The courses button of the school on this grade page; a sentence for the report when there is none or no single match. */
export function ucClassesLink(doc: Document, grade: number, school: { name: string; code?: string }): HTMLElement | string {
  const links = ucCoursesButtons(doc, grade);
  if (!links.length) return `UC shows no ${grade}th grade school year to enter courses for: check that ${grade}th grade is added to the school under Academic history (then run again)`;
  if (links.length === 1) return links[0]!;
  /** A link's school card: its nearest ancestor that holds no other school's link. */
  const card = (a: Element): string => {
    let el: Element = a;
    while (el.parentElement && !links.some((o) => o !== a && el.parentElement!.contains(o))) el = el.parentElement;
    return text(el);
  };
  const hits = links.filter((a) => schoolOnPage([school], card(a), (s) => s) !== null);
  return hits.length === 1 ? hits[0]! : `UC lists several schools for ${grade}th grade and the tracker's "${school.name}" matches ${hits.length ? "more than one" : "none"} of them: add the school code in the tracker`;
}
