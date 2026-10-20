import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Pill, TierBadge } from "@/components/badges";
import { CollegeActions } from "@/components/CollegeActions";
import { getCollege, getLookups } from "@/lib/data";
import {
  ADMIT_MODEL,
  ENGLISH_POLICY,
  ENGLISH_STATUS,
  FACTOR,
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
import type { CollegeDetail } from "@/lib/types";

export default function CollegePage({ params }: PageProps<"/colleges/[slug]">) {
  return (
    <Suspense fallback={<div className="h-[70vh] animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-900" />}>
      <College params={params} />
    </Suspense>
  );
}

async function College({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [c, lookups] = await Promise.all([getCollege(slug), getLookups()]);
  if (!c) notFound();

  // Number sources in the order they appear so every fact can cite one.
  const srcNum = new Map(c.sources.map((s, i) => [s.id, i + 1]));
  const ref = (id: string | null | undefined) => (id ? srcNum.get(id) : undefined);
  const stats = [...c.admission_stats].sort((a, b) => (a.source_note === null ? -1 : 1) - (b.source_note === null ? -1 : 1) || b.cds_year.localeCompare(a.cds_year))[0];
  const scores = c.test_score_percentiles.filter((s) => s.cds_year === stats?.cds_year);
  const score = (t: string) => scores.find((s) => s.test === t);
  const policy = [...c.test_policies].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const req = [...c.application_requirements].sort((a, b) => b.cycle.localeCompare(a.cycle))[0];
  const cost = [...c.cost_aid].sort((a, b) => b.year.localeCompare(a.year))[0];
  const deadlines = [...c.deadlines].sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const gpaEst = estimateGpaPercentiles(stats?.gpa_distribution);
  const general = c.institution_tiers.find((t) => t.category_key === "general")?.tier_code;
  const catLabel = (k: string | null) => lookups.categories.find((x) => x.key === k)?.label ?? k ?? "";
  const planLabel = (k: string | null) => lookups.plans.find((p) => p.key === k)?.label ?? k ?? "";
  const testName = (k: string) => lookups.englishTests.find((t) => t.key === k)?.name ?? k;

  return (
    <article className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <TierBadge tier={general} />
          <div>
            <h1 className="text-2xl font-semibold">{c.name}</h1>
            <p className="text-sm text-zinc-500">
              {c.city}, {c.state_region} · {c.control === "public" ? "Public" : "Private"} · {c.setting} · {c.academic_calendar} calendar
            </p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm">
              {c.website && (
                <a className="text-blue-600 hover:underline dark:text-blue-400" href={c.website} target="_blank" rel="noreferrer">
                  Website ↗
                </a>
              )}
              {c.admissions_url && (
                <a className="text-blue-600 hover:underline dark:text-blue-400" href={c.admissions_url} target="_blank" rel="noreferrer">
                  Admissions ↗
                </a>
              )}
            </div>
          </div>
        </div>
        <CollegeActions slug={c.slug} fitInput={fitInputFrom(c, stats?.cds_year, policy?.policy ?? null)} />
      </header>

      {/* Key numbers */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Admit rate" value={fmtPct(stats?.admit_rate)} sub={stats ? `${fmtInt(stats.admits)} of ${fmtInt(stats.applicants)}` : undefined} />
        <Stat label="ED admit rate" value={fmtPct(stats?.ed_admit_rate)} sub={stats?.ed_applicants ? `${fmtInt(stats.ed_admits)} of ${fmtInt(stats.ed_applicants)}` : "not reported"} />
        <Stat label="International admit rate" value={fmtPct(stats?.intl_admit_rate)} sub={stats?.intl_applicants ? `${fmtInt(stats.intl_admits)} of ${fmtInt(stats.intl_applicants)}` : "not reported"} />
        <Stat label="Undergraduates" value={fmtInt(c.undergrad_enrollment)} sub={c.pct_international_ug != null ? `${fmtPct(c.pct_international_ug)} international` : undefined} />
        <Stat label="Student : faculty" value={c.student_faculty_ratio ? `${Number(c.student_faculty_ratio)} : 1` : "—"} />
        <Stat
          label="Waitlist"
          value={stats?.waitlist_admitted != null ? `${fmtInt(stats.waitlist_admitted)} admitted` : "—"}
          sub={stats?.waitlist_offered ? `of ${fmtInt(stats.waitlist_offered)} offered` : undefined}
        />
      </section>
      {stats && (
        <p className="-mt-5 text-xs text-zinc-500">
          {stats.source_note ? "Admissions-site figures" : `Common Data Set ${stats.cds_year}`}
          <Ref n={ref(stats.source_id)} />
          {stats.notes && <> · {stats.notes}</>}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Testing */}
        <Section title="Test scores (enrolled first-years)">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {policy && (
              <>
                <Pill tone={policy.policy === "required" ? "red" : "blue"}>{TEST_POLICY[policy.policy] ?? policy.policy}</Pill>
                <span className="text-zinc-500">
                  for {policy.cycle} applicants
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
                  <th className="py-1">Test</th>
                  <th className="py-1 text-right">25th</th>
                  <th className="py-1 text-right">50th</th>
                  <th className="py-1 text-right">75th</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {[
                  ["SAT_TOTAL", "SAT total"],
                  ["SAT_ERW", "SAT reading & writing"],
                  ["SAT_MATH", "SAT math"],
                  ["ACT_COMPOSITE", "ACT composite"],
                  ["ACT_MATH", "ACT math"],
                  ["ACT_ENGLISH", "ACT English"],
                ].map(([k, label]) => {
                  const s = score(k);
                  if (!s) return null;
                  return (
                    <tr key={k} className="border-t border-zinc-100 dark:border-zinc-800">
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
            <p className="text-sm text-zinc-500">{policy?.policy === "blind" ? "Test-blind — no SAT/ACT data is used or reported." : "No score percentiles reported."}</p>
          )}
          {stats && (stats.pct_submit_sat != null || stats.pct_submit_act != null) && (
            <p className="mt-2 text-xs text-zinc-500">
              Submitted SAT: {fmtPct(stats.pct_submit_sat, 0)} · Submitted ACT: {fmtPct(stats.pct_submit_act, 0)} of enrolled first-years
            </p>
          )}
        </Section>

        {/* GPA */}
        <Section title="High-school GPA">
          {stats?.gpa_avg != null || stats?.gpa_distribution ? (
            <>
              <div className="mb-3 flex flex-wrap gap-6 text-sm">
                <div>
                  <div className="text-xs text-zinc-500">Average (CDS C12)</div>
                  <div className="text-xl font-semibold tabular-nums">{stats?.gpa_avg != null ? Number(stats.gpa_avg).toFixed(2) : "—"}</div>
                </div>
                {gpaEst && (
                  <div>
                    <div className="text-xs text-zinc-500">Estimated 25th / 50th / 75th*</div>
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
                      <div className="h-3 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
                        <div className="h-3 rounded bg-blue-500" style={{ width: `${Math.min(100, stats.gpa_distribution![k])}%` }} />
                      </div>
                      <span className="w-12 text-right tabular-nums">{fmtPct(stats.gpa_distribution![k])}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-zinc-500">
                *The CDS does not publish GPA percentiles; estimated from the C11 band distribution. {fmtPct(stats?.pct_reporting_gpa, 0)} of
                enrolled students reported a GPA.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">This college does not report GPA in its Common Data Set.</p>
          )}
        </Section>
      </div>

      {/* Deadlines */}
      <Section title={`Deadlines (${deadlines[0]?.cycle ?? "current"} cycle)`}>
        {deadlines.length ? (
          <ol className="relative space-y-3 border-l border-zinc-200 pl-5 dark:border-zinc-800">
            {deadlines.map((d) => (
              <li key={d.id} className="text-sm">
                <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-blue-600 dark:border-zinc-950" />
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="w-28 font-medium tabular-nums">{fmtDate(d.due_date)}</span>
                  <span className="font-medium">{d.label ?? planLabel(d.plan_key)}</span>
                  {d.plan_key && d.label && <Pill>{d.plan_key}</Pill>}
                  {d.kind !== "application" && <Pill tone="green">{d.kind.replace("_", " ")}</Pill>}
                  <Ref n={ref(d.source_id)} />
                </div>
                {(d.notification_date || d.notification_note) && (
                  <div className="ml-28 pl-3 text-xs text-zinc-500">Decision: {d.notification_date ? fmtDate(d.notification_date) : d.notification_note}</div>
                )}
                {d.notes && <div className="ml-28 pl-3 text-xs text-zinc-500">{d.notes}</div>}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-zinc-500">No deadlines recorded yet.</p>
        )}
      </Section>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* English */}
        <Section title="English proficiency (international applicants)">
          {c.english_policies ? (
            <>
              <p className="mb-2 text-sm">
                <span className="font-medium">{ENGLISH_POLICY[c.english_policies.policy] ?? c.english_policies.policy}</span>
                <Ref n={ref(c.english_policies.source_id)} />
              </p>
              {c.english_policies.waiver_notes && <p className="mb-3 text-xs text-zinc-500">{c.english_policies.waiver_notes}</p>}
            </>
          ) : (
            <p className="text-sm text-zinc-500">Not recorded.</p>
          )}
          {c.english_requirements.length > 0 && (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-zinc-500">
                <tr>
                  <th className="py-1">Test</th>
                  <th className="py-1 pl-3 text-right">Minimum</th>
                  <th className="py-1 pl-3 text-right">Recommended</th>
                  <th className="py-1 pl-3">Notes</th>
                </tr>
              </thead>
              <tbody>
                {c.english_requirements.map((e) => (
                  <tr key={e.test_key} className="border-t border-zinc-100 align-top dark:border-zinc-800">
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
                          Subscores:{" "}
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
          <p className="mt-2 text-xs text-zinc-500">TOEFL iBT moved to a 1–6 scale on Jan 21, 2026; schools list both scales.</p>
        </Section>

        {/* Requirements */}
        <Section title="Application requirements">
          {req ? (
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
              <Row k="Platform" v={req.platforms.map((p) => PLATFORM[p] ?? p).join(", ") || "—"} />
              <Row k="Application fee" v={req.app_fee_usd != null ? `${fmtUsd(req.app_fee_usd)}${req.fee_waiver ? " (waiver available)" : ""}` : req.fee_waiver ? "Fee waiver available" : "—"} />
              <Row k="Essays" v={req.supplemental_essays ?? "—"} />
              <Row k="Recommendations" v={req.teacher_recs != null ? `${req.teacher_recs} teacher${req.counselor_rec ? " + counselor" : ""}` : "—"} />
              <Row k="Interview" v={req.interview ? INTERVIEW[req.interview] : "—"} />
              <Row k="Portfolio" v={req.portfolio ?? "—"} />
              {req.midyear_report != null && <Row k="Midyear report" v={req.midyear_report ? "Required" : "Not required"} />}
              {(req.css_profile_required || req.fafsa_required) && (
                <Row k="Aid forms" v={[req.css_profile_required && "CSS Profile", req.fafsa_required && "FAFSA"].filter(Boolean).join(" + ")} />
              )}
            </dl>
          ) : (
            <p className="text-sm text-zinc-500">Not recorded yet.</p>
          )}
          {req?.notes && <p className="mt-2 text-xs text-zinc-500">{req.notes}</p>}
          {req && (
            <p className="mt-1 text-xs text-zinc-500">
              {req.cycle} cycle
              <Ref n={ref(req.source_id)} />
            </p>
          )}
        </Section>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Cost & aid */}
        <Section title={`Cost & aid${cost ? ` (${cost.year})` : ""}`}>
          {cost ? (
            <>
              <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm tabular-nums">
                <Row k={cost.tuition_out_of_state_usd ? "Tuition (in-state)" : "Tuition"} v={fmtUsd(cost.tuition_usd)} />
                {cost.tuition_out_of_state_usd != null && <Row k="Tuition (out-of-state)" v={fmtUsd(cost.tuition_out_of_state_usd)} />}
                {cost.tuition_intl_usd != null && <Row k="Tuition (international)" v={fmtUsd(cost.tuition_intl_usd)} />}
                {cost.required_fees_usd != null && <Row k="Required fees" v={fmtUsd(cost.required_fees_usd)} />}
                {cost.intl_extra_fees_usd != null && <Row k="International fee" v={fmtUsd(cost.intl_extra_fees_usd)} />}
                <Row k="Housing & food" v={fmtUsd(cost.room_board_usd)} />
                {cost.total_coa_usd != null && <Row k="Total cost of attendance" v={fmtUsd(cost.total_coa_usd)} />}
              </dl>
              <div className="mt-4 rounded-lg bg-zinc-50 p-3 text-sm dark:bg-zinc-900">
                <div className="font-medium">For international students</div>
                <div>{cost.intl_aid_policy ? INTL_AID[cost.intl_aid_policy] : "Aid policy not verified yet"}</div>
                {cost.intl_need_aid_awarded != null && (
                  <div className="text-xs text-zinc-500">
                    {fmtInt(cost.intl_need_aid_awarded)} international students received aid, average {fmtUsd(cost.intl_avg_award_usd)} (CDS H6)
                  </div>
                )}
              </div>
              {cost.notes && <p className="mt-2 text-xs text-zinc-500">{cost.notes}</p>}
              <p className="mt-1 text-xs text-zinc-500">
                Source
                <Ref n={ref(cost.source_id)} />
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Not recorded yet.</p>
          )}
        </Section>

        {/* Tiers + majors */}
        <Section title="Subject tiers & how majors are admitted">
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {lookups.categories
              .filter((cat) => cat.key !== "general")
              .map((cat) => {
                const t = c.institution_tiers.find((x) => x.category_key === cat.key);
                return (
                  <div key={cat.key} className="flex items-center gap-2 text-sm">
                    <TierBadge tier={t?.tier_code} size="sm" />
                    <span className={t ? "" : "text-zinc-400"}>{cat.label}</span>
                  </div>
                );
              })}
          </div>
          <ul className="space-y-2 text-sm">
            {c.major_admissions.map((m) => (
              <li key={m.id} className="rounded-md border border-zinc-200 p-2 dark:border-zinc-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{m.program}</span>
                  {m.category_key && <Pill>{catLabel(m.category_key)}</Pill>}
                  {m.capped && <Pill tone="red">Capped</Pill>}
                </div>
                <div className="text-xs text-zinc-500">
                  {ADMIT_MODEL[m.admit_model]} · Switching in later: {m.internal_transfer ? TRANSFER[m.internal_transfer] : "—"}
                </div>
                {m.notes && <div className="text-xs text-zinc-500">{m.notes}</div>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-zinc-500">Tiers and major-admission summaries are an editorial v0 — review before relying on them.</p>
        </Section>
      </div>

      {/* Factors */}
      {c.admission_factors.length > 0 && (
        <Section title={`What the admissions office weighs (CDS C7, ${c.admission_factors[0].cds_year})`}>
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
              <Pill tone="blue">Tip</Pill> <span className="ml-1">Demonstrated interest counts here — visit, attend info sessions, and open their emails.</span>
            </p>
          )}
        </Section>
      )}

      {/* Sources */}
      <Section title="Sources">
        <ol className="space-y-1 text-sm">
          {c.sources.map((s, i) => (
            <li key={s.id} id={`src-${i + 1}`} className="flex gap-2">
              <span className="w-6 text-zinc-400">[{i + 1}]</span>
              <a className="text-blue-600 hover:underline dark:text-blue-400" href={s.url} target="_blank" rel="noreferrer">
                {s.title ?? s.url}
              </a>
              <span className="text-xs text-zinc-500">accessed {fmtDate(s.accessed_on)}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Link href="/" className="inline-block text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← All colleges
      </Link>
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
    <a href={`#src-${n}`} className="ml-0.5 align-super text-[10px] text-blue-600 hover:underline dark:text-blue-400">
      [{n}]
    </a>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
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
