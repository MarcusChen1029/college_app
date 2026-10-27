// College-specific supplemental essay prompts and international financial documents (2026-27 cycle).
// Data: web/lib/data/supplements.json, built and validated by scripts/build_supplements.py from
// data/supplements_2026_27/<slug>.json (contract: docs/superpowers/research/2026-10-27-supplements-brief.md).
// Pure helpers only; supplements-data.ts imports the JSON and binds them. Prompt text is data and stays English.
//
// Essay slots: each prompt is a ready-made essay the student can open. A slot is stored in the checklist's
// ordinary essay_list (so every progress/roster/share reader keeps working) with `prompt_key` = the prompt's key.
// Slots that every applicant must write are added together on the first edit, so "essays done" can't turn
// true while an untouched required prompt is missing from the list.

import { newEssay, type Checklist, type Essay } from "./checklist.ts";
import { isCustomSlug } from "./custom-college.ts";

export const SUPPLEMENT_CATEGORIES = ["why_us", "why_major", "community", "activity", "challenge", "identity", "intellectual", "short_answer", "other"] as const;
export type SupplementCategory = (typeof SUPPLEMENT_CATEGORIES)[number];

export type SupplementPrompt = {
  key: string;
  prompt: string;
  word_limit: number | null;
  char_limit: number | null;
  /** False = optional. A prompt only some applicants answer is still required, with `applies_to` saying who. */
  required: boolean;
  applies_to: string | null;
  choose: { group: string; pick: number } | null;
  category: SupplementCategory;
  source: number;
};

export type IntlFinanceWhen = "with_application" | "after_admission" | "before_i20" | "unknown";
export type IntlFinance = {
  document: string;
  when: IntlFinanceWhen;
  deadlines: { label: string; date: string | null; note: string | null }[];
  notes: string | null;
  source: number;
};

export type SupplementSource = { n: number; url: string; title: string; accessed: string };

export type CollegeSupplements = {
  cycle: string;
  supplements: "required" | "optional_only" | "none" | "unknown";
  shared_set: "uc-piq" | null;
  prompts: SupplementPrompt[];
  intl_finance: IntlFinance | null;
  sources: SupplementSource[];
  notes: string;
};

export type SupplementsData = { cycle: string; colleges: Record<string, CollegeSupplements> };

export const CURRENT_CYCLE = "2026-27";

/**
 * What we know about a college's supplements. "not_researched" (no file) and "unknown" (researched, nothing
 * official found) both mean unknown to the student, never "no essays". "none" is a sourced fact.
 */
export type SupplementStatus = "not_researched" | "unknown" | "none" | "optional_only" | "required";

export function supplementsFor(data: SupplementsData, slug: string): CollegeSupplements | null {
  return data.colleges[slug] ?? null;
}

/**
 * The record for a list entry. A custom college (one the student typed in, slug "custom-…") never has research data,
 * so it reads as "not researched": manual essays and the "requires no essays" tick still work for it.
 */
export function entrySupplements(data: SupplementsData, slug: string): CollegeSupplements | null {
  return isCustomSlug(slug) ? null : supplementsFor(data, slug);
}

export function supplementStatus(rec: CollegeSupplements | null): SupplementStatus {
  return rec ? rec.supplements : "not_researched";
}

/** The prompts on file are last cycle's (the college hasn't published this year's yet). */
export const isLastYear = (rec: CollegeSupplements | null): boolean => !!rec && rec.cycle !== CURRENT_CYCLE;

/** True when a status means "we don't know", so the UI must not read it as "no essays". */
export const isUnknownStatus = (s: SupplementStatus): boolean => s === "not_researched" || s === "unknown";

/**
 * What the Essays page needs, for every college: prompts, status, cycle and the first source. Drops the international
 * finance block, notes and further sources (about half the file), since the whole map is sent to the browser.
 */
export function forEssaysPage(data: SupplementsData): SupplementsData {
  const colleges: Record<string, CollegeSupplements> = {};
  for (const [slug, r] of Object.entries(data.colleges)) colleges[slug] = { ...r, intl_finance: null, notes: "", sources: r.sources.slice(0, 1) };
  return { cycle: data.cycle, colleges };
}

