// Getting a transcript into the app without paid AI: a prompt the student gives to any AI, a tolerant JSON reader,
// and the plan the review table shows before anything is saved. The MCP tool uses the same validators.

import {
  CREDIT_UNITS,
  courseKey,
  CURRICULA,
  GRADE_SCALES,
  LEVELS,
  normalizeName,
  PERIOD_TYPES,
  SCHOOL_KINDS,
  SUB_SUBJECTS,
  SUBJECTS,
  TERM_CODES,
  TERM_STATUSES,
  TERMS_FOR_PERIOD,
  validateCourse,
  validateSchool,
  type CourseInput,
  type SchoolInput,
  type Source,
  type TranscriptCourse,
  type TranscriptSchool,
} from "./transcript.ts";

export const TRANSCRIPT_FORMAT_VERSION = "transcript.v1";
/** The schoolId a planned course carries until its (new) school has been created. */
export const NEW_SCHOOL_ID = "new-school";

type Existing = { schools: TranscriptSchool[]; courses: TranscriptCourse[] };

/** The format spec: shape, allowed values and rules. Built from the same lists the validators use, so it cannot drift. */
export function transcriptFormatText(): string {
  const subSubjects = SUBJECTS.filter((s) => SUB_SUBJECTS[s].length).map((s) => `  ${s}: ${SUB_SUBJECTS[s].join(", ")}`).join("\n");
  const termsFor = PERIOD_TYPES.map((p) => `  ${p}: ${TERMS_FOR_PERIOD[p].join(", ")}`).join("\n");
  return `Answer with ONE JSON object in format "${TRANSCRIPT_FORMAT_VERSION}":

{
  "version": "${TRANSCRIPT_FORMAT_VERSION}",
  "schools": [
    {
      "name": "school name as printed",
      "country": "country",
      "kind": "high_school",
      "curriculum": "us",
      "defaultScale": "letter_plus_minus",
      "defaultPeriod": "semester",
      "firstYear": 2022, "lastYear": 2026,
      "printedGpa": "GPA exactly as printed, or empty", "printedGpaScale": "e.g. 4.0, 100", "gpaWeighted": null, "classRank": "as printed, or empty",
      "courses": [
        {
          "academicYear": 2025,
          "gradeLevel": 11,
          "name": "course name exactly as printed",
          "period": "semester",
          "terms": [
            { "term": "S1", "grade": "A-", "gradeWeighted": "4.7", "status": "graded" },
            { "term": "S2", "grade": "", "status": "in_progress" }
          ],
          "finalGrade": null,
          "scale": "letter_plus_minus", "scaleMax": null,
          "level": "ap",
          "credit": 1, "creditUnit": "carnegie",
          "subject": "mathematics", "subSubject": "calculus", "languageName": "",
          "isSummer": false, "isRepeat": false, "isCollege": false, "collegeName": "", "isWithdrawn": false,
          "notes": "anything you were unsure about"
        }
      ]
    }
  ]
}

Allowed values (use these exact words):
- kind: ${SCHOOL_KINDS.join(", ")}
- curriculum: ${CURRICULA.join(", ")}
- period (also defaultPeriod): ${PERIOD_TYPES.join(", ")} (how the school issues FINAL grades; "full_year" if the transcript shows one grade per year)
- term codes allowed for each period:
${termsFor}
- term status: ${TERM_STATUSES.join(", ")} (all term codes: ${TERM_CODES.join(", ")})
- scale (also defaultScale): ${GRADE_SCALES.join(", ")}. Examples: percent_100 = a 0-100 mark; ib_7 = IB 1-7; a_level = A*-E; letter_plus_minus = A+, A, A-. For anything else use "other" and put the highest possible mark in scaleMax.
- level: ${LEVELS.join(", ")}
- creditUnit: ${CREDIT_UNITS.join(", ")} (not_listed when the transcript shows no credit)
- subject: ${SUBJECTS.join(", ")}
- subSubject (only these combinations, otherwise null):
${subSubjects}

Rules:
1. Copy every grade exactly as printed. Never convert, round, average, estimate or "fix" a grade or a credit.
2. If a weighted and an unweighted grade are both printed, put the UNWEIGHTED one in "grade" and the weighted one in "gradeWeighted".
3. "terms" holds the grade for each term the transcript shows. "finalGrade" is the year/final grade only if the transcript prints one; otherwise null.
4. Use null (or an empty string for text) when something is not on the transcript. Never guess. Put anything you are unsure about in the course's "notes".
5. Courses still in progress use status "in_progress" with an empty grade; courses not started yet use "planned".
6. academicYear is the calendar year the school year starts (2025 for 2025-26).
7. Output JSON only, with no commentary.`;
}

/** The whole prompt the student copies: the format spec plus what to do with the attached transcript. */
export function buildPrompt(): string {
  return `I am attaching (or pasting) my school transcript. Read it carefully and turn every course into the standard format below, exactly as printed.

${transcriptFormatText()}`;
}

/** Reads the AI's answer: tolerates code fences and any text before or after the JSON object. */
export function parseImportText(text: string): { ok: true; data: unknown } | { ok: false; error: string } {
  const t = text.trim();
  if (!t) return { ok: false, error: "Paste the AI's answer first." };
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end < start) return { ok: false, error: "I couldn't find a JSON object in that text." };
  try {
    return { ok: true, data: JSON.parse(t.slice(start, end + 1)) };
  } catch (e) {
    return { ok: false, error: `That isn't valid JSON: ${(e as Error).message}` };
  }
}

