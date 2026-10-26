"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { computeFit } from "@/lib/fit";
import { fmtDate, fmtPct, INTL_AID, TEST_POLICY } from "@/lib/format";
import type { MessageKey, TFunction } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { useStudent } from "@/lib/student-store";
import { BASE_TIERS, TIER_ORDER, tierRank } from "@/lib/tiers";
import { buttonClass } from "@/lib/ui";
import type { CollegeSummary, Lookups, TierCode } from "@/lib/types";
import { FitBadge, Pill, SchoolLogo, TierBadge } from "./badges";
import { LoadMore, useVisibleCount } from "./LoadMore";

// Lookup labels live in lib/format.ts (English, shared with tests); translate them here by stored value.
const lookupLabel = (t: TFunction, group: "testPolicy" | "intlAid", map: Record<string, string>, k: string) =>
  k in map ? t(`colleges.${group}.${k}` as MessageKey) : k;

export function CollegeBrowser({ colleges, lookups }: { colleges: CollegeSummary[]; lookups: Lookups }) {
  const t = useT();
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

  const select = "rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input className={`${select} w-56`} placeholder={t("colleges.tableSearchPlaceholder")} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={select} value={category} onChange={(e) => {
          setCategory(e.target.value);
          setMinTier("");
        }} aria-label={t("colleges.tierCategory")}>
          {lookups.categories.map((c) => (
            <option key={c.key} value={c.key}>
              {c.key === "general" ? t("colleges.tierGeneral") : t("colleges.tierOf", { label: c.label })}
            </option>
          ))}
        </select>
        <select className={select} value={minTier} onChange={(e) => setMinTier(e.target.value as TierCode | "")} aria-label={t("colleges.minTier")}>
          <option value="">{t("colleges.anyTier")}</option>
          {(category === "general" ? TIER_ORDER : BASE_TIERS).map((tier) => (
            <option key={tier} value={tier}>
              {tier === TIER_ORDER[0] ? t("colleges.tierOnly", { t: tier }) : t("colleges.tierOrBetter", { t: tier })}
            </option>
          ))}
        </select>
        <select className={select} value={state} onChange={(e) => setState(e.target.value)} aria-label={t("colleges.state")}>
          <option value="">{t("colleges.allStates")}</option>
          {states.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select className={select} value={testPolicy} onChange={(e) => setTestPolicy(e.target.value)} aria-label={t("colleges.testPolicy")}>
          <option value="">{t("colleges.anyTestPolicy")}</option>
          {Object.entries(TEST_POLICY).map(([k]) => (
            <option key={k} value={k}>
              {lookupLabel(t, "testPolicy", TEST_POLICY, k)}
            </option>
          ))}
        </select>
        <select className={select} value={plan} onChange={(e) => setPlan(e.target.value)} aria-label={t("colleges.applicationPlan")}>
          <option value="">{t("colleges.anyPlan")}</option>
          {planKeys.map((k) => (
            <option key={k} value={k}>
              {t("colleges.offersPlan", { plan: planLabel(k) })}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={intlAidOnly} onChange={(e) => setIntlAidOnly(e.target.checked)} />
          {t("colleges.aidForIntl")}
        </label>
        <select className={`${select} ml-auto`} value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label={t("colleges.sort")}>
          <option value="tier">{t("colleges.sortByTier")}</option>
          <option value="admit">{t("colleges.sortByAdmit")}</option>
          <option value="deadline">{t("colleges.sortByDeadline")}</option>
          <option value="name">{t("colleges.sortByName")}</option>
        </select>
      </div>

      {selected.length > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm">
          <span>
            {t("colleges.selectedCount", { n: selected.length })}{selected.length >= 4 ? t("colleges.maxFour") : ""}
          </span>
          <Link className="font-medium text-blue-700 underline" href={`/compare?c=${selected.join(",")}`}>
            {t("colleges.compareSideBySide")}
          </Link>
          <button className="ml-auto text-zinc-500 hover:underline" onClick={() => setSelected([])}>
            {t("colleges.clear")}
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-zinc-200">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="w-8 p-2" />
              <th className="p-2">{t("colleges.thTier")}</th>
              <th className="p-2">{t("colleges.thCollege")}</th>
              <th className="p-2 text-right">{t("colleges.thAdmitRate")}</th>
              <th className="p-2 text-right">{t("colleges.thSat")}</th>
              <th className="p-2">{t("colleges.thTesting")}</th>
              <th className="p-2">{t("colleges.thPlans")}</th>
              <th className="p-2">{t("colleges.thNextDeadline")}</th>
              <th className="p-2">{t("colleges.thIntlAid")}</th>
              <th className="p-2">{hasScores ? t("colleges.thYourFit") : t("colleges.thFit")}</th>
              <th className="p-2" />
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, shown.count).map((c) => {
              const fit = hasScores && (c.country_code ?? "US") === "US" ? computeFit(student.profile, c) : null;
              const inList = student.has(c.slug);
              return (
                <tr key={c.slug} className="border-t border-zinc-100 hover:bg-zinc-50">
                  <td className="p-2">
                    <input type="checkbox" aria-label={t("colleges.selectToCompare", { name: c.name })} checked={selected.includes(c.slug)} onChange={() => toggle(c.slug)} />
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
                      {c.city}, {c.state_region} · {c.control === "public" ? t("colleges.public") : t("colleges.private")}
                    </div>
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {fmtPct(c.admit_rate)}
                    {student.profile.international && c.intl_admit_rate != null && (
                      <div className="text-xs text-zinc-500">{t("colleges.intlRate", { pct: fmtPct(c.intl_admit_rate) })}</div>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">
                    {c.sat_p25 != null ? `${Number(c.sat_p25)}–${Number(c.sat_p75)}` : <span className="text-zinc-400">—</span>}
                  </td>
                  <td className="p-2">{c.test_policy ? <Pill>{lookupLabel(t, "testPolicy", TEST_POLICY, c.test_policy)}</Pill> : "—"}</td>
                  <td className="p-2 text-xs">{[...(c.plans ?? [])].sort().join(" · ") || "—"}</td>
                  <td className="p-2 tabular-nums">{fmtDate(c.next_deadline)}</td>
                  <td className="p-2 text-xs">{c.intl_aid_policy ? lookupLabel(t, "intlAid", INTL_AID, c.intl_aid_policy) : <span className="text-zinc-400">{t("colleges.unknown")}</span>}</td>
                  <td className="p-2">{fit ? <FitBadge fit={fit.fit} result={fit} /> : <span className="text-xs text-zinc-400">{hasScores ? "—" : t("colleges.addScoresShort")}</span>}</td>
                  <td className="p-2 text-right">
                    {!inList && !student.canAdd ? (
                      <Link href="/pricing" className="whitespace-nowrap rounded-md border border-blue-600 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50" title={t("colleges.planFull", { plan: student.plan.name })}>
                        {t("colleges.upgrade")}
                      </Link>
                    ) : (
                    <button
                      className={buttonClass(inList ? "secondary" : "primary", "sm")}
                      onClick={() => (inList ? student.remove(c.slug) : student.add(c))}
                    >
                      {inList ? t("colleges.inList") : t("colleges.myListAdd")}
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
                  {t("colleges.noFilterMatch")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-zinc-500">
        {t("colleges.footnote")}
      </p>
    </div>
  );
}
