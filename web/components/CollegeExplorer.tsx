"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { computeFit } from "@/lib/fit";
import { ENGLISH_POLICY, fmtDate, fmtPct, TEST_POLICY } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { fitReasonText } from "@/lib/i18n/fit-text";
import { activeRegions, REGIONS, type RegionCode } from "@/lib/regions";
import { cardSideFor } from "@/lib/region-geo";
import { useStudent } from "@/lib/student-store";
import { BASE_TIERS, tierRank } from "@/lib/tiers";
import type { CollegeSummary, EnglishSummary, Lookups, SatEstimate } from "@/lib/types";
import { buttonClass } from "@/lib/ui";
import { CollegeBrowser } from "./CollegeBrowser";
import { FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";
import { TIER_FILL } from "./USMap";
import { USMap3D } from "./USMap3D";

type Sort = "tier" | "admit" | "name";

// Lookup labels live in lib/format.ts (English, shared with tests); translate them here by stored value.
const policyLabel = (t: TFunction, group: "testPolicy" | "englishPolicy", map: Record<string, string>, k: string) =>
  k in map ? t(`colleges.${group}.${k}` as MessageKey) : k;

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
    <div className="flex items-center gap-3">
      <svg width={88} height={88} viewBox="0 0 88 88" role="img" aria-label={`${label}: ${rate == null ? t("colleges.notReported") : `${rate}%`}`}>
        <circle cx={44} cy={44} r={R} fill="none" stroke="#e9f2fa" strokeWidth={10} />
        <circle
          cx={44}
          cy={44}
          r={R}
          fill="none"
          stroke="#1fa4e4"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={on ? C * (1 - Math.max(pct, 1.5) / 100) : C}
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 1100ms cubic-bezier(.2,.8,.2,1)" }}
        />
        <text x={44} y={50} textAnchor="middle" fontSize={19} fontWeight={800} fill="#12304a">
          {shown == null ? "—" : `${shown.toFixed(rate != null && rate < 10 ? 1 : 0)}%`}
        </text>
      </svg>
      <div>
        <p className="text-xs font-medium text-zinc-500">{label}</p>
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
        <p className="text-xs font-medium text-zinc-500">{p50 != null ? t("colleges.satMedian") : t("colleges.satMiddle")}</p>
        <p className="font-display text-lg font-bold">
          {estimated && "≈ "}
          {p50 ?? "—"}
        </p>
      </div>
      <div className="relative mt-6 h-3 rounded-full bg-zinc-100">
        <div
          className="absolute inset-y-0 rounded-full bg-blue-300"
          style={{ left: pos(p25), width: on ? `calc(${pos(p75)} - ${pos(p25)})` : 0, transition: "width 900ms cubic-bezier(.2,.8,.2,1) 150ms" }}
        />
        {p50 != null && <span className="absolute -top-1 h-5 w-1 -translate-x-1/2 rounded bg-ink" style={{ left: pos(p50) }} />}
        {you != null && (
          <span className="absolute -top-6 -translate-x-1/2 text-center text-[10px] font-bold leading-none text-coral" style={{ left: pos(you) }}>
            {t("colleges.you")}
            <span className="mx-auto mt-0.5 block h-3 w-3 translate-y-[5px] rounded-full border-2 border-white bg-coral shadow" />
          </span>
        )}
      </div>
      <p className="mt-1 flex justify-between text-[11px] text-zinc-500">
        <span>400</span>
        <span>
          {t("colleges.middle50")}{estimated && "≈ "}
          {p25}–{p75}
          {estimated && t("colleges.sectionAdded")}
        </span>
        <span>1600</span>
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-t border-zinc-100 py-2 text-sm first:border-t-0">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="text-right font-semibold">{children}</span>
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
  side,
  onClose,
}: {
  college: CollegeSummary;
  english: EnglishSummary | undefined;
  sat: SatEstimate | undefined;
  side: "left" | "right";
  onClose: () => void;
}) {
  const t = useT();
  const student = useStudent();
  const inList = student.has(college.slug);
  const hasScores = student.profile.sat != null || student.profile.act != null;
  const isUS = (college.country_code ?? "US") === "US";
  // Fit labels are built on SAT/ACT and US admit rates, so they only apply to US colleges for now.
  const fit = hasScores && isUS ? computeFit(student.profile, college) : null;
  const intl =!!student.profile.international && college.intl_admit_rate != null;
  const eng = englishText(t, english);

  const satRange =
    college.sat_p25 != null && college.sat_p75 != null
      ? { p25: college.sat_p25, p50: college.sat_p50, p75: college.sat_p75, estimated: false }
      : sat
        ? { p25: sat.p25, p50: sat.p50, p75: sat.p75, estimated: true }
        : null;

  return (
    <article
      className="card-in pointer-events-auto max-h-full w-full overflow-y-auto rounded-3xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_0_#cdeafc] max-lg:rounded-b-none"
      style={{ "--from": side === "right" ? "28px" : "-28px" } as React.CSSProperties}
    >
      <header className="flex items-start gap-3">
        <SchoolLogo slug={college.slug} />
        <TierBadge tier={college.general_tier} />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold leading-tight">{college.name}</h2>
          <p className="text-xs text-zinc-500">
            {[college.city, college.state_region].filter(Boolean).join(", ")}
            {college.control && <> · <span className="capitalize">{college.control.replace(/_/g, " ")}</span></>}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label={t("colleges.closeDetails")} className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-zinc-500 hover:bg-zinc-100">
          ×
        </button>
      </header>

      <div className="mt-4 space-y-4">
        {(isUS || college.admit_rate != null) && (
          <AdmitRing rate={intl ? college.intl_admit_rate : college.admit_rate} label={intl ? t("colleges.intlAdmitRate") : t("colleges.admitRate")} />
        )}
        {!isUS ? (
          <p className="text-sm text-zinc-500">{t("colleges.ukAdmission")}</p>
        ) : satRange ? (
          <SatBar {...satRange} you={student.profile.sat ?? null} />
        ) : (
          <p className="text-sm text-zinc-500">{t("colleges.noSat")}</p>
        )}
      </div>

      <div className="mt-3">
        {isUS && <Row label={t("colleges.testing")}>{college.test_policy ? policyLabel(t, "testPolicy", TEST_POLICY, college.test_policy) : "—"}</Row>}
        <Row label={t("colleges.englishTest")}>
          {eng.mins}
          {eng.note && <span className="block text-xs font-normal text-zinc-500">{eng.note}</span>}
        </Row>
        <Row label={t("colleges.nextDeadline")}>{college.next_deadline ? fmtDate(college.next_deadline) : "—"}</Row>
        {isUS && <Row label={t("colleges.yourFit")}>
          {fit ? (
            <>
              <FitBadge fit={fit.fit} />
              <span className="mt-1 block text-xs font-normal text-zinc-500">{fitReasonText(t, fit)}</span>
            </>
          ) : (
            <Link href="/start" className="font-semibold text-blue-700 underline underline-offset-4">
              {t("colleges.addYourScores")}
            </Link>
          )}
        </Row>}
      </div>

      <div className="mt-4 flex gap-2">
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
}: {
  colleges: CollegeSummary[];
  lookups: Lookups;
  english: Record<string, EnglishSummary>;
  satEstimates: Record<string, SatEstimate>;
}) {
  const t = useT();
  const student = useStudent();
  const [view, setView] = useState<"map" | "table">("map");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("tier");
  const [selected, setSelected] = useState<string | null>(null);
  // Only the regions the student is applying to are offered (all of them while none is chosen). Until the reader
  // picks one, follow their first target region (it can arrive after sign-in loads).
  const [picked, setPicked] = useState<RegionCode | null>(null);
  const targets = student.profile.targetRegions;
  const offered = useMemo(() => activeRegions(targets), [targets]);
  const region = picked && offered.includes(picked) ? picked : offered[0];
  const inRegion = useMemo(() => colleges.filter((c) => (c.country_code ?? "US") === region), [colleges, region]);
  const regionCounts = useMemo(() => {
    const n: Record<string, number> = {};
    for (const c of colleges) n[c.country_code ?? "US"] = (n[c.country_code ?? "US"] ?? 0) + 1;
    return n;
  }, [colleges]);

  const hasScores = student.profile.sat != null || student.profile.act != null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inRegion
      .filter((c) => !term || `${c.name} ${c.short_name ?? ""} ${c.city ?? ""} ${c.state_region ?? ""}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "admit") return (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
        return tierRank(a.general_tier) - tierRank(b.general_tier) || (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
      });
  }, [inRegion, q, sort]);

  const shown = useVisibleCount(`${q}|${sort}`, rows.length);

  const pins = useMemo(
    () => rows.map((c) => ({ slug: c.slug, name: c.short_name ?? c.name, lat: c.latitude, lng: c.longitude, tier: c.general_tier })),
    [rows],
  );
  const current = inRegion.find((c) => c.slug === selected) ?? null;
  // Put the card on the side away from the pin so it never covers the college it describes.
  const side: "left" | "right" = current?.longitude != null ? cardSideFor(region, current.longitude) : "right";
  const other = side === "right" ? "left" : "right";

  const regionSwitch = (
    <div className="flex gap-1 rounded-full border-2 border-blue-100 bg-white p-1" role="group" aria-label={t("colleges.country")}>
      {REGIONS.filter((r) => offered.includes(r.code)).map((r) => (
        <button
          key={r.code}
          type="button"
          aria-pressed={region === r.code}
          onClick={() => {
            setPicked(r.code);
            setSelected(null);
          }}
          className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold ${region === r.code ? "bg-ink text-white" : "text-zinc-600 hover:bg-blue-50"}`}
        >
          {t(`colleges.regionShort.${r.code}` as MessageKey)}
          <span className="ml-1 text-xs font-normal opacity-70">{regionCounts[r.code] ?? 0}</span>
        </button>
      ))}
    </div>
  );

  const tab = (v: "map" | "table", label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={`flex-1 rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "text-zinc-600 hover:bg-blue-50"}`}
    >
      {label}
    </button>
  );

  const toggle = (
    <div className="flex gap-1 rounded-full border-2 border-blue-100 bg-white p-1" role="group" aria-label={t("colleges.view")}>
      {tab("map", t("colleges.viewMap"))}
      {tab("table", t("colleges.viewTable"))}
    </div>
  );

  if (view === "table") {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <div className="w-full max-w-xs">{toggle}</div>
          <div className="w-full max-w-xs">{regionSwitch}</div>
        </div>
        <CollegeBrowser key={region} colleges={inRegion} lookups={lookups} />
      </div>
    );
  }

  const stats = [
    student.profile.sat != null && `SAT ${student.profile.sat}`,
    student.profile.act != null && `ACT ${student.profile.act}`,
    student.profile.gpa != null && `GPA ${student.profile.gpa}`,
    student.profile.international && t("colleges.statsIntl"),
  ].filter(Boolean);

  return (
    <div className="grid gap-4 lg:h-[calc(100dvh-5.25rem)] lg:grid-cols-[330px_1fr]">
      <aside className="order-last flex min-h-0 flex-col gap-3 lg:order-first">
        {toggle}
        {regionSwitch}
        <Link href={stats.length ? "/profile" : "/start"} className="rounded-2xl bg-blue-50 px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-blue-100">
          {stats.length ? (
            <>
              {t("colleges.statsPrefix", { stats: stats.join(" · ") })}<span className="text-blue-700 underline">{t("colleges.statsEdit")}</span>
            </>
          ) : (
            t("colleges.addScoresCta")
          )}
        </Link>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("colleges.searchPlaceholder")}
          aria-label={t("colleges.searchAria")}
          className="w-full rounded-full border-2 border-zinc-200 bg-white px-4 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="flex gap-1.5 text-xs font-semibold" role="group" aria-label={t("colleges.sort")}>
          {([["tier", t("colleges.sortTier")], ["admit", t("colleges.sortAdmit")], ["name", t("colleges.sortName")]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              aria-pressed={sort === k}
              onClick={() => setSort(k)}
              className={`rounded-full px-3 py-1 ${sort === k ? "bg-blue-500 text-white" : "bg-zinc-100 text-zinc-600 hover:bg-blue-100"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1">
          {inRegion.length === 0 && <li className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">{t("colleges.noneInRegion", { region: t(`colleges.region.${region}` as MessageKey) })}</li>}
          {inRegion.length > 0 && rows.length === 0 && <li className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">{t("colleges.noMatch", { q })}</li>}
          {rows.slice(0, shown.count).map((c) => {
            const fit = hasScores && region === "US" ? computeFit(student.profile, c) : null;
            const on = c.slug === selected;
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSelected(c.slug)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition ${on ? "border-ink bg-blue-50" : "border-transparent hover:bg-blue-50"}`}
                >
                  <SchoolLogo slug={c.slug} />
                  <TierBadge tier={c.general_tier} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{c.short_name ?? c.name}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {[c.city, c.state_region].filter(Boolean).join(", ")}
                      {c.admit_rate != null && ` · ${t("colleges.admitSuffix", { pct: fmtPct(c.admit_rate, 0) })}`}
                    </span>
                  </span>
                  {fit ? <FitBadge fit={fit.fit} /> : student.has(c.slug) ? <Pill tone="blue">{t("colleges.onList")}</Pill> : null}
                </button>
              </li>
            );
          })}
          {shown.hasMore && (
            <li>
              <LoadMore key={shown.count} count={shown.count} onVisible={shown.more} />
            </li>
          )}
        </ul>
      </aside>

      <div className="h-[58dvh] lg:h-full">
        <USMap3D key={region} region={region} pins={pins} selected={selected} onSelect={setSelected} cardSide={side}>
          <div className={`pointer-events-none absolute top-3 flex items-center gap-2 ${other === "left" ? "left-3" : "right-3"}`}>
            <ul className="pointer-events-auto flex gap-2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold shadow-sm" aria-label={t("colleges.tierColours")}>
              {BASE_TIERS.map((tier) => (
                <li key={tier} className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: TIER_FILL[tier] }} />
                  {tier}
                </li>
              ))}
            </ul>
            {current && (
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="pointer-events-auto rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold shadow-sm hover:bg-blue-50"
              >
                {t("colleges.wholeMap")}
              </button>
            )}
          </div>

          {!current && (
            <p className="pointer-events-none absolute inset-x-0 bottom-4 mx-auto w-fit rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">
              <span className="lg:hidden">{t("colleges.pickBelow")}</span>
              <span className="max-lg:hidden">{t("colleges.pickFromList")}</span>
            </p>
          )}

          {current && (
            <div
              key={current.slug}
              className={`pointer-events-none absolute z-10 flex items-end max-lg:inset-x-0 max-lg:bottom-0 max-lg:h-[56%] lg:inset-y-4 lg:w-[370px] lg:items-center ${
                side === "right" ? "lg:right-4" : "lg:left-4"
              }`}
            >
              <DetailCard college={current} english={english[current.id]} sat={satEstimates[current.id]} side={side} onClose={() => setSelected(null)} />
            </div>
          )}
        </USMap3D>
      </div>
    </div>
  );
}
