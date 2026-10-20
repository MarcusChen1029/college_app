"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeFit } from "@/lib/fit";
import { ENGLISH_POLICY, fmtDate, fmtInt, fmtPct, TEST_POLICY } from "@/lib/format";
import { useStudent } from "@/lib/student-store";
import type { CollegeSummary, EnglishSummary, Lookups, SatEstimate, TierCode } from "@/lib/types";
import { CollegeBrowser } from "./CollegeBrowser";
import { FitBadge, Pill, TierBadge } from "./badges";
import { USMap } from "./USMap";

type Sort = "tier" | "admit" | "name";
const TIER_ORDER: TierCode[] = ["S", "A", "B", "C", "D"];

function englishLine(e: EnglishSummary | undefined) {
  if (!e) return null;
  const mins = [
    e.toefl != null && `TOEFL ${e.toefl}${e.toefl2026 != null ? ` (new scale ${e.toefl2026})` : ""}`,
    e.ielts != null && `IELTS ${e.ielts}`,
    e.duolingo != null && `Duolingo ${e.duolingo}`,
  ].filter(Boolean);
  return { policy: e.policy ? ENGLISH_POLICY[e.policy] ?? e.policy : null, mins };
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-blue-50 p-3">
      <p className="text-xs font-medium text-zinc-500">{label}</p>
      <div className="mt-0.5 font-display text-lg font-bold leading-snug">{children}</div>
    </div>
  );
}