export function promptsFor(data: SupplementsData, slug: string): SupplementPrompt[] {
  return supplementsFor(data, slug)?.prompts ?? [];
}

export function intlFinanceFor(data: SupplementsData, slug: string): IntlFinance | null {
  return supplementsFor(data, slug)?.intl_finance ?? null;
}

export const sourceOf = (rec: CollegeSupplements, n: number): SupplementSource | undefined => rec.sources.find((s) => s.n === n);

/** UC campuses share the 8 Personal Insight Questions; they live in the Writing page's UC section, not per campus. */
export const isSharedSet = (rec: CollegeSupplements | null): boolean => rec?.shared_set === "uc-piq";

/** Required, but the college publishes the prompt only inside its application (e.g. Boston University). */
export const promptTextMissing = (rec: CollegeSupplements | null): boolean => !!rec && rec.supplements === "required" && rec.prompts.length === 0 && !isSharedSet(rec);

/** Key of the one generic essay planned for a college whose prompt text isn't published. Empty `prompt` = unknown text. */
export const GENERIC_PROMPT_KEY = "supplement";

/**
 * The prompts a student plans essays from: the file's own, or one generic required essay when the college requires
 * one without publishing its text. Shared sets (UC) have none here: they live in the Writing page's UC section.
 */
export function slotPrompts(rec: CollegeSupplements | null): SupplementPrompt[] {
  if (!rec || isSharedSet(rec)) return [];
  if (promptTextMissing(rec))
    return [{ key: GENERIC_PROMPT_KEY, prompt: "", word_limit: null, char_limit: null, required: true, applies_to: null, choose: null, category: "other", source: rec.sources[0]?.n ?? 0 }];
  return rec.prompts;
}

// ── Prompt kinds ──

/**
 * How a prompt applies: everyone must write it; pick N from a group; only some applicants (applies_to);
 * or optional. A choice group that is itself only for some applicants counts as "conditional".
 */
export type PromptKind = "required" | "choice" | "conditional" | "optional";

export function promptKind(p: SupplementPrompt): PromptKind {
  if (!p.required) return "optional";
  if (p.applies_to) return "conditional";
  if (p.choose) return "choice";
  return "required";
}

export type ChoiceGroup = { group: string; pick: number; prompts: SupplementPrompt[]; kind: PromptKind };

/** Choose-N groups in the order their first prompt appears. */
export function choiceGroups(prompts: readonly SupplementPrompt[]): ChoiceGroup[] {
  const out: ChoiceGroup[] = [];
  for (const p of prompts) {
    if (!p.choose) continue;
    const g = out.find((x) => x.group === p.choose!.group);
    if (g) g.prompts.push(p);
    else out.push({ group: p.choose.group, pick: p.choose.pick, prompts: [p], kind: promptKind(p) });
  }
  return out;
}

/** "250 words" / "1,000 characters" / null, in English data terms; the UI formats with its own strings. */
export type Limit = { words: number | null; chars: number | null };
export const limitOf = (p: SupplementPrompt): Limit => ({ words: p.word_limit, chars: p.char_limit });

/** Counts for a one-line summary: prompts every applicant writes, choice groups, conditional and optional ones. */
export function promptCounts(prompts: readonly SupplementPrompt[]) {
  const kinds = prompts.map(promptKind);
  return {
    required: kinds.filter((k) => k === "required").length,
    groups: choiceGroups(prompts).filter((g) => g.kind === "choice"),
    conditional: prompts.filter((p) => promptKind(p) === "conditional").length,
    optional: kinds.filter((k) => k === "optional").length,
  };
}

/**
 * How many essays a college asks of every applicant: required prompts plus the picks from each choose-N group
 * (a required essay with unpublished text counts as one). Null when we don't know (no research, "unknown")
 * and for shared sets (UC), whose essays live in the Writing page's UC section.
 */
export function essaysToWrite(rec: CollegeSupplements | null): number | null {
  if (!rec || isSharedSet(rec) || isUnknownStatus(supplementStatus(rec))) return null;
  const c = promptCounts(slotPrompts(rec));
  return c.required + c.groups.reduce((n, g) => n + g.pick, 0);
}

