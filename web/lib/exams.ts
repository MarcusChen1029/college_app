// The student's exam results (Materials > Exams, /materials/exams): AP, IB, A-level, AS, IGCSE, GCSE, Taiwan GSAT and
// "other" curricula, each with a predicted and a final grade stored exactly as printed. One versioned jsonb document per
// student (table student_exams, migration 0057); the signed-out copy lives in localStorage (student-local.ts).
// Spec: docs/superpowers/specs/2026-11-05-exams-page-design.md. Research (every scale and list below cites its section):
// docs/superpowers/research/2026-11-05-curricula-exams.md. Pure: no React, no Supabase.

export type ExamSystem = "ap" | "ib" | "a_level" | "as_level" | "igcse" | "gcse" | "gsat" | "other";
export type IbLevel = "HL" | "SL";

export type ExamEntry = {
  id: string;
  system: ExamSystem;
  /** 1-120 chars: an official name from EXAM_SUBJECTS, or the student's own text. */
  subject: string;
  /** IB subjects only (TOK and EE have no level). */
  level?: IbLevel | null;
  /** Awarding body, a_level / as_level / igcse / gcse only. */
  board?: string | null;
  /** Exam month, "YYYY-MM". */
  session?: string | null;
  /** Grade as printed, on the system's scale. */
  predicted?: string | null;
  result?: string | null;
  /** System "other" only: the curriculum's name (EPQ, O Level, HKDSE, Abitur...). */
  otherName?: string | null;
  note?: string | null;
};

/** IB Diploma totals out of 45, as printed by the school (predicted) or the IB (result). */
export type IbTotals = { predicted?: number | null; result?: number | null };

export type ExamsDoc = { version: 1; entries: ExamEntry[]; ibTotals?: IbTotals };

/** A form's input: an entry without its id. */
export type ExamInput = Omit<ExamEntry, "id">;

export const EXAM_SYSTEMS: readonly ExamSystem[] = ["ap", "ib", "a_level", "as_level", "igcse", "gcse", "gsat", "other"];

/** Curriculum names are official names and stay English in every language ("other" is translated by the page). */
export const EXAM_SYSTEM_LABEL: Record<Exclude<ExamSystem, "other">, string> = {
  ap: "AP",
  ib: "IB Diploma",
  a_level: "A-level",
  as_level: "AS-level",
  igcse: "IGCSE",
  gcse: "GCSE",
  gsat: "GSAT (學測)",
};

export const EXAM_LIMITS = { entries: 80, subject: 120, board: 60, otherName: 80, note: 300, otherGrade: 20, ibTotalMax: 45, idLength: 64 } as const;

/** The account copy must stay under the table's 64 KiB check (0057); this leaves room for jsonb overhead. */
export const EXAMS_MAX_BYTES = 60_000;

export const EMPTY_EXAMS: ExamsDoc = { version: 1, entries: [] };

// ── grade scales ─────────────────────────────────────────────────────────────────────────────────────────────────────

const range = (hi: number, lo: number) => Array.from({ length: hi - lo + 1 }, (_, i) => String(hi - i));

/**
 * Each scale best grade first (summaries sort by this order). `exact` = stored exactly as typed (only AS, whose
 * Cambridge grades are lowercase, research §3); every other scale matches case-insensitively and stores its own spelling.
 */
type Scale = { values: readonly string[]; exact?: boolean };

/** AP: 5 (extremely well qualified) to 1 (no recommendation). Research §1, College Board score scale table. */
const AP_SCALE: Scale = { values: range(5, 1) };
/** IB subjects 1-7; TOK and EE A-E. Research §2 (summary of the IB's DP passing criteria page). */
const IB_SUBJECT_SCALE: Scale = { values: range(7, 1) };
const IB_CORE_SCALE: Scale = { values: ["A", "B", "C", "D", "E"] };
/** A-level A*-E, U = ungraded. Research §3 (gov.uk / Ofqual; Cambridge International). */
const A_LEVEL_SCALE: Scale = { values: ["A*", "A", "B", "C", "D", "E", "U"] };
/** AS A-E, U; Cambridge International prints AS grades lowercase (a-e), so both are kept as typed. Research §3. */
const AS_LEVEL_SCALE: Scale = { values: ["A", "a", "B", "b", "C", "c", "D", "d", "E", "e", "U", "u"], exact: true };
/** GCSE and IGCSE: letters A*-G and numbers 9-1 are both in use, U = ungraded. Research §4. */
const GCSE_SCALE: Scale = { values: ["A*", "A", "B", "C", "D", "E", "F", "G", ...range(9, 1), "U"] };
/** GSAT 學測: 0-15 級分 per subject. Research §5 (CNA / 1111 news summaries). */
const GSAT_SCALE: Scale = { values: range(15, 0) };

