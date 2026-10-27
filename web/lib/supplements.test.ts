import assert from "node:assert/strict";
import { test } from "node:test";
import { isDone, type Checklist, type Essay } from "./checklist.ts";
import {
  entrySupplements,
  essayCountsBySlug,
  essaySlots,
  essaysToWrite,
  GENERIC_PROMPT_KEY,
  includeSlot,
  promptTextMissing,
  slotPrompts,
  intlFinanceFor,
  intlFinanceLine,
  isLastYear,
  isUnknownStatus,
  linkEssay,
  openWork,
  promptKind,
  promptsFor,
  removeSlot,
  reuseGroups,
  slotTitle,
  supplementLines,
  supplementStatus,
  supplementsFor,
  updateSlot,
  type CollegeSupplements,
  type SupplementPrompt,
  type SupplementsData,
} from "./supplements.ts";

const prompt = (key: string, over: Partial<SupplementPrompt> = {}): SupplementPrompt => ({
  key,
  prompt: `Prompt ${key}`,
  word_limit: 250,
  char_limit: null,
  required: true,
  applies_to: null,
  choose: null,
  category: "other",
  source: 1,
  ...over,
});

const rec = (prompts: SupplementPrompt[], over: Partial<CollegeSupplements> = {}): CollegeSupplements => ({
  cycle: "2026-27",
  supplements: prompts.some((p) => p.required) ? "required" : prompts.length ? "optional_only" : "none",
  shared_set: null,
  prompts,
  intl_finance: null,
  sources: [{ n: 1, url: "https://example.edu/essays", title: "Essays", accessed: "2026-10-27" }],
  notes: "",
  ...over,
});

const PURDUE = [
  prompt("why-major", { category: "why_major", word_limit: 250 }),
  prompt("short-a", { category: "short_answer", word_limit: 100, choose: { group: "A", pick: 1 } }),
  prompt("short-b", { category: "short_answer", word_limit: 100, choose: { group: "A", pick: 1 } }),
  prompt("honors", { applies_to: "Honors College applicants", word_limit: null, char_limit: 1000 }),
  prompt("extra", { required: false, category: "activity" }),
];

const DATA: SupplementsData = {
  cycle: "2026-27",
  colleges: {
    purdue: rec(PURDUE, { intl_finance: { document: "Certification of Finances", when: "after_admission", deadlines: [{ label: "I-20 documents", date: null, note: "within 2 weeks of the deposit" }], notes: null, source: 1 } }),
    williams: rec([], { supplements: "none" }),
    mystery: rec([], { supplements: "unknown" }),
    oldcollege: rec([prompt("why-us", { category: "why_us" })], { cycle: "2025-26" }),
  },
};

const essay = (over: Partial<Essay> = {}): Essay => ({ id: Math.random().toString(36).slice(2), title: "", url: "", status: "not_started", ...over });

test("status distinguishes not researched, unknown, sourced none, and last year's prompts", () => {
  assert.equal(supplementStatus(supplementsFor(DATA, "nowhere")), "not_researched");
  assert.equal(supplementStatus(supplementsFor(DATA, "mystery")), "unknown");
  assert.equal(supplementStatus(supplementsFor(DATA, "williams")), "none");
  assert.equal(supplementStatus(supplementsFor(DATA, "purdue")), "required");
  assert.ok(isUnknownStatus("not_researched") && isUnknownStatus("unknown"));
  assert.ok(!isUnknownStatus("none"));
  assert.equal(isLastYear(supplementsFor(DATA, "oldcollege")), true);
  assert.equal(isLastYear(supplementsFor(DATA, "purdue")), false);
  assert.equal(isLastYear(null), false);
  assert.equal(promptsFor(DATA, "nowhere").length, 0);
  assert.equal(promptsFor(DATA, "purdue").length, 5);
  assert.equal(intlFinanceFor(DATA, "purdue")?.when, "after_admission");
  assert.equal(intlFinanceFor(DATA, "williams"), null);
});

test("prompt kinds: required, choice, conditional, optional", () => {
  assert.deepEqual(PURDUE.map(promptKind), ["required", "choice", "choice", "conditional", "optional"]);
});

