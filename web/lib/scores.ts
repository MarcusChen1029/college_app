// Section-level test scores kept on the student profile: SAT/ACT breakdowns and English tests.
// Score scales follow each test's official report.

export type ScoreSection = { key: string; label: string; min: number; max: number; step: number };
export type ScoreScale = { label: string; min: number; max: number; step: number; sections: ScoreSection[] };

const four = (labels: [string, string][], min: number, max: number, step: number): ScoreSection[] =>
  labels.map(([key, label]) => ({ key, label, min, max, step }));

const LRSW: [string, string][] = [
  ["reading", "Reading"],
  ["listening", "Listening"],
  ["speaking", "Speaking"],
  ["writing", "Writing"],
];

export const SAT_SCALE: ScoreScale = {
  label: "SAT",
  min: 400,
  max: 1600,
  step: 10,
  sections: [
    { key: "ebrw", label: "Reading & Writing", min: 200, max: 800, step: 10 },
    { key: "math", label: "Math", min: 200, max: 800, step: 10 },
  ],
};

export const ACT_SCALE: ScoreScale = {
  label: "ACT",
  min: 1,
  max: 36,
  step: 1,
  sections: [
    ...four([["english", "English"], ["math", "Math"], ["reading", "Reading"], ["science", "Science"]], 1, 36, 1),
    { key: "writing", label: "Writing", min: 2, max: 12, step: 1 },
  ],
};

export const ENGLISH_TESTS = {
  toefl: { label: "TOEFL iBT (0–120)", min: 0, max: 120, step: 1, sections: four(LRSW, 0, 30, 1) },
  toefl_band: { label: "TOEFL iBT (band 1–6, from 2026)", min: 1, max: 6, step: 0.5, sections: four(LRSW, 1, 6, 0.5) },
  ielts: { label: "IELTS Academic", min: 0, max: 9, step: 0.5, sections: four(LRSW, 0, 9, 0.5) },
  duolingo: {
    label: "Duolingo English Test",
    min: 10,
    max: 160,
    step: 5,
    sections: four([["literacy", "Literacy"], ["comprehension", "Comprehension"], ["conversation", "Conversation"], ["production", "Production"]], 10, 160, 5),
  },
  pte: { label: "PTE Academic", min: 10, max: 90, step: 1, sections: four(LRSW, 10, 90, 1) },
  cambridge: {
    label: "Cambridge English (C1/C2)",
    min: 80,
    max: 230,
    step: 1,
    sections: [...four(LRSW, 80, 230, 1), { key: "use_of_english", label: "Use of English", min: 80, max: 230, step: 1 }],
  },
} satisfies Record<string, ScoreScale>;

export type EnglishTestKey = keyof typeof ENGLISH_TESTS;
export const ENGLISH_TEST_KEYS = Object.keys(ENGLISH_TESTS) as EnglishTestKey[];

export type SectionScores = Record<string, number | null>;
export type EnglishScore = { total: number | null; sections: SectionScores; date?: string | null };

export type TestDetails = {
  sat?: SectionScores;
  act?: SectionScores;
  english?: Partial<Record<EnglishTestKey, EnglishScore>>;
  plan?: TestPlan; // which admission test the student uses (lib/test-plan.ts)
};

/** The student's SAT/ACT choice. `using` = tests with a score the student wants used;
 * `planned` = a test they will take but have no score for yet; `notTaking` = applying test-free. */
export type TestPlan = {
  using?: ("sat" | "act")[];
  planned?: { test: "sat" | "act"; month?: string | null } | null; // month as YYYY-MM
  notTaking?: boolean;
};

/** Parses a typed score; null when empty, out of range or off the test's step. */
export function parseScore(v: string, scale: { min: number; max: number; step: number }): number | null {
  if (v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < scale.min || n > scale.max) return null;
  return Math.abs(n / scale.step - Math.round(n / scale.step)) < 1e-9 ? n : null;
}

/** SAT total from both sections, or null until both are entered. */
export function satTotal(sections: SectionScores | undefined): number | null {
  const e = sections?.ebrw;
  const m = sections?.math;
  return e != null && m != null ? e + m : null;
}

/** "750 / 760" style summary of filled sections. */
export function sectionSummary(scale: ScoreScale, sections: SectionScores | undefined): string {
  return scale.sections
    .map((s) => sections?.[s.key])
    .filter((v): v is number => v != null)
    .join(" / ");
}