function DetailCard({ college, english, sat }: { college: CollegeSummary; english: EnglishSummary | undefined; sat: SatEstimate | undefined }) {
  const student = useStudent();
  const inList = student.has(college.slug);
  const hasScores = student.profile.sat != null || student.profile.act != null;
  const fit = hasScores ? computeFit(student.profile, college) : null;
  const intl = !!student.profile.international && college.intl_admit_rate != null;
  const eng = englishLine(english);

  return (
    <article key={college.slug} className="rounded-3xl border-2 border-ink bg-white p-5 shadow-[6px_6px_0_0_#cdeafc]">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <TierBadge tier={college.general_tier} />
          <div>
            <h2 className="text-2xl font-bold leading-tight">{college.name}</h2>
            <p className="text-sm text-zinc-500">
              {[college.city, college.state_region].filter(Boolean).join(", ")}
              {college.control && <> · <span className="capitalize">{college.control.replace(/_/g, " ")}</span></>}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => (inList ? student.remove(college.slug) : student.add({ slug: college.slug, id: college.id }))}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${inList ? "bg-zinc-100 text-zinc-700 hover:bg-zinc-200" : "bg-blue-600 text-white hover:bg-blue-700"}`}
          >
            {inList ? "✓ In my list" : "+ Add to my list"}
          </button>
          <Link href={`/colleges/${college.slug}`} className="rounded-full border-2 border-ink px-4 py-2 text-sm font-semibold hover:bg-blue-50">
            Full details
          </Link>
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Fact label={intl ? "International admit rate" : "Admit rate"}>
          {fmtPct(intl ? college.intl_admit_rate : college.admit_rate, 1)}
          {intl && <span className="block text-xs font-normal text-zinc-500">Overall {fmtPct(college.admit_rate, 1)}</span>}
        </Fact>
        <Fact label="SAT median">
          {college.sat_p50 != null ? fmtInt(college.sat_p50) : sat ? `≈ ${fmtInt(sat.p50)}` : "—"}
          {(() => {
            const r = college.sat_p25 != null && college.sat_p75 != null ? { p25: college.sat_p25, p75: college.sat_p75, est: false } : sat ? { p25: sat.p25, p75: sat.p75, est: true } : null;
            return r ? (
              <span className="block text-xs font-normal text-zinc-500">
                Middle 50%: {r.est ? "≈ " : ""}
                {r.p25}–{r.p75}
                {r.est && " (sum of section scores)"}
              </span>
            ) : null;
          })()}
        </Fact>
        <Fact label="Testing">{college.test_policy ? TEST_POLICY[college.test_policy] ?? college.test_policy : "—"}</Fact>
        <Fact label="Your fit">
          {fit ? (
            <>
              <FitBadge fit={fit.fit} />
              <span className="mt-1 block text-xs font-normal text-zinc-500">{fit.reason}</span>
            </>
          ) : (
            <span className="text-sm font-normal text-zinc-500">
              <Link href="/start" className="font-semibold text-blue-700 underline underline-offset-4">
                Add your scores
              </Link>{" "}
              to see this
            </span>
          )}
        </Fact>
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Fact label="English test for international applicants">
          {eng ? (
            <>
              {eng.mins.length > 0 ? eng.mins.join(" · ") : <span className="text-base font-semibold">No minimum published</span>}
              {eng.policy && <span className="block text-xs font-normal text-zinc-500">{eng.policy}</span>}
            </>
          ) : (
            "—"
          )}
        </Fact>
        <Fact label="Next deadline">{college.next_deadline ? fmtDate(college.next_deadline) : "—"}</Fact>
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
  const student = useStudent();
  const [view, setView] = useState<"map" | "table">("map");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("tier");
  const [selected, setSelected] = useState<string | null>(null);

  const hasScores = student.profile.sat != null || student.profile.act != null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return colleges
      .filter((c) => !term || `${c.name} ${c.short_name ?? ""} ${c.city ?? ""} ${c.state_region ?? ""}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === "name") return a.name.localeCompare(b.name);
        if (sort === "admit") return (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
        const ta = a.general_tier ? TIER_ORDER.indexOf(a.general_tier) : 99;
        const tb = b.general_tier ? TIER_ORDER.indexOf(b.general_tier) : 99;
        return ta - tb || (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
      });
  }, [colleges, q, sort]);

  const pins = useMemo(
    () => rows.map((c) => ({ slug: c.slug, name: c.short_name ?? c.name, lat: c.latitude, lng: c.longitude, tier: c.general_tier })),
    [rows],
  );
  const current = colleges.find((c) => c.slug === selected) ?? null;

  const tab = (v: "map" | "table", label: string) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => setView(v)}
      className={`rounded-full px-4 py-1.5 text-sm font-semibold ${view === v ? "bg-ink text-white" : "text-zinc-600 hover:bg-blue-50"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-full border-2 border-blue-100 bg-white p-1" role="group" aria-label="View">
        {tab("map", "Map")}
        {tab("table", "Table")}
      </div>

      {view === "table" ? (
        <CollegeBrowser colleges={colleges} lookups={lookups} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="order-last flex flex-col gap-3 lg:order-first">
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, city or state"
              aria-label="Search colleges"
              className="w-full rounded-full border-2 border-zinc-200 bg-white px-4 py-2 text-sm focus:border-blue-400 focus:outline-none"
            />
            <div className="flex gap-1.5 text-xs font-semibold" role="group" aria-label="Sort">
              {([["tier", "Top tier"], ["admit", "Admit rate"], ["name", "A–Z"]] as const).map(([k, label]) => (
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
            <ul className="space-y-1.5 lg:max-h-[640px] lg:overflow-y-auto lg:pr-1">
              {rows.length === 0 && <li className="rounded-2xl bg-zinc-50 p-4 text-sm text-zinc-500">No college matches &ldquo;{q}&rdquo;.</li>}
              {rows.map((c) => {
                const fit = hasScores ? computeFit(student.profile, c) : null;
                const on = c.slug === selected;
                return (
                  <li key={c.slug}>
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelected(c.slug)}
                      className={`flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-2.5 text-left transition ${
                        on ? "border-ink bg-blue-50" : "border-transparent hover:bg-blue-50"
                      }`}
                    >
                      <TierBadge tier={c.general_tier} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold">{c.short_name ?? c.name}</span>
                        <span className="block truncate text-xs text-zinc-500">
                          {[c.city, c.state_region].filter(Boolean).join(", ")} · {fmtPct(c.admit_rate, 0)} admit
                        </span>
                      </span>
                      {fit ? <FitBadge fit={fit.fit} /> : student.has(c.slug) ? <Pill tone="blue">On list</Pill> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div className="space-y-4">
            <USMap pins={pins} selected={selected} onSelect={setSelected} />
            {current ? (
              <DetailCard college={current} english={english[current.id]} sat={satEstimates[current.id]} />
            ) : (
              <p className="rounded-3xl border-2 border-dashed border-blue-200 p-6 text-center text-sm text-zinc-500">
                Pick a college from the list or click a pin to zoom in and see its admit rate, SAT median, English requirements and your fit.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
