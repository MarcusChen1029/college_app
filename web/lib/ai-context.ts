// "Copy for AI": the student's profile, list and (on paid plans) each listed college's sourced facts as one
// Markdown document to paste into ChatGPT, Claude or Gemini. Portal logins and private notes are never included.

import { CA_ATHLETIC_TYPES, type CaContinue, type CaTiming } from "./activities.ts";
import { hasDecision, RESULT_LABEL, resultStatus, stage } from "./application.ts";
import { CHECKLIST, ESSAY_STATUSES, isDone, type Checklist } from "./checklist.ts";
import { deadlineApplies } from "./deadline-rules.ts";
import { computeFit, FIT_LABEL, type StudentProfile } from "./fit.ts";
import {
  ADMIT_MODEL,
  daysUntil,
  ENGLISH_POLICY,
  ENGLISH_STATUS,
  FACTOR,
  fmtDate,
  fmtInt,
  fmtPct,
  fmtUsd,
  IMPORTANCE,
  INTERVIEW,
  INTL_AID,
  PLATFORM,
  TEST_POLICY,
  TRANSFER,
} from "./format.ts";
import { makeT } from "./i18n/index.ts";
import { testPlanText } from "./i18n/test-plan-text.ts";
import { caRole } from "./resume.ts";
import { programApplyVia, programFee } from "./programs.ts";
import { regionLabel } from "./regions.ts";
import { ACT_SCALE, ENGLISH_TEST_KEYS, ENGLISH_TESTS, SAT_SCALE, sectionSummary } from "./scores.ts";
import { intlFinanceLine, supplementLines, type SupplementSource } from "./supplements.ts";
import type { Status } from "./student-store";
import { scoredTests } from "./test-plan.ts";
import type { CollegeDetail, CollegeSummary, Deadline } from "./types";

export type PackCollege = {
  college: CollegeSummary;
  plan: string | null;
  status: Status;
  checklist: Checklist;
  /** Full pack only: undefined = not requested, null = failed to load. */
  detail?: CollegeDetail | null;
};

export type PackInput = {
  profile: StudentProfile;
  colleges: PackCollege[];
  deadlines: Deadline[];
  planLabels: Record<string, string>; // ED → "Early Decision"
  englishTestNames: Record<string, string>; // TOEFL_IBT → "TOEFL iBT"
  full: boolean;
  today?: Date;
};

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
const name = (c: { short_name: string | null; name: string }) => c.short_name ?? c.name;
const place = (c: { city: string | null; state_region: string | null; country_code: string }) =>
  [c.city, c.state_region ?? (c.country_code !== "US" ? regionLabel(c.country_code) : null)].filter(Boolean).join(", ");
const join = (parts: (string | null | false | undefined)[]) => parts.filter(Boolean).join("; ");
const latest = <T,>(rows: T[], key: (r: T) => string) => [...rows].sort((a, b) => key(b).localeCompare(key(a)))[0];

function statusLabel(p: PackCollege) {
  if (hasDecision(p.status)) return RESULT_LABEL[resultStatus(p.status)];
  return { in_progress: "In progress", ready: "Ready to submit", submitted: "Submitted" }[stage(p.status, p.checklist)];
}

function profileSection(p: StudentProfile): string[] {
  const t = p.tests ?? {};
  const sat = p.sat != null ? `${p.sat}${sectionSummary(SAT_SCALE, t.sat) ? ` (${SAT_SCALE.sections.filter((s) => t.sat?.[s.key] != null).map((s) => `${s.label} ${t.sat![s.key]}`).join(" / ")})` : ""}` : "not entered";
  const act = p.act != null ? `${p.act}${sectionSummary(ACT_SCALE, t.act) ? ` (${ACT_SCALE.sections.filter((s) => t.act?.[s.key] != null).map((s) => `${s.label} ${t.act![s.key]}`).join(" / ")})` : ""}` : "not entered";
  const english = ENGLISH_TEST_KEYS.flatMap((k) => {
    const s = t.english?.[k];
    if (s?.total == null) return [];
    const parts = ENGLISH_TESTS[k].sections.filter((x) => s.sections?.[x.key] != null).map((x) => `${x.label} ${s.sections[x.key]}`).join(" / ");
    return [`  - ${ENGLISH_TESTS[k].label}: ${s.total}${parts ? ` (${parts})` : ""}${s.date ? `, taken ${fmtDate(s.date)}` : ""}`];
  });
  const used = scoredTests(p);
  const unused = (test: "sat" | "act") => (used.includes(test) ? "" : " (saved, but I'm not using this test)");
  const planText = p.tests?.plan ? testPlanText(makeT("en"), "en", p.tests) : "";
  return [
    "## About me",
    `- Applicant type: ${p.international ? "International student" : "Not marked as international"}`,
    `- Target regions: ${p.targetRegions?.length ? p.targetRegions.map(regionLabel).join(", ") : "not chosen"}`,
    `- GPA (unweighted, 4.0 scale): ${p.gpa ?? "not entered"}`,
    ...(p.gpaWeighted != null ? [`- GPA (weighted, as on my transcript; the school's own scale, so not comparable with college averages): ${p.gpaWeighted}`] : []),
    ...(planText ? [`- Admission test: ${planText}`] : []),
    `- SAT: ${sat}${p.sat != null ? unused("sat") : ""}`,
    `- ACT: ${act}${p.act != null ? unused("act") : ""}`,
    english.length ? "- English tests:" : "- English tests: none entered",
    ...english,
  ];
}