export const EXAM_SCALES: Record<Exclude<ExamSystem, "other">, Scale> & { ib_core: Scale } = {
  ap: AP_SCALE,
  ib: IB_SUBJECT_SCALE,
  ib_core: IB_CORE_SCALE,
  a_level: A_LEVEL_SCALE,
  as_level: AS_LEVEL_SCALE,
  igcse: GCSE_SCALE,
  gcse: GCSE_SCALE,
  gsat: GSAT_SCALE,
};

/** Theory of Knowledge and the Extended Essay: graded A-E, no HL/SL (research §2). */
export const IB_CORE = { tok: "Theory of Knowledge", ee: "Extended Essay" } as const;
const coreKind = (subject: string): "tok" | "ee" | null => {
  const s = subject.trim().toLowerCase();
  if (s === "theory of knowledge" || s === "tok") return "tok";
  if (s === "extended essay" || s === "ee") return "ee";
  return null;
};
export const isIbCore = (e: Pick<ExamEntry, "system" | "subject">): boolean => e.system === "ib" && coreKind(e.subject) !== null;

/** The scale an entry's grades use; null = free text ("other"). */
export function scaleFor(system: ExamSystem, subject = ""): Scale | null {
  if (system === "other") return null;
  if (system === "ib" && coreKind(subject)) return IB_CORE_SCALE;
  return EXAM_SCALES[system];
}

/** The allowed grades as hint text, e.g. "A*, A, B, C, D, E, U"; null for free text. AS lists each letter once ("A-E or a-e, U"). */
export function scaleHint(system: ExamSystem, subject = ""): string | null {
  if (system === "as_level") return "A, B, C, D, E, U (or a, b, c, d, e, u)";
  if (system === "gsat") return "0-15";
  const s = scaleFor(system, subject);
  return s ? s.values.join(", ") : null;
}

/** The grade on the entry's scale in the scale's own spelling ("a*" -> "A*", "07" -> "7"); null when it isn't on the scale. Empty text = null. */
export function normalizeGrade(system: ExamSystem, raw: string, subject = ""): string | null {
  const v = raw.trim();
  if (!v) return null;
  const scale = scaleFor(system, subject);
  if (!scale) return v.length <= EXAM_LIMITS.otherGrade ? v : null;
  if (scale.exact) return scale.values.includes(v) ? v : null;
  const numeric = /^\d{1,2}$/.test(v) ? String(Number(v)) : v.toUpperCase();
  return scale.values.find((x) => x === numeric) ?? null;
}

// ── suggestions ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type SubjectSuggestion = { name: string; group?: number };

/** AP: the 42 courses on College Board's course list, exact names. Research §1 (apstudents.collegeboard.org/courses, 2026-11-05). */
const AP_SUBJECTS = [
  "AP 2-D Art and Design", "AP 3-D Art and Design", "AP Drawing", "AP Art History", "AP Music Theory",
  "AP English Language and Composition", "AP English Literature and Composition",
  "AP African American Studies", "AP Comparative Government and Politics", "AP European History", "AP Human Geography",
  "AP Macroeconomics", "AP Microeconomics", "AP Psychology", "AP United States Government and Politics", "AP United States History",
  "AP World History: Modern",
  "AP Calculus AB", "AP Calculus BC", "AP Computer Science A", "AP Computer Science Principles", "AP Precalculus", "AP Statistics",
  "AP Biology", "AP Chemistry", "AP Environmental Science", "AP Physics 1: Algebra-Based", "AP Physics 2: Algebra-Based",
  "AP Physics C: Electricity and Magnetism", "AP Physics C: Mechanics",
  "AP Chinese Language and Culture", "AP French Language and Culture", "AP German Language and Culture", "AP Italian Language and Culture",
  "AP Japanese Language and Culture", "AP Latin", "AP Spanish Language and Culture", "AP Spanish Literature and Culture",
  "AP Research", "AP Seminar",
  "AP Business with Personal Finance", "AP Cybersecurity",
].map((name): SubjectSuggestion => ({ name }));

