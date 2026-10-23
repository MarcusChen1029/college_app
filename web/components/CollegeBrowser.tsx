"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeFit } from "@/lib/fit";
import { fmtDate, fmtPct, INTL_AID, TEST_POLICY } from "@/lib/format";
import { useStudent } from "@/lib/student-store";
import { BASE_TIERS, TIER_ORDER, tierRank } from "@/lib/tiers";
import type { CollegeSummary, Lookups, TierCode } from "@/lib/types";
import { FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";


export function CollegeBrowser({ colleges, lookups }: { colleges: CollegeSummary[]; lookups: Lookups }) {
  const student = useStudent();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("general");
  const [minTier, setMinTier] = useState<TierCode | "">("");
  const [state, setState] = useState("");
  const [testPolicy, setTestPolicy] = useState("");
  const [plan, setPlan] = useState("");
  const [intlAidOnly, setIntlAidOnly] = useState(false);
  const [sort, setSort] = useState<"tier" | "admit" | "name" | "deadline">("tier");
  const [selected, setSelected] = useState<string[]>([]);

  const states = useMemo(() => [...new Set(colleges.map((c) => c.state_region).filter(Boolean))].sort() as string[], [colleges]);
  const planKeys = useMemo(() => [...new Set(colleges.flatMap((c) => c.plans ?? []))].sort(), [colleges]);
  const planLabel = (k: string) => lookups.plans.find((p) => p.key === k)?.label ?? k;
  const tierFor = (c: CollegeSummary) => (category === "general" ? c.general_tier : c.tiers?.[category]) ?? null;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    const filtered = colleges.filter((c) => {
      if (term && !`${c.name} ${c.short_name ?? ""} ${c.city ?? ""}`.toLowerCase().includes(term)) return false;
      const t = tierFor(c);
      if (minTier && (!t || tierRank(t) > tierRank(minTier))) return false;
      if (category !== "general" && !t) return false;
      if (state && c.state_region !== state) return false;
      if (testPolicy && c.test_policy !== testPolicy) return false;
      if (plan && !(c.plans ?? []).includes(plan)) return false;
      if (intlAidOnly && !["need_blind_full_need", "need_aware_full_need", "need_aware_limited", "merit_only"].includes(c.intl_aid_policy ?? "")) return false;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "admit") return (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
      if (sort === "deadline") return (a.next_deadline ?? "9999").localeCompare(b.next_deadline ?? "9999");
      return tierRank(tierFor(a)) - tierRank(tierFor(b)) || (a.admit_rate ?? 999) - (b.admit_rate ?? 999);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colleges, q, category, minTier, state, testPolicy, plan, intlAidOnly, sort]);

  const shown = useVisibleCount(`${q}|${category}|${minTier}|${state}|${testPolicy}|${plan}|${intlAidOnly}|${sort}`, rows.length);

  const hasScores = student.profile.sat != null || student.profile.act != null;
  const toggle = (slug: string) =>
    setSelected((s) => (s.includes(slug) ? s.filter((x) => x !== slug) : s.length >= 4 ? s : [...s, slug]));

  const select = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${select} w-56`} placeholder="Search name or city…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={select} value={category} onChange={(e) => {
          setCategory(e.target.value);
          setMinTier("");
        }} aria-label="Tier category">
          {lookups.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.key === "general" ? "Tier: general" : `Tier: ${c.label}`}
            </option>
          ))}
        </select>
        <select className={select} value={minTier} onChange={(e) => setMinTier(e.target.value as TierCode | "")} aria-label="Minimum tier">
          <option value="">Any tier</option>
          {(category === "general" ? TIER_ORDER : BASE_TIERS).map((t) => (
            <option key={t} value={t}>
              {t === TIER_ORDER[0] ? `${t} only` : `${t} or better`}
            </option>
          ))}
        </select>
        <select className={select} value={state} onChange={(e) => setState(e.target.value)} aria-label="State">
          <option value="">All states</option>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={select} value={testPolicy} onChange={(e) => setTestPolicy(e.target.value)} aria-label="Test policy">
          <option value="">Any test policy</option>
          {Object.entries(TEST_POLICY).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className={select} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Application plan">
          <option value="">Any plan</option>
          {planKeys.map((k) => (
            <option key={k} value={k}>
              Offers {planLabel(k)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={intlAidOnly} onChange={(e) => setIntlAidOnly(e.target.checked)} />
          Aid for internationals
        </label>
        <select className={`${select} ml-auto`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="tier">Sort: tier</option>
          <option value="admit">Sort: admit rate</option>
          <option value="deadline">Sort: next deadline</option>
          <option value="name">Sort: name</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950">
          <span>
            {selected.length} selected{selected.length >= 4 ? " (max 4)" : ""}
          </span>
          <Link className="font-medium text-blue-700 underline dark:text-blue-300" href={`/compare?c=${selected.join(",")}`}>
            Compare side by side →
          </Link>
          <button className="ml-auto text-zinc-500 hover:underline" onClick={() => setSelected([])}>
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">Tier</th>
              <th className="p-2">College</th>
              <th className="p-2 text-right">Admit rate</th>
              <th className="p-2 text-right">SAT 25–75</th>
              <th className="p-2">Testing</th>
              <th className="p-2">Plans</th>
              <th className="p-2">Next deadline</th>
              <th className="p-2">Intl aid</th>
              <th className="p-2">{hasScores ? "Your fit" : "Fit"}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown.count).map((c) => {
              const fit = hasScores && (c.country_code ?? "US") === "US" ? computeFit(student.profile, c) : null;
              const inList = student.has(c.slug);
              return (
                <tr key={c.slug} className="border-t border-zinc-100 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900/60">
                  <td className="p-2">
                    <input type="checkbox" aria-label={`Select ${c.name} to compare`} checked={selected.includes(c.slug)} onChange={() => toggle(c.slug)} />
                  </td>
                  <td className="p-2">
                    <span className="flex items-center gap-2">
                      <SchoolLogo slug={c.slug} />
                      <TierBadge tier={tierFor(c)} />
                    </span>
                  </td>
                  <td className="p-2">
                    <Link href={`/colleges/${c.slug}`} className="font-medium hover:underline">
                      {c.name}
                    </Link>
                    <div className="text-xs text-zinc-500">
                      {c.city}, {c.state_region} · {c.control === "public" ? "Public" : "Private"}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtPct(c.admit_rate)}
                    {student.profile.international && c.intl_admit_rate != null && (
                      <div className="text-xs text-zinc-500">intl {fmtPct(c.intl_admit_rate)}</div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {c.sat_p25 != null ? `${Number(c.sat_p25)}–${Number(c.sat_p75)}` : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="p-2">{c.test_policy ? <Pill>{TEST_POLICY[c.test_policy] ?? c.test_policy}</Pill> : "—"}</td>
                  <td className="p-2 text-xs">{[...(c.plans ?? [])].sort().join(" · ") || "—"}</td>
                  <td className="p-2 tabular-nums">{fmtDate(c.next_deadline)}</td>
                  <td className="p-2 text-xs">{c.intl_aid_policy ? INTL_AID[c.intl_aid_policy] : <span className="text-zinc-400">Unknown</span>}</td>
                  <td className="p-2">{fit ? <FitBadge fit={fit.fit} reason={fit.reason} /> : <span className="text-xs text-zinc-400">{hasScores ? "—" : "add scores"}</span>}</td>
                  <td className="p-2 text-right">
                    {!inList && !student.canAdd ? (
                      <Link href="/pricing" className="whitespace-nowrap rounded-md border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" title={`Your ${student.plan.name} plan list is full`}>
                        Upgrade
                      </Link>
                    ) : (
                    <button
                      className={`rounded-md px-2 py-1 text-xs font-medium ${inList ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300" : "bg-blue-600 text-white hover:bg-blue-700"}`}
                      onClick={() => (inList ? student.remove(c.slug) : student.add(c))}
                    >
                      {inList ? "✓ In list" : "+ My list"}
                    </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.hasMore && (
              <tr>
                <td colSpan={11}>
                  <LoadMore key={shown.count} count={shown.count} onVisible={shown.more} />
                </td>
              </tr>
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="p-6 text-center text-zinc-500">
                  No colleges match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        Admit rates and SAT ranges come from each college&apos;s latest Common Data Set (enrolled first-years). Hover a fit label to see the
        reasoning. Tiers are an editorial v0 scale (S → D).
      </p>
    </div>
  );
}
