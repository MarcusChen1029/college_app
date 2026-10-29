"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ADMIT_STEPS, anyFilter, clearFilters, FITS, moreFilterCount, type ExploreFilters, type SortKey } from "@/lib/explore-filters";
import { cleanStudyFields, FIELD_AREAS, FIELDS, type FieldKey } from "@/lib/fields";
import type { Fit } from "@/lib/fit";
import { TEST_POLICY } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/lib/i18n/client";
import { fitLabel } from "@/lib/i18n/fit-text";
import { BASE_TIERS, TIER_ORDER } from "@/lib/tiers";
import { fmtMoneyShort, TUITION_CAPS, type Currency } from "@/lib/tuition";
import type { Lookups, TierCode } from "@/lib/types";
import { buttonClass, CHIP_CLASS, FIELD_CLASS, fitClass, fitDotClass, FIT_LEVEL } from "@/lib/ui";

// One control style for the whole page (map sidebar, table bar, filter panel): 36px, a 1px control border.
export const CONTROL = FIELD_CLASS;
const CHIP_OFF = "border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400";

export type FilterBarProps = {
  f: ExploreFilters;
  set: (patch: Partial<ExploreFilters>) => void;
  /** Rows shown / rows in the region. */
  count: number;
  total: number;
  /** Colleges hidden by the field filter because there is no data for them. */
  fieldHidden: number;
  isUS: boolean;
  hasScores: boolean;
  hasEnglish: boolean;
  international: boolean;
  currency: Currency;
  studyFields: FieldKey[] | undefined;
  states: string[];
  planKeys: string[];
  lookups: Lookups;
  /** Table: which median sorts exist. */
  sortTests: ("sat" | "act")[];
  /** Map sidebar: every filter behind one "Filters" button, narrow layout. */
  compact?: boolean;
};