test("slot titles are per category, numbered when a college repeats one", () => {
  assert.equal(slotTitle(PURDUE, PURDUE[0]), "Why this major");
  assert.equal(slotTitle(PURDUE, PURDUE[2]), "Short answer 2");
});

test("slots merge with stored essays without duplicating manual ones", () => {
  const manual = essay({ title: "Why Purdue (my own)", status: "drafting" });
  const linked = essay({ title: "Why this major", status: "revising", prompt_key: "why-major" });
  const dup = essay({ title: "Old copy", prompt_key: "why-major" });
  const orphan = essay({ title: "Removed prompt", prompt_key: "gone" });
  const view = essaySlots({ essay_list: [manual, linked, dup, orphan] }, PURDUE);
  assert.equal(view.slots[0].essay?.id, linked.id);
  assert.equal(view.slots[0].included, true);
  assert.equal(view.slots[1].included, false, "unpicked choice is not on the plan");
  assert.equal(view.slots[4].included, false, "optional is not on the plan");
  assert.deepEqual(view.manual.map((e) => e.id), [manual.id, dup.id, orphan.id]);
  // Every stored essay appears exactly once.
  const shown = [...view.slots.flatMap((s) => (s.essay ? [s.essay.id] : [])), ...view.manual.map((e) => e.id)];
  assert.equal(new Set(shown).size, 4);
  assert.equal(shown.length, 4);
});

test("the first edit stores every required slot, so essays can't read done while one is untouched", () => {
  const c = updateSlot({}, PURDUE, "short-a", { status: "final" });
  const keys = (c.essay_list ?? []).map((e) => e.prompt_key);
  assert.deepEqual(keys, ["why-major", "short-a"]);
  assert.equal(isDone("essays", c), false);
  const done = updateSlot(c, PURDUE, "why-major", { status: "final" });
  assert.equal(isDone("essays", done), true);
  assert.equal(done.essay_list?.length, 2, "updating an existing slot doesn't add another");
  assert.equal(done.essay_list?.[0].title, "Why this major");
});

test("include clears no_essays; remove only drops non-required slots; unknown keys are ignored", () => {
  const c = includeSlot({ no_essays: true }, PURDUE, "honors");
  assert.equal(c.no_essays, false);
  assert.deepEqual(c.essay_list?.map((e) => e.prompt_key), ["why-major", "honors"]);
  assert.equal(includeSlot(c, PURDUE, "honors").essay_list?.length, 2);
  assert.deepEqual(removeSlot(c, PURDUE, "honors").essay_list?.map((e) => e.prompt_key), ["why-major"]);
  assert.equal(removeSlot(c, PURDUE, "why-major"), c);
  assert.equal(includeSlot(c, PURDUE, "nope"), c);
  assert.equal(updateSlot(c, PURDUE, "nope", { status: "final" }), c);
});

test("a manual essay can be linked to a prompt instead of making a duplicate", () => {
  const manual = essay({ title: "Why major draft", status: "drafting", url: "https://docs.google.com/d/1" });
  const c = linkEssay({ essay_list: [manual] }, PURDUE, manual.id, "why-major");
  const view = essaySlots(c, PURDUE);
  assert.equal(view.slots[0].essay?.id, manual.id);
  assert.equal(view.slots[0].essay?.url, "https://docs.google.com/d/1");
  assert.equal(view.manual.length, 0);
  assert.equal(linkEssay(c, PURDUE, "other", "why-major"), c, "a prompt already taken isn't linked twice");
});

test("linking replaces a slot that was only created, never one in use", () => {
  const manual = essay({ title: "My why-major draft", status: "drafting" });
  // Another edit created the required slots; why-major is still blank.
  const started = updateSlot({ essay_list: [manual] }, PURDUE, "short-a", { status: "drafting" });
  const blank = started.essay_list!.find((e) => e.prompt_key === "why-major")!;
  const linked = linkEssay(started, PURDUE, manual.id, "why-major");
  const ids = linked.essay_list!.map((e) => e.id);
  assert.ok(!ids.includes(blank.id), "the blank slot is gone");
  assert.equal(linked.essay_list!.filter((e) => e.prompt_key === "why-major").length, 1);
  assert.equal(essaySlots(linked, PURDUE).slots[0].essay?.id, manual.id);
  // A slot with progress is kept; the link is refused.
  const used = updateSlot(started, PURDUE, "why-major", { status: "drafting" });
  assert.equal(linkEssay(used, PURDUE, manual.id, "why-major"), used);
});