/**
 * IB DP subjects with their group, research §2 (secondary source, cognito.org; ibo.org refused fetches), plus the two
 * core components. The research says "34 distinct course names" but its list holds 31 (ESS counted once, under group 3,
 * where the research says it also counts as group 4); taken verbatim. Suggestions only: own text is always allowed.
 */
const IB_SUBJECTS: SubjectSuggestion[] = [
  ...["Language A: Literature", "Language A: Language and Literature", "Literature and Performance"].map((name) => ({ name, group: 1 })),
  ...["Language B", "Language ab initio", "Latin", "Classical Greek"].map((name) => ({ name, group: 2 })),
  ...[
    "Business Management", "Digital Society", "Economics", "Environmental Systems and Societies", "Geography", "Global Politics", "History",
    "Philosophy", "Psychology", "Social and Cultural Anthropology", "World Religions",
  ].map((name) => ({ name, group: 3 })),
  ...["Biology", "Chemistry", "Computer Science", "Design Technology", "Physics", "Sports, Exercise and Health Science"].map((name) => ({ name, group: 4 })),
  ...["Mathematics: Analysis and Approaches", "Mathematics: Applications and Interpretation"].map((name) => ({ name, group: 5 })),
  ...["Dance", "Film", "Music", "Theatre", "Visual Arts"].map((name) => ({ name, group: 6 })),
  { name: IB_CORE.tok },
  { name: IB_CORE.ee },
];

/** GSAT 學測 subjects, research §5. */
const GSAT_SUBJECTS = ["國文", "英文", "數學A", "數學B", "社會", "自然"].map((name): SubjectSuggestion => ({ name }));

export const EXAM_SUBJECTS: Record<ExamSystem, readonly SubjectSuggestion[]> = {
  ap: AP_SUBJECTS,
  ib: IB_SUBJECTS,
  a_level: [],
  as_level: [],
  igcse: [],
  gcse: [],
  gsat: GSAT_SUBJECTS,
  other: [],
};

/** Awarding bodies offered as suggestions (research §3, [knowledge], not verified: suggestions only). */
export const BOARD_SUGGESTIONS = ["AQA", "OCR", "Pearson Edexcel", "WJEC/Eduqas", "Cambridge International"] as const;

/** Systems whose entries carry an awarding body. */
export const HAS_BOARD: ReadonlySet<ExamSystem> = new Set(["a_level", "as_level", "igcse", "gcse"]);

// ── validation ───────────────────────────────────────────────────────────────────────────────────────────────────────

export type ExamErrorCode = "system" | "subject" | "level" | "board" | "session" | "predicted" | "result" | "otherName" | "note";
export type ValidateResult = { ok: true; entry: ExamInput } | { ok: false; error: ExamErrorCode };

const str = (v: unknown): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
const opt = (v: unknown): string | null => str(v).trim() || null;
const isSystem = (v: unknown): v is ExamSystem => typeof v === "string" && (EXAM_SYSTEMS as readonly string[]).includes(v);
const SESSION = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Checks a form's input (or a stored entry) and returns the entry to save, trimmed, with each grade in its scale's
 * spelling. Fields that don't apply to the system (level outside IB subjects, board outside A-level/AS/IGCSE/GCSE,
 * otherName outside "other") are dropped, not refused.
 */