export type ImportRow = { schoolIndex: number; schoolName: string; input: CourseInput | null; raw: unknown; errors: string[]; duplicateOf: string | null };
export type ImportSchool = { name: string; existingId: string | null; input: SchoolInput | null; errors: string[] };
export type ImportPlan = { error: string | null; schools: ImportSchool[]; rows: ImportRow[] };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Course fields that come from the context, not the AI. */
const withDefaults = (raw: Record<string, unknown>, schoolId: string, school: Pick<SchoolInput, "defaultScale" | "defaultPeriod"> | undefined, source: Source) => ({
  ...raw,
  schoolId,
  scale: raw.scale ?? school?.defaultScale,
  period: raw.period ?? school?.defaultPeriod,
  source,
  overrides: undefined,
});

function existingKeys(existing: Existing): Map<string, string> {
  const keys = new Map<string, string>();
  for (const c of existing.courses) {
    const school = existing.schools.find((s) => s.id === c.schoolId);
    keys.set(courseKey(school?.name ?? "", c), c.id);
  }
  return keys;
}

/** Validates a pasted transcript against what the student already has. Nothing is saved here. */
export function buildImportPlan(data: unknown, existing: Existing, source: Source): ImportPlan {
  if (!isObject(data) || !Array.isArray(data.schools)) return { error: `That doesn't look like a "${TRANSCRIPT_FORMAT_VERSION}" transcript (no "schools" list).`, schools: [], rows: [] };
  const keys = existingKeys(existing);
  const schools: ImportSchool[] = [];
  const rows: ImportRow[] = [];
  data.schools.forEach((rawSchool: unknown, idx: number) => {
    if (!isObject(rawSchool)) {
      schools.push({ name: "", existingId: null, input: null, errors: [`School ${idx + 1} isn't an object.`] });
      return;
    }
    const { courses, ...fields } = rawSchool;
    const sv = validateSchool(fields);
    const name = typeof fields.name === "string" ? fields.name.trim() : "";
    const found = name ? existing.schools.find((s) => normalizeName(s.name) === normalizeName(name)) : undefined;
    schools.push({ name, existingId: found?.id ?? null, input: sv.ok ? sv.value : null, errors: sv.ok ? [] : sv.errors });
    const defaults = sv.ok ? sv.value : found;
    const schoolId = found?.id ?? `${NEW_SCHOOL_ID}:${idx}`;
    (Array.isArray(courses) ? courses : []).forEach((rawCourse: unknown) => {
      if (!isObject(rawCourse)) {
        rows.push({ schoolIndex: idx, schoolName: name, input: null, raw: rawCourse, errors: ["This course isn't an object."], duplicateOf: null });
        return;
      }
      const cv = validateCourse(withDefaults(rawCourse, schoolId, defaults, source));
      if (!cv.ok) {
        rows.push({ schoolIndex: idx, schoolName: name, input: null, raw: rawCourse, errors: cv.errors, duplicateOf: null });
        return;
      }
      const key = courseKey(name, cv.value);
      const duplicateOf = keys.get(key) ?? null;
      if (!duplicateOf) keys.set(key, "(an earlier row in this paste)");
      rows.push({ schoolIndex: idx, schoolName: name, input: cv.value, raw: rawCourse, errors: [], duplicateOf });
    });
  });
  return { error: null, schools, rows };
}

export type McpAddPlan = {
  /** The id of the existing school, or null when `newSchool` has to be created first. */
  schoolId: string | null;
  newSchool: SchoolInput | null;
  schoolErrors: string[];
  accepted: CourseInput[];
  rejected: { index: number; errors: string[] }[];
  duplicates: number;
};

/** The same checks for an AI writing through MCP: valid, non-duplicate rows are accepted; the rest are reported by index. */
export function planMcpAdd(args: { school: Partial<SchoolInput> & { name: string }; courses: unknown[] }, existing: Existing): McpAddPlan {
  const name = typeof args.school?.name === "string" ? args.school.name.trim() : "";
  const found = name ? existing.schools.find((s) => normalizeName(s.name) === normalizeName(name)) : undefined;
  let newSchool: SchoolInput | null = null;
  if (!found) {
    const sv = validateSchool(args.school ?? {});
    if (!sv.ok) return { schoolId: null, newSchool: null, schoolErrors: sv.errors, accepted: [], rejected: [], duplicates: 0 };
    newSchool = sv.value;
  }
  const defaults = found ?? newSchool ?? undefined;
  const schoolId = found?.id ?? NEW_SCHOOL_ID;
  const keys = existingKeys(existing);
  const accepted: CourseInput[] = [];
  const rejected: { index: number; errors: string[] }[] = [];
  let duplicates = 0;
  args.courses.forEach((raw, index) => {
    if (!isObject(raw)) {
      rejected.push({ index, errors: ["This course isn't an object."] });
      return;
    }
    const cv = validateCourse(withDefaults(raw, schoolId, defaults, "mcp"));
    if (!cv.ok) {
      rejected.push({ index, errors: cv.errors });
      return;
    }
    const key = courseKey(found?.name ?? name, cv.value);
    if (keys.has(key)) {
      duplicates++;
      return;
    }
    keys.set(key, "(an earlier row)");
    accepted.push(cv.value);
  });
  return { schoolId: found?.id ?? null, newSchool, schoolErrors: [], accepted, rejected, duplicates };
}
