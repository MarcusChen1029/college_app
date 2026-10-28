import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pill, SchoolLogo, TierBadge } from "@/components/badges";
import { JumpNav, type JumpItem } from "@/components/JumpNav";
import { CollegeActions } from "@/components/CollegeActions";
import { CollegeSupplementsSection, EssaysRequirement, IntlFinanceNote, SupplementSourceItems } from "@/components/CollegeSupplements";
import { CollegeOutcomes } from "@/components/CollegeOutcomes";
import { EnglishFitLine } from "@/components/EnglishFit";
import { collegeEnglishFrom } from "@/lib/english-fit";
import { DeadlineChip, StatusIcon, StatusPill } from "@/components/StatusPill";
import { getCollege, getLookups } from "@/lib/data";
import {
  ADMIT_MODEL,
  ENGLISH_POLICY,
  ENGLISH_STATUS,
  FACTOR,
  daysUntil,
  fmtDate,
  fmtInt,
  fmtPct,
  fmtScore,
  fmtUsd,
  IMPORTANCE,
  INTERVIEW,
  INTL_AID,
  PLATFORM,
  TEST_POLICY,
  TRANSFER,
} from "@/lib/format";
import { estimateGpaPercentiles, GPA_BAND_ORDER } from "@/lib/gpa";
import { programApplyVia, programFee } from "@/lib/programs";
import { referenceTone } from "@/lib/status";
import type { CollegeDetail } from "@/lib/types";
import { SECTION_TITLE, toneClass } from "@/lib/ui";
import { getT } from "@/lib/i18n/server";

export default function CollegePage({ params }: PageProps<"/colleges/[slug]">) {
  return (
    <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-lg bg-zinc-100" />}>
      <College params={params} />
    </Suspense>
  );
}