export function validateEntry(input: Partial<Record<keyof ExamInput, unknown>>): ValidateResult {
  if (!isSystem(input.system)) return { ok: false, error: "system" };
  const system = input.system;
  const subject = str(input.subject).trim();
  if (!subject || subject.length > EXAM_LIMITS.subject) return { ok: false, error: "subject" };

  let level: IbLevel | null = null;
  if (system === "ib" && !coreKind(subject)) {
    const l = str(input.level).trim().toUpperCase();
    if (l === "HL" || l === "SL") level = l;
    else if (l) return { ok: false, error: "level" };
  }

  const board = HAS_BOARD.has(system) ? opt(input.board) : null;
  if (board && board.length > EXAM_LIMITS.board) return { ok: false, error: "board" };

  const session = opt(input.session);
  if (session) {
    const m = SESSION.exec(session);
    if (!m || Number(m[1]) < 1990 || Number(m[1]) > 2100) return { ok: false, error: "session" };
  }

  const grade = (v: unknown): string | null | false => {
    const raw = str(v).trim();
    if (!raw) return null;
    return normalizeGrade(system, raw, subject) ?? false;
  };
  const predicted = grade(input.predicted);
  if (predicted === false) return { ok: false, error: "predicted" };
  const result = grade(input.result);
  if (result === false) return { ok: false, error: "result" };

  const otherName = system === "other" ? opt(input.otherName) : null;
  if (system === "other" && (!otherName || otherName.length > EXAM_LIMITS.otherName)) return { ok: false, error: "otherName" };

  const note = opt(input.note);
  if (note && note.length > EXAM_LIMITS.note) return { ok: false, error: "note" };

  return { ok: true, entry: { system, subject, level, board, session, predicted, result, otherName, note } };
}

const validTotal = (v: unknown): number | null =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= EXAM_LIMITS.ibTotalMax ? v : null;

/** A diploma total typed by the student: a whole number 0-45, "" = not set. Returns false when invalid. */
export function parseIbTotal(raw: string): number | null | false {
  const v = raw.trim();
  if (!v) return null;
  if (!/^\d{1,2}$/.test(v)) return false;
  return validTotal(Number(v)) ?? false;
}

/**
 * Reads anything (a stored copy, an account row, null) into a valid version-1 document. Never throws. Entries without a
 * usable id, system or subject (or repeating an earlier id) are dropped; any other field that fails validation is
 * cleared, so a stored entry is never lost over one bad grade. Unknown fields are dropped; at most 80 entries are kept.
 */
export function upgradeExams(raw: unknown): ExamsDoc {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { version: 1, entries: [] };
  const r = raw as Record<string, unknown>;
  const seen = new Set<string>();
  const entries: ExamEntry[] = [];
  for (const item of Array.isArray(r.entries) ? r.entries : []) {
    if (entries.length >= EXAM_LIMITS.entries) break;
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const e = item as Record<string, unknown>;
    const id = typeof e.id === "string" ? e.id.trim() : "";
    if (!id || id.length > EXAM_LIMITS.idLength || seen.has(id)) continue;
    const base = validateEntry({ system: e.system, subject: e.subject, otherName: e.otherName });
    // "other" without a curriculum name can't be shown in a group: keep it under a plain name rather than lose it.
    const fallback = !base.ok && base.error === "otherName" ? validateEntry({ system: e.system, subject: e.subject, otherName: "Other" }) : base;
    if (!fallback.ok) continue;
    const entry: ExamEntry = { id, ...fallback.entry };
    for (const k of ["level", "board", "session", "predicted", "result", "note"] as const) {
      const one = validateEntry({ ...fallback.entry, [k]: e[k] });
      if (one.ok) (entry as Record<string, unknown>)[k] = one.entry[k];
    }
    seen.add(id);
    entries.push(entry);
  }
  const doc: ExamsDoc = { version: 1, entries };
  const t = r.ibTotals && typeof r.ibTotals === "object" && !Array.isArray(r.ibTotals) ? (r.ibTotals as Record<string, unknown>) : null;
  const predicted = validTotal(t?.predicted);
  const result = validTotal(t?.result);
  if (predicted != null || result != null) doc.ibTotals = { predicted, result };
  return doc;
}

/** True when the document holds anything worth keeping (an entry, or a diploma total). */
export const examsHaveData = (d: ExamsDoc): boolean => d.entries.length > 0 || d.ibTotals?.predicted != null || d.ibTotals?.result != null;

/** The document's size as the account would store it (UTF-8 bytes of its JSON). */
export const examsBytes = (d: ExamsDoc): number => new TextEncoder().encode(JSON.stringify(d)).length;

export const newExamId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ── status and summaries ─────────────────────────────────────────────────────────────────────────────────────────────

