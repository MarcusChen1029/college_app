// Builds a one-page activity resume from the Activities page (Common App and/or UC entries)
// and the profile's grades and test scores.

import {
  CA_TIMING,
  GRADES,
  HONOR_LEVELS,
  UC_AWARD_LEVELS,
  UC_EDPREP_OTHER,
  UC_EDPREP_PROGRAMS,
  type ActivityData,
  type CaActivity,
  type Grade,
  type UcCategory,
  type UcEntry,
} from "./activities.ts";
import type { StudentProfile } from "./fit";
import { ENGLISH_TEST_KEYS, ENGLISH_TESTS, SAT_SCALE, sectionSummary } from "./scores.ts";
import { scoredTests } from "./test-plan.ts";

export type ResumeHeader = { fullName: string; email: string; phone: string; location: string; school: string; gradYear: string };
export const EMPTY_HEADER: ResumeHeader = { fullName: "", email: "", phone: "", location: "", school: "", gradYear: "" };

export type ResumeSource = "common" | "uc" | "both";
export type ResumeOptions = { source: ResumeSource; showHours: boolean; showScores: boolean };
export const DEFAULT_OPTIONS: ResumeOptions = { source: "both", showHours: true, showScores: true };
export type ResumeSettings = { header?: Partial<ResumeHeader>; options?: Partial<ResumeOptions> };

export type ResumeItem = { title: string; organization: string; meta: string; description: string };
export type SectionKey = "leadership" | "service" | "work" | "programs" | "honors";
export const SECTION_TITLES: Record<SectionKey, string> = {
  leadership: "Activities & Leadership",
  service: "Community Service",
  work: "Work Experience",
  programs: "Programs & Coursework",
  honors: "Honors & Awards",
};
const SECTION_ORDER: SectionKey[] = ["honors", "leadership", "service", "work", "programs"];

export type Resume = {
  education: { school: string; gradYear: string; lines: string[] };
  sections: { key: SectionKey; title: string; items: ResumeItem[] }[];
};

/** "Grades 10–12" for a run of consecutive grades, else "Grades 9, 11". */
export function gradeText(grades: Grade[]): string {
  if (grades.length === 0) return "";
  const idx = [...grades].map((g) => GRADES.indexOf(g)).sort((a, b) => a - b);
  const label = (i: number) => (GRADES[i] === "PG" ? "PG" : GRADES[i]);
  const consecutive = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (idx.length > 1 && consecutive) return `Grades ${label(idx[0])}–${label(idx[idx.length - 1])}`;
  return `${idx.length === 1 ? "Grade" : "Grades"} ${idx.map(label).join(", ")}`;
}

const hoursText = (h: number | null, w: number | null) => (h != null && w != null ? `${h} hr/wk, ${w} wk/yr` : h != null ? `${h} hr/wk` : "");
const join = (...parts: string[]) => parts.filter(Boolean).join(" · ");

function caSection(a: CaActivity): SectionKey {
  if (a.type === "Employment or work (paid)" || a.type === "Internship") return "work";
  if (a.type === "Community service or volunteer work") return "service";
  return "leadership";
}

/** The role is only the student's answer to "Did you have a specific position or leadership role?" when that is yes. */
export const caRole = (a: CaActivity) => (a.leadership === true ? a.position.trim() : "");

const UC_SECTION: Record<UcCategory, SectionKey> = {
  award: "honors",
  edprep: "programs",
  coursework: "programs",
  extracurricular: "leadership",
  volunteer: "service",
  work: "work",
};

function fromCa(a: CaActivity, o: ResumeOptions): ResumeItem {
  const timing = a.timing === "school" || a.timing === "break" ? CA_TIMING[a.timing] : ""; // "all year" says nothing extra
  const role = caRole(a);
  return {
    title: role || a.organization || a.sport || a.type,
    organization: role ? a.organization : "",
    meta: join(gradeText(a.grades), timing, o.showHours ? hoursText(a.hoursPerWeek, a.weeksPerYear) : ""),
    description: a.description,
  };
}

/** An education-prep entry is its program (UC's list), or the name the student typed when the program is Other. */
export function ucName(e: UcEntry): string {
  if (e.category !== "edprep") return e.name;
  if (e.program === UC_EDPREP_OTHER) return e.name;
  return UC_EDPREP_PROGRAMS.find((p) => p.value === e.program)?.label ?? "";
}