/** essaysToWrite for every researched college that asks for at least one essay, by slug. */
export function essayCountsBySlug(data: SupplementsData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [slug, rec] of Object.entries(data.colleges)) {
    const n = essaysToWrite(rec);
    if (n) out[slug] = n;
  }
  return out;
}

// ── Slot titles (stored English, seen by teachers and in doc names) ──

const CATEGORY_TITLE: Record<SupplementCategory, string> = {
  why_us: "Why us",
  why_major: "Why this major",
  community: "Community",
  activity: "Activity",
  challenge: "Challenge",
  identity: "Background",
  intellectual: "Intellectual curiosity",
  short_answer: "Short answer",
  other: "Supplemental essay",
};

/** "Why this major", or "Short answer 2" when the college has several prompts of one category. */
export function slotTitle(prompts: readonly SupplementPrompt[], p: SupplementPrompt): string {
  const same = prompts.filter((x) => x.category === p.category);
  const base = CATEGORY_TITLE[p.category];
  return same.length > 1 ? `${base} ${same.indexOf(p) + 1}` : base;
}

// ── Slots: prompts merged with the stored essays ──

export type Slot = {
  prompt: SupplementPrompt;
  kind: PromptKind;
  /** The stored essay for this prompt, or null while the student hasn't touched it. */
  essay: Essay | null;
  /** Required prompts are always on the student's plan; the others only once added or picked. */
  included: boolean;
};

export type SlotView = { slots: Slot[]; groups: ChoiceGroup[]; manual: Essay[] };

/**
 * Prompts merged with the checklist's essays. Each prompt claims the first stored essay with its key; everything
 * else (manually added essays, a second essay with the same key, a key whose prompt was since removed) stays in
 * `manual`, so no stored essay is ever hidden and none is shown twice.
 */
export function essaySlots(checklist: Checklist, prompts: readonly SupplementPrompt[]): SlotView {
  const stored = (checklist.essay_list ?? []);
  const claimed = new Set<string>();
  const slots = prompts.map((prompt) => {
    const essay = stored.find((e) => e.prompt_key === prompt.key && !claimed.has(e.id)) ?? null;
    if (essay) claimed.add(essay.id);
    const kind = promptKind(prompt);
    return { prompt, kind, essay, included: kind === "required" || !!essay };
  });
  return { slots, groups: choiceGroups(prompts), manual: stored.filter((e) => !claimed.has(e.id)) };
}

const slotEssay = (prompts: readonly SupplementPrompt[], p: SupplementPrompt): Essay => ({ ...newEssay(), title: slotTitle(prompts, p), prompt_key: p.key });

/** Adds a stored essay for every prompt all applicants must write that isn't stored yet. */
export function withRequiredSlots(checklist: Checklist, prompts: readonly SupplementPrompt[]): Checklist {
  const list = (checklist.essay_list ?? []);
  const missing = prompts.filter((p) => promptKind(p) === "required" && !list.some((e) => e.prompt_key === p.key));
  if (!missing.length) return checklist;
  return { ...checklist, essay_list: [...list, ...missing.map((p) => slotEssay(prompts, p))] };
}

/** Puts a prompt on the plan (an optional, conditional or picked one), plus the required ones. Clears "no essays". */
export function includeSlot(checklist: Checklist, prompts: readonly SupplementPrompt[], key: string): Checklist {
  const p = prompts.find((x) => x.key === key);
  if (!p) return checklist;
  const base = withRequiredSlots(checklist, prompts);
  const list = (base.essay_list ?? []);
  const next = list.some((e) => e.prompt_key === key) ? list : [...list, slotEssay(prompts, p)];
  return { ...base, no_essays: false, essay_list: next };
}

/** Status or doc link for a prompt's essay; creates the slot (and the required ones) on first edit. */
export function updateSlot(checklist: Checklist, prompts: readonly SupplementPrompt[], key: string, patch: Partial<Pick<Essay, "status" | "url">>): Checklist {
  const base = includeSlot(checklist, prompts, key);
  const list = (base.essay_list ?? []);
  if (!list.some((e) => e.prompt_key === key)) return checklist;
  let done = false;
  return {
    ...base,
    essay_list: list.map((e) => {
      if (done || e.prompt_key !== key) return e;
      done = true;
      return { ...e, ...patch };
    }),
  };
}

