// Study directions ("fields") for the field-aware recommender (spec docs/superpowers/specs/2026-10-27-field-recommender-design.md).
// One owner for each field's CIP codes, subject-tier mapping and the course-name keywords used for non-US colleges.
// Labels are not here: the page reads i18n keys `match.field.<key>`.
// Every CIP prefix used below must also be listed in fields-cips.json (the build script reads that file; a test checks it).

export type FieldKey =
  | "computer_science"
  | "data_science"
  | "engineering"
  | "math_physical"
  | "environment"
  | "agriculture"
  | "business"
  | "finance_accounting"
  | "economics"
  | "hospitality"
  | "pre_med"
  | "nursing"
  | "health_sciences"
  | "biology"
  | "psychology"
  | "kinesiology"
  | "pre_law"
  | "international_relations"
  | "social_sciences"
  | "criminal_justice"
  | "social_work"
  | "education"
  | "humanities"
  | "communications"
  | "visual_arts_design"
  | "performing_arts"
  | "architecture"
  | "undecided";

export type FieldArea = "stem" | "business" | "health" | "law_society" | "arts_humanities" | "general";

/** Picker order. "general" only holds "undecided". */
export const FIELD_AREAS: FieldArea[] = ["stem", "business", "health", "law_society", "arts_humanities", "general"];

/** Subject-tier categories that exist in the database (supabase/seed/00_lookups.sql), "general" excluded. */
export const TIER_CATEGORIES = [
  "computer_science",
  "engineering",
  "business",
  "biology_life_sci",
  "pre_med",
  "economics",
  "math_physics",
  "humanities",
  "arts_design",
  "nursing",
] as const;

export type FieldTier = { category: string; weight: number; proxy?: boolean };

export type FieldDef = {
  key: FieldKey;
  area: FieldArea;
  cips: string[]; // 2-digit families ("52") or 4-digit series ("52.08")
  exclude?: string[]; // series removed from a family listed in cips
  tiers: FieldTier[]; // direct tiers set the strength; proxy tiers are only blended with an estimate
  keywords: RegExp | null; // matched against non-US course names
};