test("open work counts unfinished slots and unpicked choice groups", () => {
  const view = essaySlots({}, PURDUE);
  const w = openWork(view);
  assert.equal(w.slots, 1);
  assert.deepEqual(w.unpickedGroups.map((g) => g.group), ["A"]);
  const picked = essaySlots(includeSlot({}, PURDUE, "short-b"), PURDUE);
  assert.equal(openWork(picked).unpickedGroups.length, 0);
});

test("reuse groups need two colleges, sort shortest first, skip UC and short answers", () => {
  const why = (words: number | null, chars: number | null = null) => [prompt("why", { category: "why_major", word_limit: words, char_limit: chars })];
  const groups = reuseGroups([
    { slug: "gt", name: "Georgia Tech", rec: rec(why(300)), checklist: {} },
    { slug: "uiuc", name: "UIUC", rec: rec(why(400)), checklist: {} },
    { slug: "purdue", name: "Purdue", rec: rec(PURDUE), checklist: {} },
    { slug: "rice", name: "Rice", rec: rec(why(null, 900)), checklist: {} },
    { slug: "ucla", name: "UCLA", rec: rec(why(350), { shared_set: "uc-piq" }), checklist: {} },
    { slug: "none", name: "No essays", rec: null, checklist: {} },
    { slug: "skip", name: "Skipped", rec: rec(why(100)), checklist: { no_essays: true } },
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].category, "why_major");
  assert.deepEqual(groups[0].items.map((i) => i.slug), ["rice", "purdue", "gt", "uiuc"]);
  // Only one college asks this category: no group.
  assert.deepEqual(reuseGroups([{ slug: "gt", name: "GT", rec: rec(why(300)), checklist: {} }]), []);
});

test("reuse adds one 'if it applies' item per college and kind, never a group of maybes alone", () => {
  const cornell = rec([
    prompt("cals", { category: "why_major", word_limit: 650, applies_to: "CALS applicants" }),
    prompt("eng", { category: "why_major", word_limit: 250, applies_to: "Engineering applicants" }),
  ]);
  const uiuc = rec([prompt("major", { category: "why_major", word_limit: 300, applies_to: "Applicants with a first-choice major" })]);
  const purdue = rec([prompt("why-major", { category: "why_major", word_limit: 250 })]);
  const groups = reuseGroups([
    { slug: "purdue", name: "Purdue", rec: purdue, checklist: {} },
    { slug: "cornell", name: "Cornell", rec: cornell, checklist: {} },
    { slug: "uiuc", name: "UIUC", rec: uiuc, checklist: {} },
  ]);
  assert.deepEqual(groups[0].items.map((i) => [i.slug, i.key, i.maybe]), [
    ["cornell", "eng", true],
    ["purdue", "why-major", false],
    ["uiuc", "major", true],
  ]);
  // Marked as applying: it becomes a planned item and the other Cornell maybe disappears for that kind.
  const marked = reuseGroups([
    { slug: "purdue", name: "Purdue", rec: purdue, checklist: {} },
    { slug: "cornell", name: "Cornell", rec: cornell, checklist: includeSlot({}, cornell.prompts, "cals") },
  ]);
  assert.deepEqual(marked[0].items.map((i) => [i.key, i.maybe]), [["why-major", false], ["cals", false]]);
  // Only maybes: no group.
  assert.deepEqual(reuseGroups([{ slug: "cornell", name: "Cornell", rec: cornell, checklist: {} }, { slug: "uiuc", name: "UIUC", rec: uiuc, checklist: {} }]), []);
});