async function College({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await getT();
  const [c, lookups] = await Promise.all([getCollege(slug), getLookups()]);
  if (!c) notFound();

  // Number sources in the order they appear so every fact can cite one.
  const srcNum = new Map(c.sources.map((s, i) => [s.id, i + 1]));
  const ref = (id: string | null | undefined) => (id ? srcNum.get(id) : undefined);
  const stats = [...c.admission_stats].sort((a, b) => (a.source_note === null ? -1 : 1) - (b.source_note === null ? -1 : 1) || b.cds_year.localeCompare(a.cds_year))[0];
  const scores = c.test_score_percentiles.filter((s) => s.cds_year === stats?.cds_year);
  const score = (k: string) => scores.find((s) => s.test === k);
  const policy = [...c.test_policies].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const req = [...c.application_requirements].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const cost = [...c.cost_aid].sort((a, b) => b.year.localeCompare(a.year))[0];
  const deadlines = [...c.deadlines].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const gpaEst = estimateGpaPercentiles(stats?.gpa_distribution);
  const isUS = (c.country_code ?? "US") === "US";
  const general = c.institution_tiers.find((t) => t.category_key === "general")?.tier_code;
  const catLabel = (k: string | null) => lookups.categories.find((x) => x.key === k)?.label ?? k ?? "";
  const planLabel = (k: string | null) => lookups.plans.find((p) => p.key === k)?.label ?? k ?? "";
  const testName = (k: string) => lookups.englishTests.find((x) => x.key === k)?.name ?? k;

  const jump: JumpItem[] = [
    ...(isUS ? [{ id: "scores", label: t("college.nav.scores") }] : []),
    ...(c.programs.length > 0 ? [{ id: "courses", label: t("college.nav.courses") }] : []),
    { id: "deadlines", label: t("college.nav.deadlines") },
    ...(isUS || c.english_requirements.length > 0 ? [{ id: "english", label: t("college.nav.english") }] : []),
    ...(isUS ? [{ id: "requirements", label: t("college.nav.requirements") }] : []),
    ...(isUS ? [{ id: "supplemental-essays", label: t("college.nav.essays") }] : []),
    ...(isUS ? [{ id: "cost", label: t("college.nav.cost") }, { id: "tiers", label: t("college.nav.tiers") }, { id: "outcomes", label: t("college.nav.outcomes") }] : []),
    ...(c.admission_factors.length > 0 ? [{ id: "factors", label: t("college.nav.factors") }] : []),
    { id: "sources", label: t("college.nav.sources") },
  ];

  return (
    <article>
      <header className="rounded-3xl bg-blue-50 px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 items-start gap-4">
            <div className="mt-1.5 hidden shrink-0 empty:hidden sm:block">
              <SchoolLogo slug={c.slug} />
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{c.name}</h1>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-zinc-600">
                <TierBadge tier={general} size="sm" />
                <span>
                  {c.city}, {c.state_region} · {c.control === "public" ? t("college.public") : t("college.private")}
                  {c.setting && ` · ${c.setting}`}
                  {c.academic_calendar && ` · ${t("college.calendar", { x: c.academic_calendar })}`}
                </span>
              </p>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                {c.website && (
                  <a className="text-blue-700 hover:underline" href={c.website} target="_blank" rel="noreferrer">
                    {t("college.website")}
                  </a>
                )}
                {c.admissions_url && (
                  <a className="text-blue-700 hover:underline" href={c.admissions_url} target="_blank" rel="noreferrer">
                    {t("college.admissions")}
                  </a>
                )}
              </div>
            </div>
          </div>
          <CollegeActions slug={c.slug} id={c.id} fitInput={isUS ? fitInputFrom(c, stats?.cds_year, policy?.policy ?? null) : undefined} />
        </div>

        {isUS && (
          <>
            {/* Key numbers */}
            <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label={t("college.admitRate")} value={fmtPct(stats?.admit_rate)} sub={stats ? t("college.xOfY", { x: fmtInt(stats.admits), y: fmtInt(stats.applicants) }) : undefined} />
              <Stat label={t("college.edAdmitRate")} value={fmtPct(stats?.ed_admit_rate)} sub={stats?.ed_applicants ? t("college.xOfY", { x: fmtInt(stats.ed_admits), y: fmtInt(stats.ed_applicants) }) : t("college.notReported")} />
              <Stat label={t("college.intlAdmitRate")} value={fmtPct(stats?.intl_admit_rate)} sub={stats?.intl_applicants ? t("college.xOfY", { x: fmtInt(stats.intl_admits), y: fmtInt(stats.intl_applicants) }) : t("college.notReported")} />
              <Stat label={t("college.undergrads")} value={fmtInt(c.undergrad_enrollment)} sub={c.pct_international_ug != null ? t("college.pctInternational", { x: fmtPct(c.pct_international_ug) }) : undefined} />
              <Stat label={t("college.studentFaculty")} value={c.student_faculty_ratio ? `${Number(c.student_faculty_ratio)} : 1` : "—"} />
              <Stat
                label={t("college.waitlist")}
                value={stats?.waitlist_admitted != null ? t("college.nAdmitted", { n: fmtInt(stats.waitlist_admitted) }) : "—"}
                sub={stats?.waitlist_offered ? t("college.ofNOffered", { n: fmtInt(stats.waitlist_offered) }) : undefined}
              />
            </dl>
            {stats && (
              <p className="mt-2.5 text-xs text-zinc-600">
                {stats.source_note ? t("college.admissionsSiteFigures") : t("college.cdsYear", { year: stats.cds_year })}
                <Ref n={ref(stats.source_id)} />
                {stats.notes && <> · {stats.notes}</>}
              </p>
            )}
          </>
        )}
      </header>

      <JumpNav items={jump} label={t("college.onThisPage")} />

      <div className="mt-8 space-y-12">
      {isUS && (
      <div id="scores" className="grid gap-x-12 gap-y-12 lg:grid-cols-2">
        {/* Testing */}
        <Section title={t("college.testScoresTitle")}>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {policy && (
              <>
                {policy.policy === "required" ? (
                  <StatusPill tone="soon">{TEST_POLICY[policy.policy] ?? policy.policy}</StatusPill>
                ) : (
                  <Pill tone="blue">{TEST_POLICY[policy.policy] ?? policy.policy}</Pill>
                )}
                <span className="text-zinc-500">
                  {t("college.forCycleApplicants", { cycle: policy.cycle })}
                  <Ref n={ref(policy.source_id)} />
                </span>
              </>
            )}
          </div>
          {policy?.notes && <p className="mb-3 text-xs text-zinc-500">{policy.notes}</p>}
          {scores.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1">{t("college.colTest")}</th>
                  <th className="py-1 text-right">{t("college.col25")}</th>
                  <th className="py-1 text-right">{t("college.col50")}</th>
                  <th className="py-1 text-right">{t("college.col75")}</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[
                  ["SAT_TOTAL", t("college.satTotal")],
                  ["SAT_ERW", t("college.satErw")],
                  ["SAT_MATH", t("college.satMath")],
                  ["ACT_COMPOSITE", t("college.actComposite")],
                  ["ACT_MATH", t("college.actMath")],
                  ["ACT_ENGLISH", t("college.actEnglish")],
                ].map(([k, label]) => {
                  const s = score(k);
                  if (!s) return null;
                  return (
                    <tr key={k} className="border-t border-zinc-100">
                      <td className="py-1.5">{label}</td>
                      <td className="py-1.5 text-right">{fmtScore(s.p25)}</td>
                      <td className="py-1.5 text-right">{fmtScore(s.p50)}</td>
                      <td className="py-1.5 text-right">{fmtScore(s.p75)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-zinc-500">{policy?.policy === "blind" ? t("college.testBlind") : t("college.noScores")}</p>
          )}
          {stats && (stats.pct_submit_sat != null || stats.pct_submit_act != null) && (
            <p className="mt-2 text-xs text-zinc-500">
              {t("college.submittedScores", { sat: fmtPct(stats.pct_submit_sat, 0), act: fmtPct(stats.pct_submit_act, 0) })}
            </p>
          )}
        </Section>

        {/* GPA */}
        <Section title={t("college.gpaTitle")}>
          {stats?.gpa_avg != null || stats?.gpa_distribution ? (
            <>
              <div className="mb-3 flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-xs text-zinc-500">{t("college.gpaAverage")}</div>
                  <div className="text-xl font-semibold tabular-nums">{stats?.gpa_avg != null ? Number(stats.gpa_avg).toFixed(2) : "—"}</div>
                </div>
                {gpaEst && (
                  <div>
                    <div className="text-xs text-zinc-500">{t("college.gpaEstimated")}</div>
                    <div className="text-xl font-semibold tabular-nums">
                      {gpaEst.p25.toFixed(2)} / {gpaEst.p50.toFixed(2)} / {gpaEst.p75.toFixed(2)}
                    </div>
                  </div>
                )}
              </div>
              {stats?.gpa_distribution && (
                <div className="space-y-1">
                  {GPA_BAND_ORDER.filter((k) => stats.gpa_distribution?.[k]).map((k) => (
                    <div key={k} className="flex items-center gap-2 text-xs">
                      <span className="w-20 tabular-nums text-zinc-500">{k}</span>
                      <div className="h-3 flex-1 rounded bg-zinc-100">
                        <div className="h-3 rounded bg-blue-500" style={{ width: `${Math.min(100, stats.gpa_distribution![k])}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums">{fmtPct(stats.gpa_distribution![k])}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-zinc-500">
                {t("college.gpaFootnote", { pct: fmtPct(stats?.pct_reporting_gpa, 0) })}
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">{t("college.gpaNone")}</p>
          )}
        </Section>
      </div>
      )}

      {c.programs.length > 0 && (
        <Section id="courses" title={t("college.coursesTitle")}>
          <ul className="space-y-3">
            {[...c.programs]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((p) => (
                <li key={p.id} className="rounded-lg border border-zinc-200 p-4 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <h3 className="text-base font-semibold">{p.name}</h3>
                    {p.ucas_code && <Pill>{p.ucas_code}</Pill>}
                    {programApplyVia(p, c.country_code) && <Pill tone="blue">{t("college.applyVia", { x: programApplyVia(p, c.country_code)! })}</Pill>}
                    {p.award && <span className="text-xs text-zinc-500">{p.award}</span>}
                    {p.duration_years != null && <span className="text-xs text-zinc-500">{t("college.nYears", { n: p.duration_years })}</span>}
                    {p.application_deadline && (
                      <DeadlineChip date={p.application_deadline} days={daysUntil(p.application_deadline)} done={false} reference label={t("college.applyBy")} />
                    )}
                  </div>
                  <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1">
                    <Row k={t("college.aLevels")} v={p.a_level_offer ?? "—"} />
                    <Row k={t("college.ib")} v={p.ib_offer ?? (p.ib_points != null ? t("college.nPoints", { n: p.ib_points }) : "—")} />
                    <Row k={t("college.apOffer")} v={p.ap_offer ?? "—"} />
                    {(p.atar != null || c.country_code === "AU") && <Row k={t("college.atar")} v={p.atar != null ? Number(p.atar).toFixed(2) : "—"} />}
                    <Row k={t("college.subjects")} v={p.required_subjects ?? "—"} />
                    <Row k={t("college.admissionsTest")} v={p.admissions_test ?? t("college.noneListed")} />
                    <Row k={t("college.ielts")} v={p.ielts_overall != null ? `${t("college.ieltsOverall", { n: p.ielts_overall })}${p.ielts_component != null ? t("college.ieltsEach", { n: p.ielts_component }) : ""}` : "—"} />
                    {p.toefl_note && <Row k={t("college.toefl")} v={p.toefl_note} />}
                    <Row k={t("college.intlFee")} v={programFee(p) ? t("college.perYear", { fee: programFee(p)! }) : t("college.notFound")} />
                    {p.success_pct != null && (
                      <Row
                        k={t("college.applicants")}
                        v={`${p.interviewed_pct != null ? t("college.pctInterviewed", { n: p.interviewed_pct }) : ""}${t("college.pctSuccessful", { n: p.success_pct })}${p.intake != null ? t("college.aboutPlaces", { n: p.intake }) : ""}`}
                      />
                    )}
                  </dl>
                  {(p.english_note || p.notes) && <p className="mt-2 text-xs text-zinc-500">{[p.english_note, p.notes].filter(Boolean).join(" ")}</p>}
                  <p className="mt-1 text-xs text-zinc-500">
                    <a className="text-blue-600 hover:underline" href={p.source_url} target="_blank" rel="noreferrer">
                      {t("college.coursePage")}
                    </a>{" "}
                    {t("college.checked", { date: fmtDate(p.retrieved_on) })}
                  </p>
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">
            {t("college.courseNote")}
          </p>
        </Section>
      )}

      {/* Deadlines */}
      <Section id="deadlines" title={t("college.deadlinesTitle", { cycle: deadlines[0]?.cycle ?? t("college.currentCycle") })}>
        {deadlines.length ? (
          <ol className="relative space-y-3 border-l border-zinc-200 pl-5">
            {deadlines.map((d) => (
              <li key={d.id} className="text-sm">
                <span className={`absolute -left-[9px] mt-0.5 rounded-full p-0.5 ${toneClass(d.due_date ? referenceTone(daysUntil(d.due_date)) : "neutral")}`}>
                  <StatusIcon tone={d.due_date ? referenceTone(daysUntil(d.due_date)) : "neutral"} />
                </span>
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="w-28 font-medium tabular-nums">{fmtDate(d.due_date)}</span>
                  <span className="font-medium">{d.label ?? planLabel(d.plan_key)}</span>
                  {d.plan_key && d.label && <Pill>{d.plan_key}</Pill>}
                  {d.kind !== "application" && <StatusPill tone="neutral">{d.kind.replace("_", " ")}</StatusPill>}
                  <Ref n={ref(d.source_id)} />
                </div>
                {(d.notification_date || d.notification_note) && (
                  <div className="ml-28 pl-3 text-xs text-zinc-500">{t("college.decision", { x: d.notification_date ? fmtDate(d.notification_date) : (d.notification_note ?? "") })}</div>
                )}
                {d.notes && <div className="ml-28 pl-3 text-xs text-zinc-500">{d.notes}</div>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">{t("college.noDeadlines")}</p>
        )}
      </Section>

      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-2">
        {/* English */}
        {(isUS || c.english_requirements.length > 0) && <Section id="english" title={t("college.englishTitle")}>
          {c.english_policies ? (
            <>
              <p className="mb-2 text-sm">
                <span className="font-medium">{ENGLISH_POLICY[c.english_policies.policy] ?? c.english_policies.policy}</span>
                <Ref n={ref(c.english_policies.source_id)} />
              </p>
              {c.english_policies.waiver_notes && <p className="mb-3 text-xs text-zinc-500">{c.english_policies.waiver_notes}</p>}
            </>
          ) : (
            <p className="text-sm text-zinc-500">{t("college.notRecorded")}</p>
          )}
          <EnglishFitLine english={collegeEnglishFrom(c.english_policies, c.english_requirements)} className="mb-3" />
          {c.english_requirements.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1">{t("college.colTest")}</th>
                  <th className="py-1 pl-3 text-right">{t("college.colMinimum")}</th>
                  <th className="py-1 pl-3 text-right">{t("college.colRecommended")}</th>
                  <th className="py-1 pl-3">{t("college.colNotes")}</th>
                </tr>
              </thead>
              <tbody>
                {c.english_requirements.map((e) => (
                  <tr key={e.test_key} className="border-t border-zinc-100 align-top">
                    <td className="py-1.5">
                      {testName(e.test_key)}
                      <Ref n={ref(e.source_id)} />
                      {e.status === "accepted" && <div className="text-xs text-zinc-500">{ENGLISH_STATUS[e.status]}</div>}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{fmtScore(e.min_total)}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtScore(e.recommended_total)}</td>
                    <td className="py-1.5 pl-3 text-xs text-zinc-500">
                      {e.min_subscores && (
                        <div>
                          {t("college.subscores")}{" "}
                          {Object.entries(e.min_subscores)
                            .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}+`)
                            .join(", ")}
                        </div>
                      )}
                      {e.notes}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-xs text-zinc-500">{t("college.toeflNote")}</p>
        </Section>}

        {/* Requirements */}
        {isUS && <Section id="requirements" title={t("college.requirementsTitle")}>
          {req ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Row k={t("college.platform")} v={req.platforms.map((p) => PLATFORM[p] ?? p).join(", ") || "—"} />
              <Row k={t("college.appFee")} v={req.app_fee_usd != null ? (req.fee_waiver ? t("college.feeWithWaiver", { fee: fmtUsd(req.app_fee_usd) }) : fmtUsd(req.app_fee_usd)) : req.fee_waiver ? t("college.feeWaiverAvailable") : "—"} />
              <Row k={t("college.essays")} v={<EssaysRequirement slug={c.slug} fallback={req.supplemental_essays} t={t} />} />
              <Row k={t("college.recommendations")} v={req.teacher_recs != null ? t(req.counselor_rec ? "college.nTeacherCounselor" : "college.nTeacher", { n: req.teacher_recs }) : "—"} />
              <Row k={t("college.interview")} v={req.interview ? INTERVIEW[req.interview] : "—"} />
              <Row k={t("college.portfolio")} v={req.portfolio ?? "—"} />
              {req.midyear_report != null && <Row k={t("college.midyearReport")} v={req.midyear_report ? t("college.required") : t("college.notRequired")} />}
              {(req.css_profile_required || req.fafsa_required) && (
                <Row k={t("college.aidForms")} v={[req.css_profile_required && "CSS Profile", req.fafsa_required && "FAFSA"].filter(Boolean).join(" + ")} />
              )}
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">{t("college.notRecordedYet")}</p>
          )}
          {req?.notes && <p className="mt-2 text-xs text-zinc-500">{req.notes}</p>}
          {req && (
            <p className="mt-1 text-xs text-zinc-500">
              {t("college.cycleSuffix", { cycle: req.cycle })}
              <Ref n={ref(req.source_id)} />
            </p>
          )}
        </Section>}
      </div>

      {isUS && <CollegeSupplementsSection slug={c.slug} offset={c.sources.length} t={t} />}

      {isUS && (
      <div className="grid gap-x-12 gap-y-12 lg:grid-cols-2">
        {/* Cost & aid */}
        <Section id="cost" title={cost ? t("college.costTitleYear", { year: cost.year }) : t("college.costTitle")}>
          {cost ? (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm tabular-nums">
                <Row k={cost.tuition_out_of_state_usd ? t("college.tuitionInState") : t("college.tuition")} v={fmtUsd(cost.tuition_usd)} />
                {cost.tuition_out_of_state_usd != null && <Row k={t("college.tuitionOut")} v={fmtUsd(cost.tuition_out_of_state_usd)} />}
                {cost.tuition_intl_usd != null && <Row k={t("college.tuitionIntl")} v={fmtUsd(cost.tuition_intl_usd)} />}
                {cost.required_fees_usd != null && <Row k={t("college.requiredFees")} v={fmtUsd(cost.required_fees_usd)} />}
                {cost.intl_extra_fees_usd != null && <Row k={t("college.intlFee")} v={fmtUsd(cost.intl_extra_fees_usd)} />}
                <Row k={t("college.housingFood")} v={fmtUsd(cost.room_board_usd)} />
                {cost.total_coa_usd != null && <Row k={t("college.totalCoa")} v={fmtUsd(cost.total_coa_usd)} />}
              </dl>
              <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm">
                <div className="font-medium">{t("college.forIntl")}</div>
                <div>{cost.intl_aid_policy ? INTL_AID[cost.intl_aid_policy] : t("college.aidNotVerified")}</div>
                {cost.intl_need_aid_awarded != null && (
                  <div className="text-xs text-zinc-500">
                    {t("college.intlAidReceived", { n: fmtInt(cost.intl_need_aid_awarded), avg: fmtUsd(cost.intl_avg_award_usd) })}
                  </div>
                )}
                <IntlFinanceNote slug={c.slug} offset={c.sources.length} t={t} />
              </div>
              {cost.notes && <p className="mt-2 text-xs text-zinc-500">{cost.notes}</p>}
              <p className="mt-1 text-xs text-zinc-500">
                {t("college.source")}
                <Ref n={ref(cost.source_id)} />
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">{t("college.notRecordedYet")}</p>
          )}
        </Section>

        {/* Tiers + majors */}
        <Section id="tiers" title={t("college.tiersTitle")}>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {lookups.categories
              .filter((cat) => cat.key !== "general")
              .map((cat) => {
                const catTier = c.institution_tiers.find((x) => x.category_key === cat.key);
                return (
                  <div key={cat.key} className="flex items-center gap-2 text-sm">
                    <TierBadge tier={catTier?.tier_code} size="sm" />
                    <span className={catTier ? "" : "text-zinc-400"}>{cat.label}</span>
                  </div>
                );
              })}
          </div>
          <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 text-sm">
            {c.major_admissions.map((m) => (
              <li key={m.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.program}</span>
                  {m.category_key && <Pill>{catLabel(m.category_key)}</Pill>}
                  {m.capped && <Pill tone="red">{t("college.capped")}</Pill>}
                </div>
                <div className="text-xs text-zinc-500">
                  {t("college.switchingIn", { model: ADMIT_MODEL[m.admit_model] ?? "", x: m.internal_transfer ? TRANSFER[m.internal_transfer] : "—" })}
                </div>
                {m.notes && <div className="text-xs text-zinc-500">{m.notes}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">{t("college.tiersNote")}</p>
        </Section>
      </div>
      )}

      {isUS && <CollegeOutcomes slug={c.slug} />}

      {/* Factors */}
      {c.admission_factors.length > 0 && (
        <Section id="factors" title={t("college.factorsTitle", { year: c.admission_factors[0].cds_year })}>
          <div className="grid gap-4 sm:grid-cols-4">
            {["very_important", "important", "considered", "not_considered"].map((imp) => (
              <div key={imp}>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">{IMPORTANCE[imp]}</div>
                <ul className="space-y-0.5 text-sm">
                  {c.admission_factors
                    .filter((f) => f.importance === imp)
                    .map((f) => (
                      <li key={f.factor}>{FACTOR[f.factor] ?? f.factor}</li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
          {c.admission_factors.some((f) => f.factor === "demonstrated_interest" && f.importance !== "not_considered") && (
            <p className="mt-3 text-sm">
              <Pill tone="blue">{t("college.tip")}</Pill> <span className="ml-1">{t("college.interestTip")}</span>
            </p>
          )}
        </Section>
      )}

      {/* Sources */}
      <Section id="sources" title={t("college.sourcesTitle")}>
        <ol className="space-y-1 text-sm">
          {c.sources.map((s, i) => (
            <li key={s.id} id={`src-${i + 1}`} className="flex gap-2">
              <span className="w-6 text-zinc-400">[{i + 1}]</span>
              <a className="text-blue-600 hover:underline" href={s.url} target="_blank" rel="noreferrer">
                {s.title ?? s.url}
              </a>
              <span className="text-xs text-zinc-500">{t("college.accessed", { date: fmtDate(s.accessed_on) })}</span>
            </li>
          ))}
          <SupplementSourceItems slug={c.slug} offset={c.sources.length} t={t} />
        </ol>
      </Section>

      <Link href="/colleges" className="inline-block text-sm font-semibold text-blue-700 hover:underline">
        {t("college.allColleges")}
      </Link>
      </div>
    </article>
  );
}

function fitInputFrom(c: CollegeDetail, cdsYear: string | undefined, testPolicy: string | null) {
  const stats = c.admission_stats.find((s) => s.cds_year === cdsYear);
  const s = (t: string) => c.test_score_percentiles.find((x) => x.cds_year === cdsYear && x.test === t);
  return {
    admit_rate: stats?.admit_rate ?? null,
    intl_admit_rate: stats?.intl_admit_rate ?? null,
    sat_p25: s("SAT_TOTAL")?.p25 ?? null,
    sat_p75: s("SAT_TOTAL")?.p75 ?? null,
    act_p25: s("ACT_COMPOSITE")?.p25 ?? null,
    act_p75: s("ACT_COMPOSITE")?.p75 ?? null,
    test_policy: testPolicy,
  };
}

function Ref({ n }: { n: number | undefined }) {
  if (!n) return null;
  return (
    <a href={`#src-${n}`} className="ml-0.5 align-super text-[10px] text-blue-600 hover:underline">
      [{n}]
    </a>
  );
}

function Section({ id, title, children }: { id?: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="min-w-0">
      <h2 className={`mb-4 ${SECTION_TITLE}`}>{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white px-4 py-3.5">
      <dt className="text-xs font-medium text-zinc-500">{label}</dt>
      <dd className={`mt-1 font-display text-xl font-bold tabular-nums sm:text-2xl ${value === "—" ? "text-zinc-400" : ""}`}>{value}</dd>
      {sub && <dd className="mt-0.5 text-xs text-zinc-500">{sub}</dd>}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <>
      <dt className="text-zinc-500">{k}</dt>
      <dd>{v}</dd>
    </>
  );
}
