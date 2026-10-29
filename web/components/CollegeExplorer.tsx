"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { englishFit, hasEnglishScore } from "@/lib/english-fit";
import {
  admitRateFor,
  DUE_WINDOWS,
  dueWithin,
  effectiveFilters,
  filtersToQuery,
  FITS,
  medianFor,
  dueGroups,
  nextDue,
  nextSort,
  onlyNarrowAhead,
  parseFilters,
  rowMatches,
  sortRows,
  tierFor,
  type DeadlineRow,
  type DueWindow,
  type ExploreFilters,
  type ExploreRow,
  type FilterContext,
  type NextDue,
  type SortKey,
} from "@/lib/explore-filters";
import { scoreField, type FieldEvidence } from "@/lib/field-match";
import { computeFit } from "@/lib/fit";
import { ENGLISH_POLICY, fmtDate, fmtPct, TEST_POLICY } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n/client";
import { fitLabel, fitReasonText } from "@/lib/i18n/fit-text";
import { activeRegions, isRegion, REGIONS, type RegionCode } from "@/lib/regions";
import { cardSideFor } from "@/lib/region-geo";
import { useStudent } from "@/lib/student-store";
import { scoredTests, testsToCompare } from "@/lib/test-plan";
import { BASE_TIERS, tierLetter } from "@/lib/tiers";
import { currencyFor, estimatedTuition, type ProgramFees } from "@/lib/tuition";
import type { ApplyTag } from "@/lib/apply-tags";
import type { CollegeSummary, EnglishSummary, Lookups, SatEstimate } from "@/lib/types";
import { buttonClass, FIT_DOT_COLOR, fitDotClass, SEGMENT_TRACK, segmentClass, TIER_DOT } from "@/lib/ui";
import { CollegeBrowser, DayHead, DueChip, dueText, PlanChip } from "./CollegeBrowser";
import { EnglishFitLine } from "./EnglishFit";
import { ExploreFilterBar } from "./ExploreFilterBar";
import { ApplyTags, FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";
import { USMap3D, type MapDot, type MapHandle } from "./USMap3D";

// Lookup labels live in lib/format.ts (English, shared with tests); translate them here by stored value.
const policyLabel = (t: TFunction, group: "testPolicy" | "englishPolicy", map: Record<string, string>, k: string) =>
  k in map ? t(`colleges.${group}.${k}` as MessageKey) : k;

// Tailwind's lg breakpoint: from here the card floats over the map; below it, it sits under the map.
const LG = "(min-width: 1024px)";
const onLgChange = (cb: () => void) => {
  const m = window.matchMedia(LG);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useWide = () => useSyncExternalStore(onLgChange, () => window.matchMedia(LG).matches, () => false);

// The reader's calendar date (yyyy-mm-dd, local time): deadlines count from the reader's today, not the server's.
const noSubscribe = () => () => {};
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Eases a number from 0 up to `value` so stats feel like they land rather than appear.
function useCountUp(value: number | null, ms = 800) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (value == null) return;
    let raf = 0;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      raf = requestAnimationFrame(() => setN(value));
      return () => cancelAnimationFrame(raf);
    }
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      setN(value * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms]);
  return value == null ? null : n;
}