/** Takes an optional/picked prompt off the plan. Required prompts stay. */
export function removeSlot(checklist: Checklist, prompts: readonly SupplementPrompt[], key: string): Checklist {
  const p = prompts.find((x) => x.key === key);
  if (!p || promptKind(p) === "required") return checklist;
  const list = (checklist.essay_list ?? []);
  const i = list.findIndex((e) => e.prompt_key === key);
  return i < 0 ? checklist : { ...checklist, essay_list: list.filter((_, j) => j !== i) };
}

/** An essay with no doc and no progress: removing it loses nothing, so no confirmation is needed. */
export const isBlank = (e: Essay | null): boolean => !e || (!e.url.trim() && e.status === "not_started");

/** Turns a manually added essay into a prompt's slot (keeps its doc and status). No-op if the prompt is taken. */
export function linkEssay(checklist: Checklist, prompts: readonly SupplementPrompt[], essayId: string, key: string): Checklist {
  const p = prompts.find((x) => x.key === key);
  const list = checklist.essay_list ?? [];
  const mine = list.find((e) => e.id === essayId);
  const holder = list.find((e) => e.prompt_key === key);
  // A slot that was only created (no doc, not started) gives way to the student's real draft; a used one doesn't.
  if (!p || !mine || mine.prompt_key || (holder && !isBlank(holder))) return checklist;
  const rest = holder ? list.filter((e) => e.id !== holder.id) : list;
  const linked = { ...checklist, essay_list: rest.map((e) => (e.id === essayId ? { ...e, prompt_key: key, title: e.title.trim() || slotTitle(prompts, p) } : e)) };
  return withRequiredSlots(linked, prompts);
}

/** How many prompts of a choice group the student has picked. */
export const pickedCount = (view: SlotView, group: string): number => view.slots.filter((s) => s.prompt.choose?.group === group && s.included).length;

/** What's still open on a college's plan: required prompts not final, and choice groups with too few picks. */
export function openWork(view: SlotView) {
  const groups = view.groups.filter((g) => g.kind === "choice" && pickedCount(view, g.group) < g.pick);
  const slots = view.slots.filter((s) => s.included && s.essay?.status !== "final");
  return { slots: slots.length, unpickedGroups: groups };
}

// ── Reuse: one draft can cover several colleges ──

/** `maybe`: a prompt only some applicants answer (school, program) that the student hasn't marked as theirs yet. */
export type ReuseItem = { slug: string; name: string; words: number | null; chars: number | null; key: string; lastYear: boolean; maybe: boolean };
export type ReuseGroup = { category: SupplementCategory; items: ReuseItem[] };

/** Categories too generic or too short to share one draft across colleges. */
const NOT_REUSABLE: ReadonlySet<SupplementCategory> = new Set(["short_answer", "other"]);

const sizeOf = (i: { words: number | null; chars: number | null }) => i.words ?? (i.chars != null ? i.chars / 6 : Number.POSITIVE_INFINITY);

/**
 * The student's essays grouped by kind of prompt, where at least two colleges ask for the same kind. Sorted shortest
 * limit first (write the longest version once, then cut it down). Items are the prompts on the plan, plus, per college
 * and kind, the shortest conditional prompt not marked yet ("if it applies": many such prompts are for the student's
 * own school or major). A group needs at least one prompt on the plan, so it never consists of maybes alone.
 * UC campuses are left out: their questions already have one shared section.
 */
