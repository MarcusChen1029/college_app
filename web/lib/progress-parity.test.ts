import assert from "node:assert/strict";
import { test } from "node:test";
import { detailSection, type PackCollege } from "./ai-context.ts";
import { stage } from "./application.ts";
import { contextFor, progressFor } from "./application-steps.ts";
import { checklistItems, itemLabel, progress, type Checklist, type CollegeContext } from "./checklist.ts";
import { buildCrunch } from "./crunch.ts";
import { checkStatusChange } from "./mcp/rules.ts";
import {
  AU_FIXTURE_CONTEXT,
  CA_FIXTURE_CONTEXT,
  fullChecklist,
  GB_FIXTURE_CONTEXT,
  NO_COURSES_CONTEXT,
  PARITY_SLUGS,
  parityChecklists,
  PART,
  type ParitySlug,
} from "./progress-fixtures.ts";
import { checklistSummary, computeFlags, parseRosterRow, parseStudentDetail } from "./roster.ts";
import { collegeSummary } from "./roster-detail.ts";
import { statusLabel, statusTone } from "./roster-view.ts";
import { buildWeek } from "./roster-week.ts";
import { normalizeParentView, parentSummary } from "./share-links.ts";
import { stageTone } from "./status.ts";
import type { ListEntry } from "./student-rows.ts";
import type { CollegeSummary, Deadline } from "./types.ts";
import { buildWeeklyChanges } from "./weekly-changes.ts";

// Student, teacher, parent and AI must count the same checklist for a UK, a Canadian and an Australian college, and
// keep the US count for the US one. Each reader is fed the raw shape it gets in production and compared with progressFor.

const TODAY = "2026-11-04";
const NOW = new Date(2026, 10, 4, 9, 0); // local, like the teacher pages
const DUE = "2026-11-08"; // 4 days ahead: inside every "soon" window

const rosterRow = (colleges: Record<string, unknown>[]) => parseRosterRow({ student_id: "s1", display_name: "Sam", linked_at: "2026-11-01T00:00:00Z", sat_total: 1400, last_active: "2026-11-03T00:00:00Z", colleges });
const parentView = (colleges: Record<string, unknown>[]) => normalizeParentView({ kind: "parent", colleges })!;
const country = (slug: string, c: Checklist) => contextFor(slug, c);
const openLabels = (c: Checklist, ctx: CollegeContext) => checklistItems(c, ctx).filter((i) => !i.done).map((i) => itemLabel(i, ctx.country));
const cases = PARITY_SLUGS.flatMap((slug) => parityChecklists(slug).map((c, i) => ({ slug, c, name: `${slug} ${i === 0 ? "FULL" : "PART"}` })));