const TIMING_TEXT: Record<CaTiming, string> = { school: "during the school year", break: "during school break", all: "all year" };
const CONTINUE_TEXT: Record<CaContinue, string> = { yes: "yes", no: "no", not_sure: "not sure" };

function activitiesSection(p: StudentProfile): string[] {
  const ca = p.activities?.commonApp;
  // The role is only the student's answer when they said they had a leadership role.
  const acts = (ca?.activities ?? []).filter((a) => caRole(a) || a.organization || a.description);
  const honors = (ca?.honors ?? []).filter((h) => h.title);
  if (!acts.length && !honors.length) return [];
  return [
    "## My activities (Common App)",
    ...acts.map((a, i) => {
      const time = [a.hoursPerWeek != null && `${a.hoursPerWeek} h/week`, a.weeksPerYear != null && `${a.weeksPerYear} weeks/year`].filter(Boolean).join(", ");
      const head = [caRole(a), a.organization].filter(Boolean).join(", ");
      const type = [a.type, CA_ATHLETIC_TYPES.includes(a.type) ? a.sport : ""].filter(Boolean).join(": "); // a sport only goes with the athletics types
      const after = a.grades.includes("PG") && a.afterStart ? `after high school ${a.afterStart} to ${a.stillParticipating === false && a.afterEnd ? a.afterEnd : "present"}` : "";
      const details = [
        a.grades.length ? `grades ${a.grades.join(", ")}` : "",
        a.timing ? TIMING_TEXT[a.timing] : "",
        after,
        time,
        a.continueInCollege ? `plans to continue in college: ${CONTINUE_TEXT[a.continueInCollege]}` : "",
      ].filter(Boolean);
      return `${i + 1}. ${head || type}${head && type ? ` (${type})` : ""}${details.map((d) => ` — ${d}`).join("")}${a.description ? `: ${a.description}` : ""}`;
    }),
    ...(honors.length ? ["", "Honors:", ...honors.map((h) => `- ${h.title}${h.grades.length ? ` (grades ${h.grades.join(", ")})` : ""}`)] : []),
  ];
}

function nextDeadline(p: PackCollege, all: Deadline[], labels: Record<string, string>, today: Date, international: boolean) {
  const d = all
    .filter((d) => d.institution_id === p.college.id && d.due_date && daysUntil(d.due_date, today) >= 0)
    .filter((d) => deadlineApplies(d, { plan: p.plan, international }))
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!))[0];
  if (!d) return "—";
  return `${fmtDate(d.due_date)} — ${d.label ?? (d.plan_key ? labels[d.plan_key] ?? d.plan_key : d.kind.replace(/_/g, " "))}`;
}

function listSection(input: PackInput, today: Date): string[] {
  if (!input.colleges.length) return ["## My list", "No colleges on my list yet."];
  const hasScores = scoredTests(input.profile).length > 0;
  const intl = !!input.profile.international;
  return [
    `## My list (${input.colleges.length} colleges)`,
    "| College | Location | Plan | Status | Fit (rough estimate) | Admit rate | SAT 25th–75th | Next deadline |",
    "|---|---|---|---|---|---|---|---|",
    ...input.colleges.map((p) => {
      const c = p.college;
      const fit = hasScores ? computeFit(input.profile, c) : null;
      const rate = intl && c.intl_admit_rate != null ? `${fmtPct(c.intl_admit_rate)} (international)` : fmtPct(c.admit_rate);
      const sat = c.sat_p25 != null && c.sat_p75 != null ? `${c.sat_p25}–${c.sat_p75}` : "—";
      const plan = p.plan ? input.planLabels[p.plan] ?? p.plan : "Undecided";
      return `| ${[name(c), place(c) || "—", plan, statusLabel(p), fit ? FIT_LABEL[fit.fit] : "—", rate, sat, nextDeadline(p, input.deadlines, input.planLabels, today, intl)].map(cell).join(" | ")} |`;
    }),
    "",
    "Fit labels compare my scores with the college's admit rate and middle-50% scores. They are rough estimates, not predictions.",
  ];
}