function fromUc(e: UcEntry, o: ResumeOptions): ResumeItem {
  const work = e.category === "work" && e.jobTitle.trim() !== "";
  return {
    // Work: the job title, then the workplace. Everything else: the name alone.
    title: work ? e.jobTitle : ucName(e),
    organization: work ? e.name : "",
    meta: join(e.awardLevels.map((l) => UC_AWARD_LEVELS[l]).join(", "), gradeText(e.grades), o.showHours ? hoursText(e.hoursPerWeek, e.weeksPerYear) : ""),
    description: e.description,
  };
}

function educationLines(p: StudentProfile): string[] {
  const t = p.tests ?? {};
  const lines: string[] = [];
  if (p.gpa != null) lines.push(`GPA ${p.gpa.toFixed(2)} (unweighted)`);
  const scores: string[] = [];
  const used = scoredTests(p); // a score the student switched away from stays off the résumé
  if (p.sat != null && used.includes("sat")) {
    const s = sectionSummary(SAT_SCALE, t.sat);
    scores.push(`SAT ${p.sat}${s ? ` (${SAT_SCALE.sections.map((x) => `${x.label} ${t.sat?.[x.key] ?? "—"}`).join(", ")})` : ""}`);
  }
  if (p.act != null && used.includes("act")) scores.push(`ACT ${p.act}`);
  for (const k of ENGLISH_TEST_KEYS) {
    const e = t.english?.[k];
    if (e?.total != null) scores.push(`${ENGLISH_TESTS[k].label.replace(/ \(.*\)$/, "")} ${e.total}`);
  }
  if (scores.length) lines.push(scores.join(" · "));
  return lines;
}

export function buildResume(profile: StudentProfile, header: ResumeHeader, o: ResumeOptions): Resume {
  const a: Partial<ActivityData> = profile.activities ?? {};
  const caActs = a.commonApp?.activities ?? [];
  const caHonors = a.commonApp?.honors ?? [];
  // With both sources, UC entries copied from a Common App item are skipped (the Common App one is listed).
  const uc = (a.uc ?? []).filter((e) => o.source === "uc" || (o.source === "both" && !e.fromId));

  const buckets = new Map<SectionKey, ResumeItem[]>(SECTION_ORDER.map((k) => [k, []]));
  if (o.source !== "uc") {
    caActs.filter((x) => x.organization || caRole(x) || x.description).forEach((x) => buckets.get(caSection(x))!.push(fromCa(x, o)));
    caHonors
      .filter((h) => h.title)
      .forEach((h) =>
        buckets.get("honors")!.push({ title: h.title, organization: "", meta: join(h.levels.map((l) => HONOR_LEVELS[l]).join(", "), gradeText(h.grades)), description: "" }),
      );
  }
  if (o.source !== "common") {
    uc.forEach((e) => {
      const item = fromUc(e, o);
      if (item.title) buckets.get(UC_SECTION[e.category])!.push(item);
    });
  }

  return {
    education: { school: header.school, gradYear: header.gradYear, lines: o.showScores ? educationLines(profile) : [] },
    sections: SECTION_ORDER.map((key) => ({ key, title: SECTION_TITLES[key], items: buckets.get(key)! })).filter((s) => s.items.length > 0),
  };
}

/** Plain-text version for pasting into a form or document. */
export function resumeText(header: ResumeHeader, r: Resume): string {
  const out: string[] = [];
  if (header.fullName) out.push(header.fullName.toUpperCase());
  const contact = join(header.email, header.phone, header.location);
  if (contact) out.push(contact);
  if (r.education.school || r.education.lines.length) {
    out.push("", "EDUCATION", join(r.education.school, r.education.gradYear ? `Class of ${r.education.gradYear}` : ""), ...r.education.lines);
  }
  for (const s of r.sections) {
    out.push("", s.title.toUpperCase());
    for (const i of s.items) {
      out.push(`- ${join(i.title, i.organization)}${i.meta ? ` (${i.meta})` : ""}`);
      if (i.description) out.push(`  ${i.description}`);
    }
  }
  return out.join("\n").trim();
}