for (const { slug, c, name } of cases) {
  test(`parity ${name}: teacher roster and parent view count what the student sees`, () => {
    const student = progressFor(slug, c);
    const roster = checklistSummary(rosterRow([{ slug, status: "planning", plan: null, checklist: c }]));
    const parent = parentSummary(parentView([{ slug, status: "planning", checklist: c, deadlines: [] }]));
    assert.deepEqual([roster.done, roster.total], [student.done, student.total]);
    assert.deepEqual([parent.checklistDone, parent.checklistTotal], [student.done, student.total]);
  });

  test(`parity ${name}: teacher detail and the teacher week show the student's open count`, () => {
    const student = progressFor(slug, c);
    const detail = parseStudentDetail({
      student_id: "s1",
      colleges: [{ slug, name: slug, status: "planning", checklist: c, deadlines: [{ due_date: DUE, kind: "application", label: "Apply", plan: null }] }],
    });
    const next = collegeSummary(detail, NOW).next;
    assert.deepEqual(next && { open: next.open, items: next.items }, { open: student.missing, items: student.total });
    const week = buildWeek(
      [rosterRow([{ slug, name: slug, status: "planning", checklist: c, next_deadline: DUE }])],
      [{ studentId: "s1", studentName: "Sam", collegeName: slug, collegeSlug: slug, dueDate: DUE, kind: "application", label: "Apply", status: "planning" }],
      NOW,
    );
    const item = week.days[0].items[0];
    assert.deepEqual([item.open, item.total], [student.missing, student.total]);
  });

  test(`parity ${name}: Ready, the teacher's status word and the AI's submit check agree`, () => {
    const student = progressFor(slug, c);
    const ready = student.missing === 0;
    const ctx = country(slug, c);
    assert.equal(stage("planning", c, ctx), ready ? "ready" : "in_progress");
    assert.equal(statusLabel("planning", c, ctx), ready ? "Ready" : "In progress");
    assert.equal(statusTone("planning", c, ctx), stageTone(ready ? "ready" : "in_progress"));
    const submit = checkStatusChange("in_progress", "submitted", c, ctx);
    if (ready) assert.equal(submit.ok, true);
    else assert.deepEqual(submit, { ok: false, error: `Can't mark as submitted yet. Checklist items not done: ${openLabels(c, ctx).join(", ")}.` });
  });

  test(`parity ${name}: the AI's weekly summary, context pack and the due-soon card list the same items`, () => {
    const student = progressFor(slug, c);
    const ctx = country(slug, c);
    const entry: ListEntry & { name: string } = {
      slug,
      name: slug,
      institutionId: `i-${slug}`,
      plan: null,
      status: "in_progress",
      notes: "",
      checklist: c,
      portal: { url: "", username: "" },
      addedAt: "2026-09-01T00:00:00+00:00",
      updatedAt: "2026-11-03T01:00:00+00:00",
    };
    const deadline = { id: `d-${slug}`, institution_id: `i-${slug}`, cycle: "2026-27", kind: "application", plan_key: null, label: null, due_date: DUE } as Deadline;
    const weekly = buildWeeklyChanges({ today: TODAY, list: [entry], deadlines: [deadline], lastCheckedBySlug: {}, log: [] });
    assert.deepEqual([weekly.updated[0].checklistDone, weekly.updated[0].checklistTotal], [student.done, student.total]);
    assert.deepEqual(weekly.dueSoon[0].missing, openLabels(c, ctx));

    const college = { id: `i-${slug}`, slug, name: slug, short_name: null, city: null, state_region: null, country_code: ctx.country } as unknown as CollegeSummary;
    const pack: PackCollege = { college, plan: null, status: "in_progress", checklist: c, detail: null };
    const lines = detailSection(pack, { planLabels: {}, englishTestNames: {} });
    assert.equal(lines.filter((l) => / {2}- .*: done$/.test(l)).length, student.done);
    assert.equal(lines.filter((l) => / {2}- .*: not done$/.test(l)).length, student.missing);

    const crunch = buildCrunch([{ slug, name: slug, collegeId: `i-${slug}`, plan: null, status: "in_progress", checklist: c }], [deadline], NOW);
    assert.equal(crunch.kind, "crunch");
    if (crunch.kind !== "crunch") return;
    assert.equal(crunch.ready.length, student.missing === 0 ? 1 : 0);
    assert.deepEqual(crunch.open.map((g) => g.key).sort(), checklistItems(c, ctx).filter((i) => !i.done).map((i) => i.key).sort());
  });
}

test("the due-soon card: a UK item is 'not done', a sent item keeps its reason, a US college keeps the US groups", () => {
  const deadline = (slug: string) => ({ id: `d-${slug}`, institution_id: `i-${slug}`, cycle: "2026-27", kind: "application", plan_key: null, label: null, due_date: DUE }) as Deadline;
  const entry = (slug: string, checklist: Checklist) => ({ slug, name: slug, collegeId: `i-${slug}`, plan: null, status: "in_progress" as const, checklist });
  const crunch = buildCrunch([entry("ucl", PART), entry("ubc", { transcript: false }), entry("harvard", PART)], ["ucl", "ubc", "harvard"].map(deadline), NOW);
  assert.equal(crunch.kind, "crunch");
  if (crunch.kind !== "crunch") return;
  // Same-day applications come in name order (harvard, ubc, ucl).
  const reasons = Object.fromEntries(crunch.open.map((g) => [g.id, g.colleges.map((c) => `${c.slug}:${c.reason}`)]));
  assert.deepEqual(reasons, {
    course_choice: ["ubc:not_done", "ucl:not_done"],
    essays: ["harvard:no_essays_yet"],
    recommendations: ["harvard:not_sent"],
    ucas_reference: ["ucl:not_done"],
    transcript: ["harvard:not_sent", "ubc:not_sent"],
    test_scores: ["harvard:plan_undecided"],
    english_test: ["harvard:plan_undecided", "ubc:plan_undecided", "ucl:plan_undecided"],
  });
  assert.deepEqual(crunch.open.map((g) => g.id), ["course_choice", "essays", "recommendations", "ucas_reference", "transcript", "test_scores", "english_test"]);
});

test("parity test is not vacuous: a UK college's item count is not the US one", () => {
  const c = fullChecklist("ucl");
  assert.notEqual(progress(c, GB_FIXTURE_CONTEXT).total, progress(c).total);
  assert.deepEqual(progress(c, GB_FIXTURE_CONTEXT), { done: 5, total: 7, missing: 2 });
});