export const FIELDS: FieldDef[] = [
  // STEM
  {
    key: "computer_science", area: "stem", cips: ["11", "30.70", "30.08"],
    tiers: [{ category: "computer_science", weight: 1 }],
    keywords: /computer science|computing|software|information technology|data science|informatics|\bBCS\b/i,
  },
  {
    key: "data_science", area: "stem", cips: ["30.70", "27.05", "30.08"],
    tiers: [{ category: "computer_science", weight: 0.5 }, { category: "math_physics", weight: 0.5 }],
    keywords: /data science|statistic|analytics/i,
  },
  { key: "engineering", area: "stem", cips: ["14"], tiers: [{ category: "engineering", weight: 1 }], keywords: /engineer/i },
  {
    key: "math_physical", area: "stem", cips: ["27", "40"], exclude: ["40.06"],
    tiers: [{ category: "math_physics", weight: 1 }],
    keywords: /mathemat|physics|statistic|chemistry|astronom/i,
  },
  {
    key: "environment", area: "stem", cips: ["03", "40.06"], tiers: [],
    keywords: /environment|earth sciences?\b|geolog|geoscience|ecolog|sustainab|conservation/i,
  },
  { key: "agriculture", area: "stem", cips: ["01"], tiers: [], keywords: /agricult|agronom|animal science|food science|horticult/i },
  // Business
  {
    key: "business", area: "business", cips: ["52"],
    tiers: [{ category: "business", weight: 1 }],
    keywords: /business|management|commerce|accounting|financ|marketing|\bBBA\b|\bBCom\b/i,
  },
  {
    key: "finance_accounting", area: "business", cips: ["52.08", "52.03"],
    tiers: [{ category: "business", weight: 0.7 }, { category: "economics", weight: 0.3 }],
    keywords: /financ|accounting|actuar/i,
  },
  { key: "economics", area: "business", cips: ["45.06"], tiers: [{ category: "economics", weight: 1 }], keywords: /econom/i },
  {
    key: "hospitality", area: "business", cips: ["52.09"],
    tiers: [{ category: "business", weight: 1, proxy: true }],
    keywords: /hospitality|hotel|tourism/i,
  },
  // Health
  {
    key: "pre_med", area: "health", cips: ["26", "40.05", "51.11"],
    tiers: [{ category: "pre_med", weight: 0.7 }, { category: "biology_life_sci", weight: 0.3 }],
    keywords: /medicine|\bMBBS\b|\bMBChB\b|\bMBBCh\b|medical science|pre-?med/i,
  },
  { key: "nursing", area: "health", cips: ["51.38"], tiers: [{ category: "nursing", weight: 1 }], keywords: /nursing/i },
  {
    key: "health_sciences", area: "health", cips: ["51"], exclude: ["51.38", "51.11"], tiers: [],
    keywords: /health|pharmac|physiotherap|nutrition|dietetic|dentist|optometr|occupational therapy|radiograph|paramedic/i,
  },
  {
    key: "biology", area: "health", cips: ["26"], tiers: [{ category: "biology_life_sci", weight: 1 }],
    keywords: /biolog|life science|biomedical science|biochem|neuroscience/i,
  },
  { key: "psychology", area: "health", cips: ["42"], tiers: [], keywords: /psycholog/i },
  { key: "kinesiology", area: "health", cips: ["31"], tiers: [], keywords: /kinesiolog|sports? science|exercise science|human movement/i },
  // Law & society
  {
    key: "pre_law", area: "law_society", cips: ["45.10", "22", "38.01"],
    tiers: [{ category: "humanities", weight: 1, proxy: true }],
    keywords: /\blaws?\b|\bLLB\b|legal/i,
  },
  {
    key: "international_relations", area: "law_society", cips: ["45.09", "44.05"],
    tiers: [{ category: "humanities", weight: 1, proxy: true }, { category: "economics", weight: 1, proxy: true }],
    keywords: /international relations|international affairs|international studies|global affairs|public policy/i,
  },
  {
    key: "social_sciences", area: "law_society", cips: ["45"], exclude: ["45.06", "45.09", "45.10"],
    tiers: [{ category: "humanities", weight: 1, proxy: true }],
    // "social science(s)" is left out on purpose: course names use it for admission groups ("Social Sciences admission category").
    keywords: /sociolog|anthropolog|political science|politics|geograph/i,
  },
  { key: "criminal_justice", area: "law_society", cips: ["43"], tiers: [], keywords: /criminolog|criminal justice|policing/i },
  { key: "social_work", area: "law_society", cips: ["44"], exclude: ["44.05"], tiers: [], keywords: /social work|human services/i },
  { key: "education", area: "law_society", cips: ["13"], tiers: [], keywords: /\beducation\b|teaching|\bB\.?Ed\b/i },
  // Arts & humanities
  {
    key: "humanities", area: "arts_humanities", cips: ["23", "54", "38", "16"],
    tiers: [{ category: "humanities", weight: 1 }],
    keywords: /history|philosoph|literature|\benglish\b|classics|linguistic|languages|religio|theolog/i,
  },
  { key: "communications", area: "arts_humanities", cips: ["09", "10"], tiers: [], keywords: /communication|journalism|\bmedia\b/i },
  {
    key: "visual_arts_design", area: "arts_humanities", cips: ["50"], exclude: ["50.03", "50.05", "50.09"],
    tiers: [{ category: "arts_design", weight: 1 }],
    keywords: /fine arts?\b|visual arts?\b|\bdesign\b|\bart\b|illustration|animation|photograph/i,
  },
  {
    key: "performing_arts", area: "arts_humanities", cips: ["50.03", "50.05", "50.09"],
    tiers: [{ category: "arts_design", weight: 1, proxy: true }],
    keywords: /music|drama|theatre|theater|\bdance\b|performing/i,
  },
  { key: "architecture", area: "arts_humanities", cips: ["04"], tiers: [], keywords: /architect/i },
  // No direction yet: ranked by the general tier only.
  { key: "undecided", area: "general", cips: [], tiers: [], keywords: null },
];

const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));

export function fieldByKey(key: FieldKey): FieldDef;
export function fieldByKey(key: string): FieldDef | undefined;
export function fieldByKey(key: string): FieldDef | undefined {
  return BY_KEY.get(key as FieldKey);
}

/** True when CIP prefix `outer` contains `inner` ("52" contains "52.08"; "52.08" contains itself). */
export const cipContains = (outer: string, inner: string) =>
  inner === outer || inner.startsWith(outer.includes(".") ? outer : `${outer}.`);

/**
 * Graduates in a field from per-prefix counts (each prefix in `cip` is the sum of its own 6-digit codes, as the build
 * script writes them). A prefix inside another listed prefix is skipped so it is not counted twice ("52" + "52.08" =
 * the "52" count). Each exclude is subtracted once if it lies inside a counted prefix. Never below 0.
 */
export function fieldGrads(cip: Record<string, number>, field: FieldDef): number {
  const counted = field.cips.filter((p) => !field.cips.some((q) => q !== p && cipContains(q, p)));
  let sum = 0;
  for (const p of new Set(counted)) sum += cip[p] ?? 0;
  for (const ex of new Set(field.exclude ?? [])) {
    if (counted.some((p) => p !== ex && cipContains(p, ex))) sum -= cip[ex] ?? 0;
  }
  return Math.max(0, sum);
}

/** Fields a non-US course name belongs to (a course can belong to several, e.g. "Economics and Management"). */
export function programFields(name: string): FieldKey[] {
  return FIELDS.filter((f) => f.keywords?.test(name)).map((f) => f.key);
}

/** Every CIP prefix the definitions reference, sorted (the content of fields-cips.json). */
export const referencedCips = (): string[] =>
  [...new Set(FIELDS.flatMap((f) => [...f.cips, ...(f.exclude ?? [])]))].sort();