function checklistLines(c: Checklist): string[] {
  const essays = c.essay_list ?? [];
  const essayStatus = Object.fromEntries(ESSAY_STATUSES) as Record<string, string>;
  return [
    "- My checklist:",
    ...CHECKLIST.map(([key, label]) => `  - ${label}: ${isDone(key, c) ? "done" : "not done"}`),
    ...essays.filter((e) => e.title).map((e) => `  - Essay "${e.title}": ${essayStatus[e.status] ?? e.status}`),
  ];
}

/** One college's sourced facts as Markdown lines (the "College details" part of the pack). */
export function detailSection(p: PackCollege, input: Pick<PackInput, "planLabels" | "englishTestNames">): string[] {
  const c = p.college;
  const head = `### ${c.name}${place(c) ? ` (${place(c)})` : ""}`;
  const d = p.detail;
  if (!d) return [head, "- Details not available right now. Use only the summary row above for this college.", ...checklistLines(p.checklist)];

  // Number only the sources a fact below points at, in the order they're first cited.
  const used: string[] = [];
  const ref = (id: string | null | undefined) => {
    if (!id || !d.sources.some((s) => s.id === id)) return "";
    if (!used.includes(id)) used.push(id);
    return ` [${used.indexOf(id) + 1}]`;
  };
  // Supplements files carry their own source list; they join the same numbering under "supp:<url>" ids.
  const suppSources = new Map<string, SupplementSource>();
  const suppRef = (s: SupplementSource) => {
    const id = `supp:${s.url}`;
    suppSources.set(id, s);
    if (!used.includes(id)) used.push(id);
    return ` [${used.indexOf(id) + 1}]`;
  };
  const supp = d.supplements;
  const lines: string[] = [head];

  lines.push(`- About: ${join([d.control?.replace(/_/g, " "), d.setting, d.undergrad_enrollment != null && `${fmtInt(d.undergrad_enrollment)} undergraduates`, d.pct_international_ug != null && `${fmtPct(d.pct_international_ug)} international`]) || "—"}`);

  // Same choice as the college_summary view: CDS rows before baseline rows, then the newest year.
  const stats = [...d.admission_stats].sort((a, b) => Number(a.source_note != null) - Number(b.source_note != null) || b.cds_year.localeCompare(a.cds_year))[0];
  if (stats) {
    const facts = join([
      stats.applicants != null && `${fmtInt(stats.applicants)} applicants`,
      stats.admit_rate != null && `admit rate ${fmtPct(stats.admit_rate)}`,
      stats.ed_admit_rate != null && `Early Decision ${fmtPct(stats.ed_admit_rate)}`,
      stats.intl_admit_rate != null && `international ${fmtPct(stats.intl_admit_rate)}`,
      stats.gpa_avg != null && `average GPA ${stats.gpa_avg}`,
    ]);
    lines.push(`- Admissions (${stats.source_note ? "IPEDS baseline" : "CDS"} ${stats.cds_year}): ${facts || "not published"}${ref(stats.source_id)}`);
    const scores = d.test_score_percentiles.filter((t) => t.cds_year === stats.cds_year);
    const range = (t: (typeof scores)[number] | undefined) => (t && t.p25 != null && t.p75 != null ? `${Number(t.p25)}–${Number(t.p75)}${t.p50 != null ? ` (median ${Number(t.p50)})` : ""}` : null);
    const satTotal = scores.find((t) => t.test === "SAT_TOTAL");
    const erw = scores.find((t) => t.test === "SAT_ERW");
    const math = scores.find((t) => t.test === "SAT_MATH");
    const act = scores.find((t) => t.test === "ACT_COMPOSITE");
    if (range(satTotal)) lines.push(`- SAT total 25th–75th: ${range(satTotal)}${ref(satTotal!.source_id)}`);
    else if (range(erw) && range(math)) lines.push(`- SAT 25th–75th by section: Reading & Writing ${range(erw)}, Math ${range(math)}${ref(erw!.source_id)} (no total published)`);
    if (range(act)) lines.push(`- ACT composite 25th–75th: ${range(act)}${ref(act!.source_id)}`);
  }

  const factors = d.admission_factors.filter((f) => f.importance === "very_important").map((f) => FACTOR[f.factor] ?? f.factor.replace(/_/g, " "));
  if (factors.length) lines.push(`- ${IMPORTANCE.very_important} in admission (CDS C7): ${factors.join(", ")}`);

  const policy = latest(d.test_policies, (t) => t.cycle);
  if (policy) lines.push(`- Test policy (${policy.cycle}): ${TEST_POLICY[policy.policy] ?? policy.policy}${policy.notes ? ` — ${policy.notes}` : ""}${ref(policy.source_id)}`);

  const cycle = latest(d.deadlines, (x) => x.cycle)?.cycle;
  const dates = d.deadlines.filter((x) => x.cycle === cycle && x.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  if (dates.length) {
    lines.push(`- Deadlines (${cycle} cycle):`);
    for (const x of dates) {
      const label = x.label ?? (x.plan_key ? input.planLabels[x.plan_key] ?? x.plan_key : x.kind.replace(/_/g, " "));
      const note = x.notification_date ? `; decision by ${fmtDate(x.notification_date)}` : x.notification_note ? `; ${x.notification_note}` : "";
      lines.push(`  - ${label}: ${fmtDate(x.due_date)}${note}${x.notes ? ` (${x.notes})` : ""}${ref(x.source_id)}`);
    }
  }

  if (d.english_policies || d.english_requirements.length) {
    const ep = d.english_policies;
    lines.push(ep ? `- English tests: ${ENGLISH_POLICY[ep.policy] ?? ep.policy}${ep.waiver_notes ? ` — ${ep.waiver_notes}` : ""}${ref(ep.source_id)}` : "- English tests:");
    for (const r of d.english_requirements) {
      const test = input.englishTestNames[r.test_key] ?? r.test_key;
      if (r.status === "not_accepted") {
        lines.push(`  - ${test}: not accepted${ref(r.source_id)}`);
        continue;
      }
      const subs = r.min_subscores ? Object.entries(r.min_subscores).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(", ") : "";
      const facts = join([
        r.min_total != null ? `minimum ${Number(r.min_total)}` : "no published minimum",
        r.recommended_total != null && `recommended ${Number(r.recommended_total)}`,
        subs && `section minimums ${subs}`,
        r.status === "accepted" && ENGLISH_STATUS.accepted,
        r.notes,
      ]);
      lines.push(`  - ${test}: ${facts}${ref(r.source_id)}`);
    }
  }

  const req = latest(d.application_requirements, (r) => r.cycle);
  if (req) {
    lines.push(
      `- Application (${req.cycle}): ${join([
        req.platforms.length > 0 && `via ${req.platforms.map((x) => PLATFORM[x] ?? x).join(" or ")}`,
        req.teacher_recs != null && `${req.teacher_recs} teacher recommendation${req.teacher_recs === 1 ? "" : "s"}`,
        req.counselor_rec && "counselor recommendation",
        req.interview && `interview: ${INTERVIEW[req.interview] ?? req.interview}`,
        req.portfolio && `portfolio: ${req.portfolio}`,
        req.app_fee_usd != null && `fee ${fmtUsd(req.app_fee_usd)}${req.fee_waiver ? " (waiver available)" : ""}`,
        req.css_profile_required && "CSS Profile required",
        req.midyear_report && "midyear report",
      ])}${ref(req.source_id)}`,
    );
    // Free text; a bare "true"/"false" says nothing the notes don't, so skip it. The prompts below replace it when on file.
    if (!supp && req.supplemental_essays && !/^(true|false)$/i.test(req.supplemental_essays.trim())) lines.push(`  - Supplemental essays: ${req.supplemental_essays}${ref(req.source_id)}`);
    if (req.notes) lines.push(`  - Notes: ${req.notes}`);
  }
  // US colleges only: UK/CA/AU applications have no college supplements in this sense.
  if (supp !== undefined && (d.country_code ?? "US") === "US") lines.push(...supplementLines(supp, suppRef));

  const cost = latest(d.cost_aid, (x) => x.year);
  if (cost) {
    lines.push(
      `- Cost & aid (${cost.year}): ${join([
        cost.tuition_intl_usd != null ? `international tuition ${fmtUsd(cost.tuition_intl_usd)}` : cost.tuition_usd != null && `tuition ${fmtUsd(cost.tuition_usd)}`,
        cost.tuition_out_of_state_usd != null && `out-of-state tuition ${fmtUsd(cost.tuition_out_of_state_usd)}`,
        cost.total_coa_usd != null && `total cost of attendance ${fmtUsd(cost.total_coa_usd)}`,
        cost.intl_aid_policy && `international aid: ${INTL_AID[cost.intl_aid_policy] ?? cost.intl_aid_policy}`,
        cost.meets_full_need && "meets full demonstrated need",
        cost.intl_avg_award_usd != null && `average international award ${fmtUsd(cost.intl_avg_award_usd)}`,
      ]) || "not published"}${ref(cost.source_id)}`,
    );
    if (cost.notes) lines.push(`  - Notes: ${cost.notes}`);
  }
  const finance = intlFinanceLine(supp ?? null, suppRef);
  if (finance) lines.push(finance);

  if (d.major_admissions.length) {
    lines.push("- How majors are admitted:");
    for (const m of d.major_admissions)
      lines.push(`  - ${m.program}: ${join([ADMIT_MODEL[m.admit_model] ?? m.admit_model, m.capped && "capped", m.internal_transfer && `switching in: ${TRANSFER[m.internal_transfer] ?? m.internal_transfer}`, m.notes])}`);
  }

  if (d.programs.length) {
    lines.push("- Courses (apply to a course, not the whole university):");
    for (const pr of d.programs) {
      lines.push(
        `  - ${pr.name}${pr.award ? ` (${pr.award})` : ""}: ${join([
          programApplyVia(pr, d.country_code) && `apply via ${programApplyVia(pr, d.country_code)}`,
          pr.ucas_code && `UCAS ${pr.ucas_code}`,
          pr.a_level_offer && `A-level ${pr.a_level_offer}`,
          pr.ib_offer && `IB ${pr.ib_offer}`,
          pr.ap_offer && `US diploma/AP ${pr.ap_offer}`,
          pr.atar != null && `ATAR ${pr.atar}`,
          programFee(pr) && `intl fee ${programFee(pr)}/year`,
          pr.required_subjects && `required: ${pr.required_subjects}`,
          pr.admissions_test && `test: ${pr.admissions_test}`,
          pr.application_deadline && `deadline ${fmtDate(pr.application_deadline)}`,
          pr.ielts_overall != null && `IELTS ${pr.ielts_overall}${pr.ielts_component != null ? ` (${pr.ielts_component} each)` : ""}`,
          pr.success_pct != null && `offer rate ${fmtPct(pr.success_pct)}`,
        ])} — source: ${pr.source_url} (retrieved ${pr.retrieved_on})`,
      );
    }
  }

  lines.push(...checklistLines(p.checklist));

  if (used.length) {
    lines.push("", "Sources:");
    used.forEach((id, i) => {
      const ss = suppSources.get(id);
      if (ss) return lines.push(`${i + 1}. ${ss.title} — ${ss.url} (accessed ${ss.accessed})`);
      const s = d.sources.find((x) => x.id === id)!;
      lines.push(`${i + 1}. ${s.title ?? s.kind} — ${s.url} (accessed ${s.accessed_on})`);
    });
  }
  return lines;
}

export function buildContextPack(input: PackInput): string {
  const today = input.today ?? new Date();
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const parts: string[][] = [
    [
      "# My college application context",
      `Exported from Trakur on ${iso}. Admissions numbers come from each college's Common Data Set (CDS), IPEDS or official admissions pages${input.full ? "; the numbered links under each college are the sources" : ""}.`,
    ],
    profileSection(input.profile),
  ];
  if (input.full) parts.push(activitiesSection(input.profile));
  parts.push(listSection(input, today));
  if (input.full && input.colleges.length) parts.push(["## College details", ...input.colleges.flatMap((p) => ["", ...detailSection(p, input)])]);
  parts.push([
    "## How to use this",
    "- Treat the numbers above as the facts for these colleges. If something isn't listed, say it's unknown instead of estimating it.",
    "- Deadlines and requirements can change during the cycle, so I'll double-check them on the college's own site before submitting.",
  ]);
  return parts.filter((p) => p.length).map((p) => p.join("\n")).join("\n\n") + "\n";
}