export type ExamStatus = "final" | "predicted" | "planned" | "waiting" | "none";

/**
 * Derived, never stored. A final grade wins, then a predicted one; otherwise the session decides: a later month than
 * today's is "planned", this month or earlier "waiting" (for the result). `today` is "YYYY-MM-DD".
 */
export function examStatus(e: Pick<ExamEntry, "predicted" | "result" | "session">, today: string): ExamStatus {
  if (e.result) return "final";
  if (e.predicted) return "predicted";
  if (e.session) return e.session > today.slice(0, 7) ? "planned" : "waiting";
  return "none";
}

type Which = "predicted" | "result";

const rank = (system: ExamSystem, grade: string): number => {
  const s = scaleFor(system);
  if (!s) return Number.MAX_SAFE_INTEGER;
  // Lowercase AS grades rank with their capital letter.
  const i = s.exact ? s.values.findIndex((v) => v.toUpperCase() === grade.toUpperCase()) : s.values.indexOf(grade);
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

/** The grades of one system, best first, joined as UCAS writes them ("A*AA"); U comes last. "" when none. */
export function gradeString(entries: readonly ExamEntry[], system: ExamSystem, which: Which): string {
  return entries
    .filter((e) => e.system === system && e[which])
    .map((e) => e[which] as string)
    .sort((a, b) => rank(system, a) - rank(system, b))
    .join("");
}

/** How many exams, and how many already have a final grade. */
export function countSummary(entries: readonly ExamEntry[]): { exams: number; withResult: number } {
  return { exams: entries.length, withResult: entries.filter((e) => e.result).length };
}

type Sum = { sum: number; graded: number };
export type IbSummary = {
  /** IB subject entries (TOK and EE not counted). */
  subjects: number;
  hl: number;
  sl: number;
  predicted: Sum;
  result: Sum;
  tok: { predicted: string | null; result: string | null } | null;
  ee: { predicted: string | null; result: string | null } | null;
  /** The diploma totals the student typed (0-45), never computed here. */
  totals: { predicted: number | null; result: number | null };
};

/**
 * The IB card's numbers. The subject sum is out of 42 only as a sum of grades the student entered: the official TOK/EE
 * bonus matrix couldn't be sourced (research §2), so no bonus points and no diploma total are ever computed; the
 * totals shown are the ones typed in `ibTotals`.
 */
export function ibSummary(entries: readonly ExamEntry[], ibTotals?: IbTotals): IbSummary {
  const ib = entries.filter((e) => e.system === "ib");
  const subjects = ib.filter((e) => !coreKind(e.subject));
  const sum = (which: Which): Sum => {
    const graded = subjects.filter((e) => e[which] && /^[1-7]$/.test(e[which] as string));
    return { sum: graded.reduce((n, e) => n + Number(e[which]), 0), graded: graded.length };
  };
  const core = (kind: "tok" | "ee") => {
    const e = ib.find((x) => coreKind(x.subject) === kind);
    return e ? { predicted: e.predicted ?? null, result: e.result ?? null } : null;
  };
  return {
    subjects: subjects.length,
    hl: subjects.filter((e) => e.level === "HL").length,
    sl: subjects.filter((e) => e.level === "SL").length,
    predicted: sum("predicted"),
    result: sum("result"),
    tok: core("tok"),
    ee: core("ee"),
    totals: { predicted: validTotal(ibTotals?.predicted), result: validTotal(ibTotals?.result) },
  };
}

/** The card an entry belongs to: its system, or for "other" its curriculum name (case-insensitive). */
export const groupKey = (e: Pick<ExamEntry, "system" | "otherName">): string =>
  e.system === "other" ? `other:${(e.otherName ?? "").trim().toLowerCase()}` : e.system;

/** Entries grouped into cards in the fixed order (AP, IB, A-level, AS, IGCSE, GCSE, GSAT, then each "other" curriculum by name). */
export function groupEntries(entries: readonly ExamEntry[]): { key: string; system: ExamSystem; title: string | null; entries: ExamEntry[] }[] {
  const groups = new Map<string, { key: string; system: ExamSystem; title: string | null; entries: ExamEntry[] }>();
  for (const e of entries) {
    const key = groupKey(e);
    const g = groups.get(key) ?? { key, system: e.system, title: e.system === "other" ? (e.otherName ?? "").trim() : null, entries: [] };
    g.entries.push(e);
    groups.set(key, g);
  }
  const order = (s: ExamSystem) => EXAM_SYSTEMS.indexOf(s);
  return [...groups.values()].sort((a, b) => order(a.system) - order(b.system) || (a.title ?? "").localeCompare(b.title ?? ""));
}

const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "May 2026" / "2026 年 5 月". Built by hand so it never reads the clock or the browser's locale. */
export function sessionLabel(session: string, locale: string): string {
  const m = SESSION.exec(session);
  if (!m) return session;
  const month = Number(m[2]);
  return locale === "zh-TW" ? `${m[1]} 年 ${month} 月` : `${EN_MONTHS[month - 1]} ${m[1]}`;
}

// ── sign-in merge ────────────────────────────────────────────────────────────────────────────────────────────────────

/** Two entries are the same exam when system, subject, level and session match (and, for "other", the curriculum name). */
const entryKey = (e: ExamEntry): string =>
  JSON.stringify([e.system, e.subject.trim().toLowerCase(), e.level ?? null, e.session ?? null, e.system === "other" ? (e.otherName ?? "").trim().toLowerCase() : null]);

/** The fields a local copy of the same exam may fill in on the account's entry. */
const FILLABLE = ["predicted", "result", "board", "note"] as const;

/**
 * This browser's exams joining the account at sign-in. Never loses an entry:
 * - A local entry is compared only with the account's own entries, never with other local ones (two identical local
 *   entries, e.g. two "Language A: Literature" HL for a bilingual diploma, both join).
 * - It folds into an account entry for the same exam (system, subject, level, session and, for "other", the curriculum
 *   name) when it adds nothing that disagrees: its grades, board or note fill the account entry's empty fields. When a
 *   field disagrees, it joins as its own entry instead (the student removes the one they don't want).
 * - At most 80 entries: local entries past that are returned in `leftover`, for the caller to keep in this browser.
 * Diploma totals the account lacks come from the local copy. A local id already in use gets a suffix.
 * `changed` = the account needs a write.
 */
export function mergeExams(account: ExamsDoc, local: ExamsDoc): { doc: ExamsDoc; changed: boolean; leftover: ExamEntry[] } {
  const entries = account.entries.map((e) => ({ ...e }));
  const accountByKey = new Map<string, ExamEntry[]>();
  for (const e of entries) accountByKey.set(entryKey(e), [...(accountByKey.get(entryKey(e)) ?? []), e]);
  const ids = new Set(entries.map((e) => e.id));
  const leftover: ExamEntry[] = [];
  // Each account entry takes in at most one local entry, so two local copies of one exam never shrink to one.
  const used = new Set<ExamEntry>();
  let filled = false;
  for (const e of local.entries) {
    const target = (accountByKey.get(entryKey(e)) ?? []).find((a) => !used.has(a) && FILLABLE.every((k) => !e[k] || !a[k] || e[k] === a[k]));
    if (target) {
      used.add(target);
      for (const k of FILLABLE) {
        if (e[k] && !target[k]) {
          target[k] = e[k];
          filled = true;
        }
      }
      continue;
    }
    if (entries.length >= EXAM_LIMITS.entries) {
      leftover.push(e);
      continue;
    }
    let id = e.id;
    for (let i = 1; ids.has(id); i++) id = `${e.id}-local${i > 1 ? i : ""}`;
    ids.add(id);
    entries.push({ ...e, id });
  }
  const predicted = validTotal(account.ibTotals?.predicted) ?? validTotal(local.ibTotals?.predicted);
  const result = validTotal(account.ibTotals?.result) ?? validTotal(local.ibTotals?.result);
  const doc: ExamsDoc = { version: 1, entries };
  if (predicted != null || result != null) doc.ibTotals = { predicted, result };
  const totalsChanged = predicted !== validTotal(account.ibTotals?.predicted) || result !== validTotal(account.ibTotals?.result);
  return { doc, changed: filled || entries.length !== account.entries.length || totalsChanged, leftover };
}