test("AI lines say unknown, none and last year's plainly, with sources", () => {
  const ref = (s: { n: number }) => ` [${s.n}]`;
  assert.match(supplementLines(null, ref)[0], /not researched yet/);
  assert.match(supplementLines(DATA.colleges.mystery, ref)[0], /unknown/);
  assert.match(supplementLines(DATA.colleges.williams, ref)[0], /none/);
  assert.match(supplementLines(DATA.colleges.oldcollege, ref)[0], /last year's/);
  const lines = supplementLines(DATA.colleges.purdue, ref);
  assert.match(lines[1], /^ {2}- \[required; 250 words\] Prompt why-major \[1\]$/);
  assert.match(lines[2], /choose 1 from group A/);
  assert.match(lines[4], /only for Honors College applicants; 1000 characters/);
  assert.match(lines[5], /optional/);
  assert.match(intlFinanceLine(DATA.colleges.purdue, ref) ?? "", /Certification of Finances, after admission; I-20 documents: within 2 weeks of the deposit \[1\]/);
  assert.equal(intlFinanceLine(DATA.colleges.williams, ref), null);
});

test("required without published prompt text: one generic required slot, never 'none'", () => {
  const bu = rec([], { supplements: "required", notes: "Prompt only in the Common App." });
  assert.equal(supplementStatus(bu), "required");
  assert.equal(promptTextMissing(bu), true);
  const prompts = slotPrompts(bu);
  assert.deepEqual(prompts.map((p) => [p.key, p.required, p.prompt]), [[GENERIC_PROMPT_KEY, true, ""]]);
  assert.equal(isDone("essays", updateSlot({}, prompts, GENERIC_PROMPT_KEY, { status: "drafting" })), false);
  assert.equal(isDone("essays", updateSlot({}, prompts, GENERIC_PROMPT_KEY, { status: "final" })), true);
  assert.match(supplementLines(bu, () => "")[0], /required, but the prompt text is published only inside the application/);
  // UC files and ordinary files are unaffected.
  assert.deepEqual(slotPrompts(rec([prompt("piq-1")], { shared_set: "uc-piq" })), []);
  assert.equal(slotPrompts(DATA.colleges.purdue).length, 5);
  assert.equal(promptTextMissing(DATA.colleges.williams), false);
});

test("essaysToWrite counts required prompts and choose-N picks; unknown and UC give null", () => {
  const picks = [prompt("a", { choose: { group: "A", pick: 1 } }), prompt("b", { choose: { group: "A", pick: 1 } })];
  assert.equal(essaysToWrite(rec([prompt("why-us"), ...picks, prompt("opt", { required: false }), prompt("hon", { applies_to: "Honors" })])), 2);
  assert.equal(essaysToWrite(rec([], { supplements: "required" })), 1); // prompt text unpublished: one generic essay
  assert.equal(essaysToWrite(rec([])), 0); // sourced "none"
  assert.equal(essaysToWrite(rec([], { supplements: "unknown" })), null);
  assert.equal(essaysToWrite(rec([prompt("piq-1")], { shared_set: "uc-piq" })), null);
  assert.equal(essaysToWrite(null), null);
  const counts = essayCountsBySlug({ cycle: "2026-27", colleges: { x: rec([prompt("a")]), y: rec([]) } });
  assert.deepEqual(counts, { x: 1 });
});

test("a custom college reads as not researched and keeps a working essay list", () => {
  // Even if a slug like this somehow existed in the data, a custom entry never picks it up.
  const data: SupplementsData = { cycle: "2026-27", colleges: { ...DATA.colleges, "custom-row1": DATA.colleges.purdue } };
  const recFor = entrySupplements(data, "custom-row1");
  assert.equal(recFor, null);
  assert.equal(supplementStatus(recFor), "not_researched");
  assert.equal(entrySupplements(data, "purdue"), DATA.colleges.purdue);
  const own = essay({ title: "Why this school", status: "drafting" });
  const view = essaySlots({ essay_list: [own] }, slotPrompts(recFor));
  assert.deepEqual(view.slots, []);
  assert.deepEqual(view.manual.map((e) => e.id), [own.id]);
  // The manual "requires no essays" tick still finishes the item.
  assert.equal(isDone("essays", { no_essays: true }), true);
  // And it never joins a reuse group.
  assert.deepEqual(reuseGroups([{ slug: "custom-row1", name: "My College", rec: recFor, checklist: {} }]), []);
});

test("checklist type keeps prompt_key additive (old essays still valid)", () => {
  const c: Checklist = { essay_list: [{ id: "1", title: "x", url: "", status: "final" }] };
  assert.equal(essaySlots(c, []).manual.length, 1);
});