test("the real parity colleges each have a checklist the US count gets wrong", () => {
  for (const slug of PARITY_SLUGS.filter((s): s is Exclude<ParitySlug, "harvard"> => s !== "harvard")) {
    const differs = parityChecklists(slug).some((c) => JSON.stringify(progressFor(slug, c)) !== JSON.stringify(progress(c)));
    assert.ok(differs, `${slug}: every fixture gives the US count, so the parity loop can't catch a reader that kept it`);
  }
});

test("the parent view keeps every key the country checklists count (hand-built contexts with steps)", () => {
  for (const ctx of [GB_FIXTURE_CONTEXT, CA_FIXTURE_CONTEXT, AU_FIXTURE_CONTEXT, NO_COURSES_CONTEXT]) {
    for (const c of [fullChecklist("ucl"), PART, { ...fullChecklist("ubc"), test_plan: "sat" as const, test_scores: true }]) {
      const kept = parentView([{ slug: "ucl", status: "planning", checklist: c, deadlines: [] }]).colleges[0].checklist;
      assert.deepEqual(progress(kept, ctx), progress(c, ctx), `${ctx.country} ${JSON.stringify(c)}`);
    }
  }
});

test("stage uses the country items", () => {
  assert.equal(stage("planning", { ucas_ps: true, ucas_reference: true, english_plan: "not_required" }, NO_COURSES_CONTEXT), "ready");
  assert.equal(stage("submitted", {}, NO_COURSES_CONTEXT), "submitted");
});

test("never Ready without a course", () => {
  assert.equal(stage("planning", { ucas_ps: true, ucas_reference: true, english_plan: "not_required" }, contextFor("ucl", {})), "in_progress");
});

test("parent view without slug falls back to US", () => {
  const c = fullChecklist("ucl");
  const v = parentView([{ status: "planning", checklist: c, deadlines: [] }]);
  assert.equal(v.colleges[0].slug, null);
  const s = parentSummary(v);
  assert.deepEqual([s.checklistDone, s.checklistTotal], [progress(c).done, progress(c).total]);
  // A slug that is not a plain slug is not trusted either.
  assert.equal(parentView([{ slug: "UCL; drop", status: "planning", checklist: c, deadlines: [] }]).colleges[0].slug, null);
  assert.equal(parentView([{ slug: "ucl", status: "planning", checklist: c, deadlines: [] }]).colleges[0].slug, "ucl");
});

test("flag parity: no essay_not_started on a UK college", () => {
  const notStarted: Checklist = { essay_list: [{ id: "e1", title: "", url: "", status: "not_started" }] };
  const flags = (slug: string) => computeFlags(rosterRow([{ slug, name: slug, status: "in_progress", checklist: notStarted, next_deadline: "2026-11-20" }]), NOW).map((f) => f.key);
  assert.ok(!flags("ucl").includes("essay_not_started"));
  assert.ok(!flags("ubc").includes("essay_not_started"));
  assert.ok(flags("harvard").includes("essay_not_started"));
});

test("flag parity: deadline soon counts the country's open items", () => {
  const soon = (slug: ParitySlug, c: Checklist) => computeFlags(rosterRow([{ slug, name: slug, status: "in_progress", checklist: c, next_deadline: DUE }]), NOW).find((f) => f.key === "deadline_soon");
  // UBC with FULL is complete by its own checklist (the US count would leave test scores open).
  assert.equal(progressFor("ubc", fullChecklist("ubc")).missing, 0);
  assert.equal(soon("ubc", fullChecklist("ubc")), undefined);
  const ucl = progressFor("ucl", PART);
  assert.equal(soon("ucl", PART)?.detail, `ucl is due in 4 days with ${ucl.missing} checklist items open.`);
});

test("junk extra_steps never count", () => {
  const c = fullChecklist("ucl");
  const items = checklistItems(c, GB_FIXTURE_CONTEXT);
  assert.equal(items.find((i) => i.key === "step:aif")?.done, false); // "yes" is not true
  assert.equal(items.find((i) => i.key === "step:ok")?.done, true);
  const kept = parentView([{ slug: "ucl", status: "planning", checklist: c, deadlines: [] }]).colleges[0].checklist;
  assert.deepEqual(kept.extra_steps, { ok: true });
  assert.equal(kept.ucas_reference, undefined); // false is not kept
  assert.equal(kept.course, "computer-science-bsc");
});

test("the parent view keeps only well-formed course and intake values", () => {
  const kept = (checklist: Record<string, unknown>) => parentView([{ slug: "melbourne", status: "planning", checklist, deadlines: [] }]).colleges[0].checklist;
  assert.deepEqual(kept({ course: "commerce-economics", intake: "s2" }), { course: "commerce-economics", intake: "s2" });
  assert.deepEqual(kept({ course: "Commerce Economics", intake: "s3", extra_steps: ["ok"], ucas_ps: "true", admissions_test: 1 }), {});
});