function AdmitRing({ rate, label }: { rate: number | null; label: string }) {
  const t = useT();
  const shown = useCountUp(rate);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const R = 34;
  const C = 2 * Math.PI * R;
  const pct = rate == null ? 0 : Math.min(100, Math.max(0, rate));
  return (
    <div className="flex items-center gap-4">
      <svg width={80} height={80} viewBox="0 0 80 80" role="img" aria-label={`${label}: ${rate == null ? t("colleges.notReported") : `${rate}%`}`}>
        <circle cx={40} cy={40} r={R} fill="none" stroke="#e9f2fa" strokeWidth={6} />
        <circle
          cx={40}
          cy={40}
          r={R}
          fill="none"
          stroke="#0b86c6"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={on ? C * (1 - Math.max(pct, 1.5) / 100) : C}
          transform="rotate(-90 40 40)"
          style={{ transition: "stroke-dashoffset 1100ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <text x={40} y={46} textAnchor="middle" fontSize={19} fontWeight={700} fill="#12304a" style={{ fontVariantNumeric: "tabular-nums" }}>
          {shown == null ? "—" : `${shown.toFixed(rate != null && rate < 10 ? 1 : 0)}%`}
        </text>
      </svg>
      <div>
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-sm text-zinc-600">{t("colleges.ofApplicants")}</p>
      </div>
    </div>
  );
}

function SatBar({ p25, p50, p75, estimated, you }: { p25: number; p50: number | null; p75: number; estimated: boolean; you: number | null }) {
  const t = useT();
  const pos = (v: number) => `${Math.min(100, Math.max(0, ((v - 400) / 1200) * 100))}%`;
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-semibold text-ink">{p50 != null ? t("colleges.satMedian") : t("colleges.satMiddle")}</p>
        <p className="font-display text-lg font-bold tabular-nums">
          {estimated && "≈ "}
          {p50 ?? "—"}
        </p>
      </div>
      <div className={`relative h-2.5 rounded-full bg-zinc-100 ${you != null ? "mt-7" : "mt-3"}`}>
        <div
          className="absolute inset-y-0 rounded-full bg-blue-300"
          style={{ left: pos(p25), width: on ? `calc(${pos(p75)} - ${pos(p25)})` : 0, transition: "width 900ms cubic-bezier(.2,.8,.2,1) 150ms" }}
        />
        {p50 != null && <span className="absolute -top-1 h-[18px] w-1 -translate-x-1/2 rounded bg-ink" style={{ left: pos(p50) }} />}
        {you != null && (
          <span className="absolute -top-6 -translate-x-1/2 text-center text-[13px] font-bold leading-none text-ink" style={{ left: pos(you) }}>
            {t("colleges.you")}
            <span className="mx-auto mt-0.5 block h-3 w-3 translate-y-[5px] rounded-full border-2 border-white bg-coral" />
          </span>
        )}
      </div>
      {/* Scale ends sit under the bar's ends; the range gets its own line, so a long "(section scores added)" never runs into them. */}
      <p className="mt-1 flex justify-between text-[13px] tabular-nums text-zinc-500" aria-hidden="true">
        <span>400</span>
        <span>1600</span>
      </p>
      <p className="mt-1 text-[13px] tabular-nums text-zinc-600">
        {t("colleges.middle50")}
        {estimated && "≈ "}
        {p25}–{p75}
        {estimated && t("colleges.sectionAdded")}
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-zinc-100 py-2.5 text-sm first:border-t-0">
      <span className="shrink-0 text-zinc-600">{label}</span>
      <span className="text-right font-semibold text-ink">{children}</span>
    </div>
  );
}

function englishText(t: TFunction, e: EnglishSummary | undefined) {
  if (!e) return { mins: "—", note: null as string | null };
  const mins = [
    e.toefl != null && `TOEFL ${e.toefl}${e.toefl2026 != null ? ` (${t("colleges.toeflNew", { n: e.toefl2026 })})` : ""}`,
    e.ielts != null && `IELTS ${e.ielts}`,
    e.duolingo != null && `Duolingo ${e.duolingo}`,
  ].filter(Boolean);
  return { mins: mins.length ? mins.join(" · ") : t("colleges.noMinimum"), note: e.policy ? policyLabel(t, "englishPolicy", ENGLISH_POLICY, e.policy) : null };
}

function DetailCard({
  college,
  english,
  sat,
  tags,
  side,
  due,
  onClose,
}: {
  college: CollegeSummary;
  english: EnglishSummary | undefined;
  sat: SatEstimate | undefined;
  tags: ApplyTag[] | undefined;
  side: "left" | "right";
  /** The next application deadline from today (plan, date, days left), when the college has one on file. */
  due: NextDue | null;
  onClose: () => void;
}) {
  const t = useT();
  const student = useStudent();
  // Days left need the reader's own date, so they wait for hydration (a card opened from a shared ?c= link renders on the server).
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  const inList = student.has(college.slug);
  const hasScores = scoredTests(student.profile).length > 0;
  const isUS = (college.country_code ?? "US") === "US";
  // Fit labels are built on SAT/ACT and US admit rates, so they only apply to US colleges for now.
  const fit = hasScores && isUS ? computeFit(student.profile, college) : null;
  const intl = !!student.profile.international && college.intl_admit_rate != null;
  const eng = englishText(t, english);

  const satRange =
    college.sat_p25 != null && college.sat_p75 != null
      ? { p25: college.sat_p25, p50: college.sat_p50, p75: college.sat_p75, estimated: false }
      : sat
        ? { p25: sat.p25, p50: sat.p50, p75: sat.p75, estimated: true }
        : null;

  return (
    // On wide screens the card floats over the map, so there (only) it carries a shadow.
    <article
      className="card-in pointer-events-auto max-h-full w-full overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-5 lg:shadow-[0_18px_44px_-18px_rgb(18_48_74/0.4)]"
      style={{ "--from": side === "right" ? "28px" : "-28px" } as React.CSSProperties}
      aria-labelledby={`card-${college.slug}`}
    >
      <header className="flex items-start gap-3">
        <SchoolLogo slug={college.slug} name={college.short_name ?? college.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h2 id={`card-${college.slug}`} className="min-w-0 text-xl font-bold leading-tight text-ink">
              {college.name}
            </h2>
            <span className="mt-px shrink-0">
              <TierBadge tier={college.general_tier} />
            </span>
          </div>
          <p className="mt-1 text-sm text-zinc-600">
            {[college.city, college.state_region].filter(Boolean).join(", ")}
            {college.control && <> · <span className="capitalize">{college.control.replace(/_/g, " ")}</span></>}
          </p>
          <ApplyTags tags={tags} className="mt-2" size="md" />
        </div>
        <button type="button" onClick={onClose} aria-label={t("colleges.closeDetails")} className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-xl leading-none text-zinc-600 hover:bg-zinc-100 hover:text-ink">
          ×
        </button>
      </header>

      <div className="mt-5 space-y-5">
        {(isUS || college.admit_rate != null) && (
          <AdmitRing rate={intl ? college.intl_admit_rate : college.admit_rate} label={intl ? t("colleges.intlAdmitRate") : t("colleges.admitRate")} />
        )}
        {!isUS ? (
          <p className="text-sm text-zinc-600">{t("colleges.ukAdmission")}</p>
        ) : satRange ? (
          <SatBar {...satRange} you={student.profile.sat ?? null} />
        ) : (
          <p className="text-sm text-zinc-600">{t("colleges.noSat")}</p>
        )}
      </div>

      <div className="mt-4">
        {isUS && <Row label={t("colleges.testing")}>{college.test_policy ? policyLabel(t, "testPolicy", TEST_POLICY, college.test_policy) : "—"}</Row>}
        <Row label={t("colleges.englishTest")}>
          {eng.mins}
          {eng.note && <span className="block text-[13px] font-normal text-zinc-600">{eng.note}</span>}
          <EnglishFitLine english={english} className="mt-1 justify-end text-right" />
        </Row>
        <Row label={t("colleges.nextDeadline")}>
          {due ? <DueChip due={due} withDays={hydrated} /> : <span className="tabular-nums">{college.next_deadline ? fmtDate(college.next_deadline) : "—"}</span>}
        </Row>
        {isUS && (
          <Row label={t("colleges.yourFit")}>
            {fit ? (
              <>
                <FitBadge fit={fit.fit} size="md" />
                <span className="mt-1 block text-[13px] font-normal text-zinc-600">{fitReasonText(t, fit)}</span>
              </>
            ) : (
              <Link href="/start" className="font-semibold text-blue-700 underline underline-offset-4">
                {t("colleges.addYourScores")}
              </Link>
            )}
          </Row>
        )}
      </div>

      {/* Labels never break inside a word (a long Chinese label wraps the row instead). */}
      <div className="mt-4 flex flex-wrap gap-2 whitespace-nowrap">
        {!inList && !student.canAdd ? (
          <Link href="/pricing" className={`flex-1 ${buttonClass("secondary")}`}>
            {t("colleges.listFullUpgrade")}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => (inList ? student.remove(college.slug) : student.add({ slug: college.slug, id: college.id }))}
            className={`flex-1 ${buttonClass(inList ? "secondary" : "primary")}`}
          >
            {inList ? t("colleges.inMyList") : t("colleges.addToMyList")}
          </button>
        )}
        {!inList && (
          <button
            type="button"
            onClick={() => student.toggleInterested(college.slug)}
            aria-label={student.isInterested(college.slug) ? t("colleges.removeInterested") : t("colleges.addInterested")}
            aria-pressed={student.isInterested(college.slug)}
            title={student.isInterested(college.slug) ? t("colleges.interestedOnTitle") : t("colleges.interestedOffTitle")}
            className={buttonClass("secondary", "md", student.isInterested(college.slug))}
          >
            {student.isInterested(college.slug) ? "★" : "☆"}
          </button>
        )}
        <Link href={`/colleges/${college.slug}`} className={buttonClass("secondary")}>
          {t("colleges.fullDetails")}
        </Link>
      </div>
    </article>
  );
}

export function CollegeExplorer({
  colleges,
  lookups,
  english,
  satEstimates,
  programFees,
  evidence,
  applyTags,
  appDeadlines,
  serverToday,
}: {
  colleges: CollegeSummary[];
  lookups: Lookups;
  english: Record<string, EnglishSummary>;
  satEstimates: Record<string, SatEstimate>;
  programFees: Record<string, ProgramFees>;
  evidence: Record<string, FieldEvidence>;
  /** By slug, only colleges that have one (lib/apply-tags.ts). */
  applyTags: Record<string, ApplyTag[]>;
  /** By institution id: published application deadlines for a plan, as [date, plan, narrow] rows (app/(explore)/colleges/page.tsx). */
  appDeadlines: Record<string, DeadlineRow[]>;
  /**
   * The server's UTC date, used only for the HTML sent before hydration (which windows hold which colleges can differ from the
   * reader's for a few hours around midnight). Days-left words are left out of that HTML, so no "3 days" changes on hydration.
   */
  serverToday: string;
}) {
  const t = useT();
  const locale = useLocale();
  const student = useStudent();
  const today = useSyncExternalStore(noSubscribe, localToday, () => serverToday);
  const hydrated = useSyncExternalStore(noSubscribe, () => true, () => false);
  // Each college's next application deadline from the reader's today: real published dates only (lib/explore-filters.ts nextDue).
  const dueById = useMemo(() => {
    const m = new Map<string, NextDue>();
    for (const c of colleges) {
      const d = nextDue(appDeadlines[c.id], today);
      if (d) m.set(c.id, d);
    }
    return m;
  }, [colleges, appDeadlines, today]);
  const dueOf = (r: ExploreRow) => dueById.get(r.c.id) ?? null;
  const profile = student.profile;
  const searchParams = useSearchParams();
  // The URL is the starting point (a shared or bookmarked view); after that React state leads and is mirrored back into
  // the URL with replaceState, so typing in the search box never fights the router. The open college is part of it (?c=):
  // a shared card opens in its own country (written back as region=, whatever the reader's default country), and a slug
  // that is no college here is dropped rather than left in the URL.
  const [f, setF] = useState<ExploreFilters>(() => {
    const p = parseFilters(searchParams);
    const open = p.college ? colleges.find((c) => c.slug === p.college) : undefined;
    if (p.college && !open) p.college = null;
    const country = open?.country_code ?? "US";
    if (open && isRegion(country)) p.region = country;
    return p;
  });
  useEffect(() => {
    const q = filtersToQuery(f);
    const next = `${window.location.pathname}${q ? `?${q}` : ""}`;
    if (next !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(window.history.state, "", next);
  }, [f]);
  const set = (patch: Partial<ExploreFilters>) => setF((cur) => ({ ...cur, ...patch }));
  const selected = f.college;
  // The map's handle for lighting up a dot while its list row is hovered (no React state: hovering never re-renders the list).
  const mapApi = useRef<MapHandle | null>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Only the regions the student is applying to are offered (all of them while none is chosen), plus one a shared link names.
  // Until the reader picks one, follow their first target region (it can arrive after sign-in loads).
  const targets = profile.targetRegions;
  const offered = useMemo(() => {
    const base = activeRegions(targets);
    return f.region && !base.includes(f.region) ? [...base, f.region] : base;
  }, [targets, f.region]);
  const region: RegionCode = f.region && offered.includes(f.region) ? f.region : offered[0];
  const isUS = region === "US";
  // Opening a card also pins its country in the URL, so the shared link opens the same card for a reader in another country.
  const setSelected = (slug: string | null) => set(slug ? { college: slug, region } : { college: null });
  const inRegion = useMemo(() => colleges.filter((c) => (c.country_code ?? "US") === region), [colleges, region]);
  const regionCounts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const c of colleges) n[c.country_code ?? "US"] = (n[c.country_code ?? "US"] ?? 0) + 1;
    return n;
  }, [colleges]);

  const hasScores = scoredTests(profile).length > 0;
  const international = !!profile.international;
  const myEnglish = profile.tests?.english;
  const hasEnglish = hasEnglishScore(myEnglish);
  const tests = testsToCompare(profile);
  const myScores = { sat: scoredTests(profile).includes("sat") ? (profile.sat ?? undefined) : undefined, act: scoredTests(profile).includes("act") ? (profile.act ?? undefined) : undefined };
  const currency = currencyFor(region);

  // Everything a row shows or is filtered on, computed once per college. Its next deadline is the lens's (an application plan's,
  // from today), so the list, the table column, the card and the deadline sort all name the same date; a college with no plan
  // deadline on file keeps the summary's.
  const enriched = useMemo<ExploreRow[]>(
    () =>
      inRegion.map((raw) => {
        const due = dueById.get(raw.id);
        // A college with only narrow dates ahead (one program's, another intake's) has no single next deadline: show none.
        const next = due ? due.date : onlyNarrowAhead(appDeadlines[raw.id], today) ? null : raw.next_deadline;
        const c = next !== raw.next_deadline ? { ...raw, next_deadline: next } : raw;
        return {
        c,
        fit: hasScores && isUS ? computeFit(profile, c) : null,
        english: englishFit(myEnglish, english[c.id]),
        tuition: estimatedTuition(c, international, programFees[c.id]),
        sat: medianFor(c, "sat", satEstimates[c.id]),
        act: medianFor(c, "act"),
        admit: admitRateFor(c, international),
        };
      }),
    [inRegion, dueById, appDeadlines, today, hasScores, isUS, profile, myEnglish, english, international, programFees, satEstimates],
  );

  const ctx: FilterContext = { evidence, currency, isUS, hasScores, hasEnglish, applyTags };
  const eff = effectiveFilters(f, ctx);
  // The open college is not a filter: leaving it out keeps the rows (and how many are shown) when one is picked.
  const effKey = filtersToQuery({ ...eff, view: "map", region: null, college: null });
  const rows = useMemo(
    () => sortRows(enriched.filter((r) => rowMatches(r, eff, ctx)), eff.sort, eff.category),
    // eff/ctx are rebuilt each render; effKey (their query string) captures every value that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enriched, effKey, evidence, applyTags],
  );
  const fieldHidden = useMemo(
    () => (eff.field ? inRegion.filter((c) => scoreField(c, evidence[c.slug], eff.field!).status === "no_data").length : 0),
    [inRegion, evidence, eff.field],
  );

  const states = useMemo(() => [...new Set(inRegion.map((c) => c.state_region).filter(Boolean))].sort() as string[], [inRegion]);
  const planKeys = useMemo(() => [...new Set(inRegion.flatMap((c) => c.plans ?? []))].sort(), [inRegion]);

  // The "when" lens. Counts for each window come from the rows the other filters leave (so they always match what a click shows);
  // with a window on, the list and the table narrow to it, earliest deadline first (ties keep the chosen sort), and the map keeps
  // every college but lights the ones in the window and fades the rest.
  const lens = eff.due;
  const lensCounts = useMemo(
    () => Object.fromEntries(DUE_WINDOWS.map((w) => [w, rows.filter((r) => dueWithin(dueById.get(r.c.id) ?? null, w)).length])) as Record<DueWindow, number>,
    [rows, dueById],
  );
  const listRows = useMemo(
    () => (lens ? rows.filter((r) => dueWithin(dueById.get(r.c.id) ?? null, lens)).sort((a, b) => dueById.get(a.c.id)!.date.localeCompare(dueById.get(b.c.id)!.date)) : rows),
    [rows, dueById, lens],
  );
  // The lens list as a printed timetable: a heading for each deadline day, on that day's first row.
  const groups = useMemo(() => dueGroups(lens ? listRows : [], (r) => r.c.slug, (r) => dueById.get(r.c.id) ?? null), [listRows, lens, dueById]);
  // It counts colleges (each by its one next deadline), so the line says colleges.
  const lensSentence = lens
    ? listRows.length === 0
      ? t("colleges.lensNone", { days: lens })
      : listRows.length === 1
        ? t("colleges.lensSentenceOne", { days: lens })
        : t("colleges.lensSentence", { n: listRows.length, days: lens })
    : null;

  const selIndex = selected ? listRows.findIndex((r) => r.c.slug === selected) : -1;
  const shown = useVisibleCount(`${region}|${effKey}`, listRows.length, selIndex);

  // The map colours each college by its fit once the student has scores (US only), else by its tier; the legend counts the rows shown.
  const byFit = hasScores && isUS;
  const pins = useMemo<MapDot[]>(
    () =>
      rows.map(({ c, fit }) => {
        const tier = c.general_tier;
        const tone = byFit && fit ? FIT_DOT_COLOR[fit.fit] : TIER_DOT[byFit || !tier ? "none" : tierLetter(tier)];
        const base = byFit ? (fit ? fitLabel(t, fit.fit) : t("colleges.legendNoFit")) : tier ? t("status.tier", { tier }) : null;
        const due = dueById.get(c.id) ?? null;
        const lit = lens != null && dueWithin(due, lens);
        // A lit college's hover label carries its line of the timetable too.
        const note = lit && due ? [base, dueText(t, locale, due, hydrated)].filter(Boolean).join(" · ") : base;
        return { slug: c.slug, name: c.short_name ?? c.name, lat: c.latitude, lng: c.longitude, tier, tone, note, lit, dim: lens != null && !lit };
      }),
    [rows, byFit, t, locale, dueById, lens, hydrated],
  );
  const legend = useMemo(() => {
    // The key counts what is lit: every college shown, or with the lens on, the ones closing in its window.
    const keyRows = lens ? listRows : rows;
    if (byFit) {
      const n = (k: string | null) => keyRows.filter((r) => (r.fit?.fit ?? null) === k).length;
      return [
        ...FITS.map((k) => ({ key: k, label: fitLabel(t, k), cls: fitDotClass(k), n: n(k) })),
        { key: "none", label: t("colleges.legendNoFit"), cls: TIER_DOT.none.cls, n: n(null) },
      ].filter((i) => i.n > 0);
    }
    // The key lists only the colours on the map right now (a UK view has no C or D).
    const n = (k: string | null) => keyRows.filter((r) => (r.c.general_tier ? tierLetter(r.c.general_tier) : null) === k).length;
    return [
      ...BASE_TIERS.map((k) => ({ key: k, label: k, cls: TIER_DOT[k].cls, n: n(k) })),
      { key: "none", label: t("colleges.legendNoTier"), cls: TIER_DOT.none.cls, n: n(null) },
    ].filter((i) => i.n > 0);
  }, [rows, listRows, lens, byFit, t]);

  const current = enriched.find((r) => r.c.slug === selected)?.c ?? null;
  // Put the card on the side away from the pin so it never covers the college it describes.
  const side: "left" | "right" = current?.longitude != null ? cardSideFor(region, current.longitude) : "right";
  const wide = useWide();

  // A college picked on the map scrolls its row into view inside the list (never the page: on a phone the list sits under the map).
  useEffect(() => {
    const ul = listRef.current;
    if (!ul || !selected || ul.scrollHeight <= ul.clientHeight) return;
    const li = [...ul.children].find((el) => (el as HTMLElement).dataset.slug === selected) as HTMLElement | undefined;
    if (!li) return;
    if (li.offsetTop >= ul.scrollTop && li.offsetTop + li.offsetHeight <= ul.scrollTop + ul.clientHeight) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    ul.scrollTo({ top: li.offsetTop - (ul.clientHeight - li.offsetHeight) / 2, behavior: reduced ? "auto" : "smooth" });
  }, [selected]);

  const filterBar = (compact: boolean) => (
    <ExploreFilterBar
      // While a window is on the list is in date order, and the sort menu says so (locked until the window is turned off).
      f={lens ? { ...eff, sort: { key: "deadline", reverse: false } } : eff}
      sortLocked={lens != null}
      set={set}
      count={listRows.length}
      total={inRegion.length}
      fieldHidden={fieldHidden}
      isUS={isUS}
      hasScores={hasScores}
      hasEnglish={hasEnglish}
      international={international}
      currency={currency}
      studyFields={profile.studyFields}
      states={states}
      planKeys={planKeys}
      lookups={lookups}
      sortTests={tests}
      compact={compact}
    />
  );

  const regionSwitch = (
    <div className={SEGMENT_TRACK} role="group" aria-label={t("colleges.country")}>
      {REGIONS.filter((r) => offered.includes(r.code)).map((r) => (
        <button
          key={r.code}
          type="button"
          aria-pressed={region === r.code}
          onClick={() =>
            // Budgets are in each country's own currency and states differ, so those two filters reset. Either way the open
            // card closes: pressing the country you are in takes you back to its whole map.
            set(r.code !== region ? { region: r.code, maxTuition: null, state: "", college: null } : { college: null })
          }
          className={segmentClass(region === r.code)}
        >
          {t(`colleges.regionShort.${r.code}` as MessageKey)}
          <span className="font-normal tabular-nums text-zinc-600">{regionCounts[r.code] ?? 0}</span>
        </button>
      ))}
    </div>
  );

  const toggle = (
    <div className={SEGMENT_TRACK} role="group" aria-label={t("colleges.view")}>
      {(["map", "table"] as const).map((v) => (
        <button key={v} type="button" aria-pressed={f.view === v} onClick={() => set({ view: v })} className={segmentClass(f.view === v)}>
          {t(v === "map" ? "colleges.viewMap" : "colleges.viewTable")}
        </button>
      ))}
    </div>
  );

  // The "when" lens switch, each window with its live count (short labels on a phone, so the three fit one line). A window
  // with nothing in it (a UK view three months before UCAS closes) is disabled, its count saying why.
  const lensSwitch = (
    <div className={SEGMENT_TRACK} role="group" aria-label={t("colleges.lensGroup")}>
      {([null, ...DUE_WINDOWS] as const).map((w) => (
        <button
          key={w ?? "any"}
          type="button"
          aria-pressed={lens === w}
          disabled={w != null && lensCounts[w] === 0 && lens !== w}
          title={w != null && lensCounts[w] === 0 ? t("colleges.lensNone", { days: w }) : undefined}
          onClick={() => set({ due: w })}
          className={`${segmentClass(lens === w)} disabled:cursor-not-allowed disabled:text-zinc-400 disabled:hover:text-zinc-400`}
        >
          {w == null ? (
            t("colleges.lensAny")
          ) : (
            <>
              <span className="sm:hidden">{t(w === 7 ? "colleges.lens7Short" : "colleges.lens30Short")}</span>
              <span className="max-sm:hidden">{t(w === 7 ? "colleges.lens7" : "colleges.lens30")}</span>
              <span className="font-normal tabular-nums text-zinc-600 [button:disabled_&]:text-zinc-400">{lensCounts[w]}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );

  const stats = [
    myScores.sat != null && `SAT ${myScores.sat}`,
    myScores.act != null && `ACT ${myScores.act}`,
    profile.gpa != null && `GPA ${profile.gpa}`,
    international && t("colleges.statsIntl"),
  ].filter(Boolean);

  // `short`: the phone's version of the call to add scores, so it shares a row with "Recommend by field".
  const statsLink = (short = false) => (
    <Link href={stats.length ? "/profile" : "/start"} className="text-sm font-semibold text-zinc-600 hover:text-ink">
      {stats.length ? (
        <>
          {t("colleges.statsPrefix", { stats: stats.join(" · ") })}
          <span className="text-blue-700 underline underline-offset-4">{t("colleges.statsEdit")}</span>
        </>
      ) : (
        <span className="text-blue-700 underline-offset-4 hover:underline">{short ? `${t("colleges.addYourScores")} →` : t("colleges.addScoresCta")}</span>
      )}
    </Link>
  );

  // One title row for both views: the page's name, how to look at it, which country, and the way out to field matching. Wide:
  // one line. Tablet: the name and its links, then the two switches. Phone: the name and the view switch, the countries, then
  // the scores link sharing a line with "Recommend by field". On the map, from sm the scores link lives in the map's key instead.
  const titleRow = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="order-1 mr-1 font-display text-2xl font-bold tracking-tight text-ink">{t("colleges.heading")}</h1>
      <div className="order-2 sm:order-4 lg:order-2">{toggle}</div>
      <div className="order-3 min-w-0 sm:order-5 lg:order-3">{regionSwitch}</div>
      <div className="order-4 flex w-full items-center justify-between gap-x-4 gap-y-2 sm:order-2 sm:ml-auto sm:w-auto sm:justify-end lg:order-4">
        {(isUS || f.view === "table") && <span className={f.view === "table" ? "lg:hidden" : "sm:hidden"}>{statsLink(true)}</span>}
        {f.view === "table" && <span className="max-lg:hidden">{statsLink()}</span>}
        <Link href="/tools/match" className={buttonClass("ghost", "sm")}>
          {t("match.link")}
        </Link>
      </div>
      <span aria-hidden="true" className="order-3 hidden basis-full sm:block lg:hidden" />
    </div>
  );

  if (f.view === "table") {
    return (
      <div data-explorer className="space-y-4">
        {titleRow}
        {/* The "when" lens, as on the map: the switch and, when it is on, its line of the timetable. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {lensSwitch}
          {lensSentence && <p className="text-[15px] font-semibold text-ink">{lensSentence}</p>}
        </div>
        {filterBar(false)}
        <CollegeBrowser
          rows={listRows}
          dueFor={dueOf}
          lens={lens}
          groups={groups}
          hydrated={hydrated}
          resetKey={`${region}|${effKey}`}
          isUS={isUS}
          tests={tests}
          myScores={myScores}
          showEnglish={hasEnglish || international}
          hasScores={hasScores}
          sort={lens ? { key: "deadline", reverse: false } : eff.sort}
          onSort={(key: SortKey) => set({ sort: nextSort(eff.sort, key) })}
          tierFor={(r) => tierFor(r.c, eff.category)}
          applyTags={applyTags}
        />
      </div>
    );
  }

  const hover = (slug: string | null) => mapApi.current?.hover(slug);

  const card = current && (
    <DetailCard
      college={current}
      english={english[current.id]}
      sat={satEstimates[current.id]}
      tags={applyTags[current.slug]}
      side={side}
      due={dueById.get(current.id) ?? null}
      onClose={() => setSelected(null)}
    />
  );

  return (
    <div data-explorer className="space-y-3">
      {titleRow}
      <div className="grid gap-4 lg:h-[calc(100dvh-9.5rem)] lg:min-h-[540px] lg:grid-cols-[360px_1fr]">
        <aside className="order-last flex min-h-0 flex-col gap-3 lg:order-first">
          {filterBar(true)}
          <ul ref={listRef} className="relative -mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-1" onMouseLeave={() => hover(null)}>
            {inRegion.length === 0 && <li className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">{t("colleges.noneInRegion", { region: t(`colleges.region.${region}` as MessageKey) })}</li>}
            {inRegion.length > 0 && rows.length === 0 && (
              <li className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">{eff.q.trim() ? t("colleges.noMatch", { q: eff.q }) : t("colleges.noFilterMatch")}</li>
            )}
            {rows.length > 0 && listRows.length === 0 && <li className="rounded-xl bg-zinc-50 p-4 text-sm text-zinc-600">{lensSentence}</li>}
            {listRows.slice(0, shown.count).map(({ c, fit }) => {
              const on = c.slug === selected;
              const due = lens ? (dueById.get(c.id) ?? null) : null;
              const head = lens ? groups.get(c.slug) : undefined;
              return (
                <Fragment key={c.slug}>
                {/* The timetable: each deadline day's heading stays at the top of the list while its colleges scroll under it. */}
                {head && (
                  <li className="sticky top-0 z-[1] bg-white px-3 pb-1.5 pt-3">
                    <DayHead group={head} withDays={hydrated} />
                  </li>
                )}
                <li data-slug={c.slug}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setSelected(c.slug)}
                    onMouseEnter={() => hover(c.slug)}
                    onFocus={() => hover(c.slug)}
                    onBlur={() => hover(null)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${on ? "bg-zinc-100" : "hover:bg-zinc-50"}`}
                  >
                    {/* One fixed logo slot, so every name starts on the same edge whether or not the school has an icon. */}
                    <span className="grid h-7 w-7 shrink-0 place-items-center">
                      <SchoolLogo slug={c.slug} name={c.short_name ?? c.name} />
                    </span>
                    {/* The fit badge sits under the name: beside it, the narrow sidebar cut names to a few letters. */}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-base font-semibold leading-snug text-ink">{c.short_name ?? c.name}</span>
                      <span className="mt-0.5 block truncate text-sm text-zinc-600">
                        {[c.city, c.state_region].filter(Boolean).join(", ")}
                        {c.admit_rate != null && ` · ${t("colleges.admitSuffix", { pct: fmtPct(c.admit_rate, 0) })}`}
                      </span>
                      {(due || fit || student.has(c.slug) || applyTags[c.slug]) && (
                        <span className="mt-1.5 flex flex-wrap gap-1">
                          {due && <PlanChip plan={due.plan} />}
                          {fit ? <FitBadge fit={fit.fit} size="md" /> : student.has(c.slug) && <Pill tone="blue" size="md">{t("colleges.onList")}</Pill>}
                          <ApplyTags tags={applyTags[c.slug]} size="md" />
                        </span>
                      )}
                    </span>
                    <span className="shrink-0">
                      <TierBadge tier={c.general_tier} />
                    </span>
                  </button>
                </li>
                </Fragment>
              );
            })}
            {shown.hasMore && (
              <li>
                <LoadMore key={shown.count} count={shown.count} onVisible={shown.more} />
              </li>
            )}
          </ul>
        </aside>

        <div className="flex min-w-0 flex-col gap-3 lg:min-h-0">
          {/* The map panel. Its header reads like a line of the season's timetable: when (the lens and, when on, how many colleges
              close in it), then the key (what each colour means and how many of the colleges lit have it, one line on a phone) and
              the way to colour by fit. The map fills the rest, framed to the lower 48 with Alaska and Hawaii as insets. */}
          <section aria-label={t(`colleges.mapLabel.${region}` as MessageKey)} className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 lg:min-h-0 lg:flex-1">
            <div className="space-y-2 border-b border-zinc-200 bg-white px-4 py-2.5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                {lensSwitch}
                {lensSentence && <p className="text-[15px] font-semibold text-ink">{lensSentence}</p>}
                {current && (
                  <button type="button" onClick={() => setSelected(null)} className={`ml-auto ${buttonClass("ghost", "sm")} h-8`}>
                    {t("colleges.wholeMap")}
                  </button>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
                <p className="text-[13px] font-semibold text-ink max-sm:sr-only">{byFit ? t("colleges.yourFit") : t("colleges.legendTier")}</p>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[13px] max-sm:gap-x-2.5" aria-label={t("colleges.tierColours")}>
                  {legend.map((i) => (
                    <li key={i.key} className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className={`h-3 w-3 rounded-full ${i.cls}`} aria-hidden="true" />
                      <span className="font-semibold text-ink">{i.label}</span>
                      <span className="tabular-nums text-zinc-600">{i.n}</span>
                    </li>
                  ))}
                </ul>
                {isUS && (
                  <div className="text-[13px] leading-snug max-sm:hidden">
                    {byFit ? (
                      statsLink()
                    ) : (
                      <Link href="/start" className="font-semibold text-blue-700 underline-offset-4 hover:underline">
                        {t("colleges.colourByFit")}
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </div>
            {/* Below lg the canvas takes the land's own proportions (5:3 at this tilt), so the land fills it and the list follows close
                under it. A fixed ratio and no minimum height: the framing is the same at every width, scrollbar or none. */}
            <div className="aspect-[5/3] lg:aspect-auto lg:min-h-0 lg:flex-1">
              <USMap3D
                key={region}
                region={region}
                pins={pins}
                selected={selected}
                onSelect={setSelected}
                cardSide={side}
                onReady={(handle) => {
                  mapApi.current = handle;
                }}
              >
                {wide && current && (
                  <div key={current.slug} className={`pointer-events-none absolute inset-y-3 z-10 flex w-[384px] items-center ${side === "right" ? "right-3" : "left-3"}`}>
                    {card}
                  </div>
                )}
              </USMap3D>
            </div>
          </section>
          {/* Below lg the card sits under the map, where it can be read whole, instead of covering it. */}
          {!wide && current && <div key={current.slug}>{card}</div>}
        </div>
      </div>
    </div>
  );
}