export function reuseGroups(colleges: readonly { slug: string; name: string; rec: CollegeSupplements | null; checklist: Checklist }[]): ReuseGroup[] {
  const by = new Map<SupplementCategory, ReuseItem[]>();
  const add = (category: SupplementCategory, item: ReuseItem) => by.set(category, [...(by.get(category) ?? []), item]);
  for (const c of colleges) {
    if (!c.rec || isSharedSet(c.rec) || c.checklist.no_essays) continue;
    const view = essaySlots(c.checklist, slotPrompts(c.rec));
    const item = (p: SupplementPrompt, maybe: boolean): ReuseItem => ({ slug: c.slug, name: c.name, words: p.word_limit, chars: p.char_limit, key: p.key, lastYear: isLastYear(c.rec), maybe });
    const planned = new Set<SupplementCategory>();
    for (const s of view.slots) {
      if (!s.included || NOT_REUSABLE.has(s.prompt.category)) continue;
      planned.add(s.prompt.category);
      add(s.prompt.category, item(s.prompt, false));
    }
    const maybes = new Map<SupplementCategory, SupplementPrompt>();
    for (const s of view.slots) {
      const cat = s.prompt.category;
      if (s.included || s.kind !== "conditional" || NOT_REUSABLE.has(cat) || planned.has(cat)) continue;
      const best = maybes.get(cat);
      if (!best || sizeOf({ words: s.prompt.word_limit, chars: s.prompt.char_limit }) < sizeOf({ words: best.word_limit, chars: best.char_limit })) maybes.set(cat, s.prompt);
    }
    for (const [cat, p] of maybes) add(cat, item(p, true));
  }
  const out: ReuseGroup[] = [];
  for (const category of SUPPLEMENT_CATEGORIES) {
    const items = by.get(category);
    if (!items || new Set(items.map((i) => i.slug)).size < 2 || items.every((i) => i.maybe)) continue;
    out.push({ category, items: [...items].sort((a, b) => sizeOf(a) - sizeOf(b) || a.name.localeCompare(b.name)) });
  }
  return out.sort((a, b) => b.items.length - a.items.length);
}

// ── Plain-text lines for the student's AI ("Copy for AI", MCP get_college) ──

const limitText = (p: SupplementPrompt) =>
  [p.word_limit != null && `${p.word_limit} words`, p.char_limit != null && `${p.char_limit} characters`].filter(Boolean).join(" / ") || "no stated limit";

const WHEN_TEXT: Record<IntlFinanceWhen, string> = {
  with_application: "with the application",
  after_admission: "after admission",
  before_i20: "before the I-20 is issued",
  unknown: "timing not published",
};

/** Markdown lines; `ref(n)` turns a source number into the caller's citation text. */
export function supplementLines(rec: CollegeSupplements | null, ref: (s: SupplementSource) => string): string[] {
  const status = supplementStatus(rec);
  if (!rec || status === "not_researched") return ["- Supplemental essays: not researched yet (unknown; check the college's site)"];
  const src = (n: number) => {
    const s = sourceOf(rec, n);
    return s ? ref(s) : "";
  };
  const firstSrc = rec.sources[0] ? ref(rec.sources[0]) : "";
  const cycle = isLastYear(rec) ? `${rec.cycle} prompts, last year's; this year's not published yet` : rec.cycle;
  if (status === "unknown") return [`- Supplemental essays (${rec.cycle}): unknown, no official statement found${firstSrc}`];
  if (status === "none") return [`- Supplemental essays (${cycle}): none (only the main personal statement)${firstSrc}`];
  if (promptTextMissing(rec)) return [`- Supplemental essays (${cycle}): required, but the prompt text is published only inside the application${firstSrc}${rec.notes ? ` (${rec.notes})` : ""}`];
  const lines = [`- Supplemental essays (${cycle}):`];
  if (isSharedSet(rec)) lines.push("  - Answers the 4-of-8 UC Personal Insight Questions (350 words each), shared by every UC campus");
  else {
    for (const p of rec.prompts) {
      const who = p.applies_to ? `only for ${p.applies_to}` : p.required ? (p.choose ? `choose ${p.choose.pick} from group ${p.choose.group}` : "required") : "optional";
      lines.push(`  - [${who}; ${limitText(p)}] ${p.prompt.replace(/\s*\n+\s*/g, " ")}${src(p.source)}`);
    }
  }
  return lines;
}

export function intlFinanceLine(rec: CollegeSupplements | null, ref: (s: SupplementSource) => string): string | null {
  const f = rec?.intl_finance;
  if (!rec || !f) return null;
  const s = sourceOf(rec, f.source);
  const dates = f.deadlines.map((d) => `${d.label}: ${d.date ?? d.note ?? "no date"}${d.date && d.note ? ` (${d.note})` : ""}`).join("; ");
  return `- International financial documents: ${f.document}, ${WHEN_TEXT[f.when]}${dates ? `; ${dates}` : ""}${f.notes ? `. ${f.notes}` : ""}${s ? ref(s) : ""}`;
}