export function ExploreFilterBar(p: FilterBarProps) {
  const t = useT();
  const { f, set, compact } = p;
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const more = moreFilterCount(f);
  // In the map sidebar the primary filters live in the panel too, so the button counts them as well.
  const hidden = compact ? more + (f.fit.length ? 1 : 0) + (f.field ? 1 : 0) + (f.maxTuition != null ? 1 : 0) : more;
  const label = (k: FieldKey) => t(`match.field.${k}` as MessageKey);
  const yours = cleanStudyFields(p.studyFields);

  const search = (
    <input
      type="search"
      value={f.q}
      onChange={(e) => set({ q: e.target.value })}
      placeholder={t("colleges.searchPlaceholder")}
      aria-label={t("colleges.searchAria")}
      className={`${CONTROL} w-full ${compact ? "" : "sm:w-60"}`}
    />
  );

  const fitChips = p.isUS ? (
    p.hasScores ? (
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t("colleges.fitFilter")}>
        {FITS.map((k: Fit) => {
          const on = f.fit.includes(k);
          return (
            <button
              key={k}
              type="button"
              aria-pressed={on}
              onClick={() => set({ fit: on ? f.fit.filter((x) => x !== k) : [...f.fit, k] })}
              className={`inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap ${on ? fitClass(k) : CHIP_OFF}`}
            >
              <span className="flex gap-0.5" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={`h-1.5 w-1.5 rounded-full border border-current ${n <= FIT_LEVEL[k] ? fitDotClass(k) : ""}`} />
                ))}
              </span>
              {fitLabel(t, k)}
            </button>
          );
        })}
      </div>
    ) : (
      <Link href="/start" className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline">
        {t("colleges.fitFilterNoScores")}
      </Link>
    )
  ) : null;

  const fieldSelect = (
    <select className={`${CONTROL} ${compact ? "w-full" : "max-w-[13rem]"}`} value={f.field ?? ""} onChange={(e) => set({ field: (e.target.value || null) as FieldKey | null })} aria-label={t("colleges.fieldFilter")}>
      <option value="">{t("colleges.anyField")}</option>
      {yours.length > 0 && (
        <optgroup label={t("colleges.yourFields")}>
          {yours.map((k) => (
            <option key={`y-${k}`} value={k}>
              {label(k)}
            </option>
          ))}
        </optgroup>
      )}
      {FIELD_AREAS.filter((a) => a !== "general").map((area) => (
        <optgroup key={area} label={t(`match.area.${area}` as MessageKey)}>
          {FIELDS.filter((x) => x.area === area && !yours.includes(x.key)).map((x) => (
            <option key={x.key} value={x.key}>
              {label(x.key)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );

  const tuitionSelect = (
    <select
      className={`${CONTROL} ${compact ? "w-full" : ""}`}
      value={f.maxTuition ?? ""}
      onChange={(e) => set({ maxTuition: e.target.value ? Number(e.target.value) : null })}
      aria-label={t("colleges.maxTuition")}
      title={t("colleges.thTuitionTitle")}
    >
      <option value="">{t("colleges.anyTuition")}</option>
      {TUITION_CAPS[p.currency].map((n) => (
        <option key={n} value={n}>
          {t("colleges.tuitionUnder", { amount: fmtMoneyShort(n, p.currency) })}
        </option>
      ))}
    </select>
  );

  const sortOptions: [SortKey, MessageKey][] = [
    ["tier", "colleges.sortByTier"],
    ["admit", "colleges.sortByAdmit"],
    ...(p.isUS ? p.sortTests.map((k): [SortKey, MessageKey] => [k, k === "sat" ? "colleges.sortBySat" : "colleges.sortByAct"]) : []),
    ["tuition", "colleges.sortByTuition"],
    ["deadline", "colleges.sortByDeadline"],
    ["name", "colleges.sortByName"],
  ];
  const sortSelect = (
    <select
      className={`${CONTROL} ${compact ? "w-full" : "ml-auto"}`}
      value={f.sort.key}
      onChange={(e) => set({ sort: { key: e.target.value as SortKey, reverse: false } })}
      aria-label={t("colleges.sort")}
    >
      {sortOptions.map(([k, key]) => (
        <option key={k} value={k}>
          {t(key)}
        </option>
      ))}
    </select>
  );

  const field = (name: string, control: React.ReactNode, hint?: React.ReactNode) => (
    <div className="min-w-0 space-y-1.5">
      <div className="text-[13px] font-semibold text-zinc-600">{name}</div>
      {control}
      {hint}
    </div>
  );

  const admitStep = (v: number | null, onChange: (n: number | null) => void, aria: string) => (
    <select className={`${CONTROL} w-full`} value={v ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} aria-label={aria}>
      <option value="">{t("colleges.admitAny")}</option>
      {ADMIT_STEPS.map((n) => (
        <option key={n} value={n}>
          {n}%
        </option>
      ))}
    </select>
  );

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, text: string, disabled = false, title?: string) => (
    <label className={`flex items-center gap-2 text-sm ${disabled ? "text-zinc-500" : "text-ink"}`} title={title}>
      <input type="checkbox" className="h-4 w-4 accent-ink" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {text}
    </label>
  );

  const panel = (
    <div id={panelId} className={`grid gap-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 ${compact ? "max-h-[45dvh] overflow-y-auto" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {compact && p.isUS && <div className="space-y-1">{field(t("colleges.fitFilter"), fitChips)}</div>}
      {compact && field(t("colleges.fieldFilter"), fieldSelect)}
      {compact && field(t("colleges.maxTuition"), tuitionSelect)}
      {field(
        t("colleges.admitRange"),
        <div className="flex items-center gap-2">
          {admitStep(f.admitMin, (n) => set({ admitMin: n }), t("colleges.admitFrom"))}
          <span className="text-zinc-600">–</span>
          {admitStep(f.admitMax, (n) => set({ admitMax: n }), t("colleges.admitTo"))}
        </div>,
        p.international && <p className="text-[13px] text-zinc-600">{t("colleges.admitIntlNote")}</p>,
      )}
      {field(
        t("colleges.tierCategory"),
        <div className="flex gap-2">
          <select
            className={`${CONTROL} w-full min-w-0`}
            value={f.category}
            onChange={(e) => set({ category: e.target.value, minTier: null })}
            aria-label={t("colleges.tierCategory")}
          >
            {p.lookups.categories.map((c) => (
              <option key={c.key} value={c.key}>
                {c.key === "general" ? t("colleges.tierGeneral") : t("colleges.tierOf", { label: c.label })}
              </option>
            ))}
          </select>
          <select className={`${CONTROL} w-full min-w-0`} value={f.minTier ?? ""} onChange={(e) => set({ minTier: (e.target.value || null) as TierCode | null })} aria-label={t("colleges.minTier")}>
            <option value="">{t("colleges.anyTier")}</option>
            {(f.category === "general" ? TIER_ORDER : BASE_TIERS).map((tier) => (
              <option key={tier} value={tier}>
                {tier === TIER_ORDER[0] ? t("colleges.tierOnly", { t: tier }) : t("colleges.tierOrBetter", { t: tier })}
              </option>
            ))}
          </select>
        </div>,
      )}
      {p.states.length > 0 &&
        field(
          t("colleges.state"),
          <select className={`${CONTROL} w-full`} value={f.state} onChange={(e) => set({ state: e.target.value })} aria-label={t("colleges.state")}>
            <option value="">{t("colleges.allStates")}</option>
            {p.states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>,
        )}
      {p.isUS &&
        field(
          t("colleges.applicationPlan"),
          <div className="flex gap-2">
            <select className={`${CONTROL} w-full min-w-0`} value={f.plan} onChange={(e) => set({ plan: e.target.value })} aria-label={t("colleges.applicationPlan")}>
              <option value="">{t("colleges.anyPlan")}</option>
              {p.planKeys.map((k) => (
                <option key={k} value={k}>
                  {t("colleges.offersPlan", { plan: p.lookups.plans.find((x) => x.key === k)?.label ?? k })}
                </option>
              ))}
            </select>
            <select className={`${CONTROL} w-full min-w-0`} value={f.testPolicy} onChange={(e) => set({ testPolicy: e.target.value })} aria-label={t("colleges.testPolicy")}>
              <option value="">{t("colleges.anyTestPolicy")}</option>
              {Object.keys(TEST_POLICY).map((k) => (
                <option key={k} value={k}>
                  {t(`colleges.testPolicy.${k}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>,
        )}
      <div className="space-y-2 self-end">
        {p.isUS && checkbox(f.intlAid, (v) => set({ intlAid: v }), t("colleges.aidForIntl"))}
        {p.isUS && checkbox(f.noSupplements, (v) => set({ noSupplements: v }), t("colleges.tag.no_supplements"), false, t("colleges.tag.no_supplements.title"))}
        {p.isUS && checkbox(f.noAppFee, (v) => set({ noAppFee: v }), t("colleges.tag.no_app_fee"), false, t("colleges.tag.no_app_fee.title"))}
        {checkbox(f.english, (v) => set({ english: v }), t("colleges.englishFilter"), !p.hasEnglish, p.hasEnglish ? t("colleges.englishFilterTitle") : t("colleges.englishFilterNoScore"))}
        {!p.hasEnglish && (
          <Link href="/profile" className="block pl-6 text-[13px] font-semibold text-blue-700 underline-offset-4 hover:underline">
            {t("colleges.englishFilterNoScore")}
          </Link>
        )}
      </div>
      {compact && (
        // The open panel fills the narrow sidebar; this closes it and brings the (filtered) list back.
        <button type="button" onClick={() => setOpen(false)} className={`${buttonClass("primary", "sm")} sticky bottom-0 w-full`}>
          {t("colleges.showResults", { n: p.count })}
        </button>
      )}
    </div>
  );

  const moreButton = (
    <button
      type="button"
      aria-expanded={open}
      aria-controls={panelId}
      onClick={() => setOpen((o) => !o)}
      className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition-colors ${open ? "border-ink bg-zinc-100 text-ink" : "border-zinc-300 bg-white text-ink hover:border-zinc-400"}`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M4 6h16M7 12h10M10 18h4" />
      </svg>
      {compact ? t("colleges.filters") : t("colleges.moreFilters")}
      {hidden > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-ink px-1 text-xs tabular-nums text-white">{hidden}</span>}
    </button>
  );

  return (
    <div className="space-y-2.5">
      {compact ? (
        <>
          {search}
          <div className="flex gap-2">
            {moreButton}
            {sortSelect}
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {search}
          {/* Without scores the table already asks for them (title row, Fit column): no third link here. */}
          {p.hasScores && fitChips}
          {fieldSelect}
          {tuitionSelect}
          {moreButton}
        </div>
      )}
      {open && panel}
      {compact ? (
        <ActiveChips {...p} />
      ) : (
        // Sort sits with the result count: it changes the order of what is counted, not which colleges are in it.
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-0 flex-1 pt-1.5">
            <ActiveChips {...p} />
          </div>
          {sortSelect}
        </div>
      )}
    </div>
  );
}

/** The filters that are on, each removable, with the result count and "Clear all". */
function ActiveChips(p: FilterBarProps) {
  const t = useT();
  const { f, set } = p;
  const chips: { key: string; text: string; clear: Partial<ExploreFilters> }[] = [];
  if (f.fit.length) chips.push({ key: "fit", text: `${t("colleges.fitFilter")}: ${FITS.filter((k) => f.fit.includes(k)).map((k) => fitLabel(t, k)).join(", ")}`, clear: { fit: [] } });
  if (f.field) chips.push({ key: "field", text: t("colleges.fieldOffers", { field: t(`match.field.${f.field}` as MessageKey) }), clear: { field: null } });
  if (f.maxTuition != null) chips.push({ key: "max", text: t("colleges.tuitionUnder", { amount: fmtMoneyShort(f.maxTuition, p.currency) }), clear: { maxTuition: null } });
  if (f.admitMin != null || f.admitMax != null)
    chips.push({ key: "admit", text: t("colleges.admitChip", { range: `${f.admitMin ?? 0}–${f.admitMax ?? 100}%` }), clear: { admitMin: null, admitMax: null } });
  if (f.intlAid) chips.push({ key: "aid", text: t("colleges.aidForIntl"), clear: { intlAid: false } });
  if (f.english) chips.push({ key: "eng", text: t("colleges.englishFilter"), clear: { english: false } });
  if (f.noSupplements) chips.push({ key: "nosupp", text: t("colleges.tag.no_supplements"), clear: { noSupplements: false } });
  if (f.noAppFee) chips.push({ key: "nofee", text: t("colleges.tag.no_app_fee"), clear: { noAppFee: false } });
  if (f.category !== "general") {
    const cat = p.lookups.categories.find((c) => c.key === f.category)?.label ?? f.category;
    chips.push({ key: "cat", text: t("colleges.tierOf", { label: cat }), clear: { category: "general", minTier: null } });
  }
  if (f.minTier) chips.push({ key: "tier", text: t("colleges.tierOrBetter", { t: f.minTier }), clear: { minTier: null } });
  if (f.state) chips.push({ key: "state", text: f.state, clear: { state: "" } });
  if (f.testPolicy) chips.push({ key: "test", text: t(`colleges.testPolicy.${f.testPolicy}` as MessageKey), clear: { testPolicy: "" } });
  if (f.plan) chips.push({ key: "plan", text: t("colleges.offersPlan", { plan: p.lookups.plans.find((x) => x.key === f.plan)?.label ?? f.plan }), clear: { plan: "" } });

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]" aria-live="polite">
      <span className="mr-1 text-sm font-semibold tabular-nums text-ink">{t("colleges.resultCount", { n: p.count, total: p.total })}</span>
      {chips.map((c) => (
        <button key={c.key} type="button" onClick={() => set(c.clear)} aria-label={t("colleges.removeFilter", { label: c.text })} className={CHIP_CLASS}>
          {c.text}
          <span aria-hidden="true" className="text-zinc-600">
            ×
          </span>
        </button>
      ))}
      {anyFilter(f) && (
        <button type="button" onClick={() => set(clearFilters(f))} className="ml-1 font-semibold text-blue-700 underline-offset-4 hover:underline">
          {t("colleges.clearAll")}
        </button>
      )}
      {f.field && p.fieldHidden > 0 && <span className="basis-full text-zinc-600">{t("colleges.fieldHidden", { n: p.fieldHidden })}</span>}
    </div>
  );
}
