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

/** The "Enter courses & grades" link of the school on this grade page; a sentence for the report when there is none or no single match. */
export function ucClassesLink(doc: Document, grade: number, school: { name: string; code?: string }): HTMLElement | string {
  const nn = String(grade).padStart(2, "0");
  const links = [...doc.querySelectorAll(`a[id^="edit_${nn}"]`)].filter((a) => /enter courses/i.test(text(a))) as HTMLElement[];
  if (!links.length) return `UC has no ${grade}th grade courses page for your school yet: add ${grade}th grade to the school under Academic history first`;
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
